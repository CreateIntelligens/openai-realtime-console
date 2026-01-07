import { useEffect, useRef, useState } from "react";
import { Maximize, Minimize } from "react-feather";
import SessionControls from "./SessionControls";
import TranscriptPanel from "./TranscriptPanel";
import { INSTRUCTIONS, type Mode } from "../config/prompts";

const logo = "/assets/openai-logomark.svg";
const realtimeBaseUrl = "https://api.openai.com/v1/realtime";
const realtimeModel = "gpt-4o-realtime-preview-2024-12-17";

interface Transcript {
  text: string;
  timestamp: string;
}

interface RealtimeEvent {
  type: string;
  event_id?: string;
  timestamp?: string;
  transcript?: string;
  delta?: string;
  text?: string;
  [key: string]: any;
}

type Status = "idle" | "listening" | "processing" | "speaking";

export default function App() {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSwitchingMode, setIsSwitchingMode] = useState(false);
  const isSwitchingModeRef = useRef(false); // 同步追蹤切換狀態
  const [, setEvents] = useState<RealtimeEvent[]>([]);
  const [dataChannel, setDataChannel] = useState<RTCDataChannel | null>(null);
  const [mode, setMode] = useState<Mode>("interpreter");
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const audioElement = useRef<HTMLAudioElement | null>(null);
  const localMediaStream = useRef<MediaStream | null>(null);
  const sessionConfigured = useRef(false);
  const currentAssistantTextRef = useRef("");
  const assistantTranscriptSourceRef = useRef<"audio" | "text" | null>(null);

  // 控制機制：追蹤當前 response，確保一問一答
  const currentResponseId = useRef<string | null>(null);
  const isResponding = useRef(false);

  function waitForIceGatheringComplete(pc: RTCPeerConnection) {
    if (pc.iceGatheringState === "complete") {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const checkState = () => {
        if (pc.iceGatheringState === "complete") {
          pc.removeEventListener("icegatheringstatechange", checkState);
          resolve();
        }
      };
      pc.addEventListener("icegatheringstatechange", checkState);
    });
  }

  // 逐字稿狀態
  const [userTranscripts, setUserTranscripts] = useState<Transcript[]>([]);
  const [assistantTranscripts, setAssistantTranscripts] = useState<Transcript[]>([]);
  const [currentAssistantText, setCurrentAssistantText] = useState("");

  async function startSession() {
    console.log("[realtime] startSession called, isSessionActive:", isSessionActive, "isSwitchingMode:", isSwitchingMode);
    
    // 允許在切換模式時重新連線，即使 isConnecting 為 true
    if (isSessionActive && !isSwitchingMode) {
      console.log("[realtime] session already active and not switching, returning");
      return;
    }
    
    setIsConnecting(true);
    console.log("[realtime] startSession proceeding...");
    try {
      // Get a session token for OpenAI Realtime API
      const tokenResponse = await fetch("/token");
      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.log("[realtime] token error", errorText);
        throw new Error(`Token request failed (${tokenResponse.status})`);
      }
      const data = await tokenResponse.json();
      const EPHEMERAL_KEY = data?.client_secret?.value ?? data?.value;
      if (!EPHEMERAL_KEY) {
        console.log("[realtime] token payload missing client_secret", data);
        throw new Error("Token response missing client_secret.value");
      }
      console.log("[realtime] token received");
      const model = typeof data?.model === "string" ? data.model : realtimeModel;

      // Create a peer connection
      const pc = new RTCPeerConnection();

      // Set up to play remote audio from the model
      audioElement.current = document.createElement("audio");
      audioElement.current.autoplay = true;
      pc.ontrack = (e) => {
        if (audioElement.current) {
          audioElement.current.srcObject = e.streams[0];
        }
      };

      // Add local audio track for microphone input in the browser
      const ms = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      localMediaStream.current = ms;

      // 預設靜音，需要按住才會錄音
      ms.getAudioTracks().forEach(track => {
        track.enabled = false;
      });
      setIsMicMuted(true);

      pc.addTrack(ms.getTracks()[0], ms);

      // Set up data channel for sending and receiving events
      const dc = pc.createDataChannel("oai-events");
      setDataChannel(dc);

      // Start the session using the Session Description Protocol (SDP)
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGatheringComplete(pc);

      console.log("[realtime] negotiating SDP", { model });
      const localSdp = pc.localDescription?.sdp || offer.sdp;
      const sdpResponse = await fetch(`${realtimeBaseUrl}?model=${model}`, {
        method: "POST",
        body: localSdp,
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`,
          "Content-Type": "application/sdp",
          "OpenAI-Beta": "realtime=v1",
        },
      });

      if (!sdpResponse.ok) {
        const errorText = await sdpResponse.text();
        console.log("[realtime] SDP error", errorText);
        throw new Error(`SDP request failed (${sdpResponse.status})`);
      }

      const sdp = await sdpResponse.text();
      const answer: RTCSessionDescriptionInit = { type: "answer", sdp };
      await pc.setRemoteDescription(answer);

      peerConnection.current = pc;
      console.log("[realtime] session started");
    } catch (err) {
      console.error("[realtime] failed to start session", err);
      setIsConnecting(false);
    }
  }

  // Stop current session, clean up peer connection and data channel
  function stopSession() {
    sessionConfigured.current = false;
    currentAssistantTextRef.current = "";

    // 重置控制狀態
    isResponding.current = false;
    currentResponseId.current = null;
    console.log("[control] session stopped, control state reset");

    if (dataChannel) {
      dataChannel.close();
    }

    peerConnection.current?.getSenders().forEach((sender) => {
      if (sender.track) {
        sender.track.stop();
      }
    });

    if (localMediaStream.current) {
        localMediaStream.current.getTracks().forEach(track => track.stop());
        localMediaStream.current = null;
    }

    if (peerConnection.current) {
      peerConnection.current.close();
    }

    setIsSessionActive(false);
    setDataChannel(null);
    peerConnection.current = null;
  }

  // Send a message to the model
  function sendClientEvent(message: RealtimeEvent) {
    if (dataChannel) {
      const timestamp = new Date().toLocaleTimeString();
      message.event_id = message.event_id || crypto.randomUUID();

      // send event before setting timestamp since the backend peer doesn't expect this field
      dataChannel.send(JSON.stringify(message));
      console.log("[realtime] send", message.type);

      // if guard just in case the timestamp exists by miracle
      if (!message.timestamp) {
        message.timestamp = timestamp;
      }
      setEvents((prev) => [message, ...prev]);
    } else {
      console.error(
        "Failed to send message - no data channel available",
        message,
      );
    }
  }

  // Send a text message to the model
  function sendTextMessage(message: string) {
    const event: RealtimeEvent = {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: message,
          },
        ],
      },
    };

    sendClientEvent(event);
    requestAssistantResponse();

    // Manually add to transcript for immediate feedback
    setUserTranscripts((prev) => [
      ...prev,
      { text: message, timestamp: new Date().toLocaleTimeString() },
    ]);
  }

  function requestAssistantResponse() {
    const requestId = crypto.randomUUID().slice(0, 8);
    console.log(`[control] ⚡ requesting response #${requestId}, mode=${mode}`);
    sendClientEvent({
      type: "response.create",
      response: {
        modalities: ["text", "audio"],
        // 不限制 token，讓翻譯自然完整
      },
    });
  }

  // 取消 response（強制停止 LLM）
  function cancelResponse(responseId: string) {
    console.log("[control] canceling response", responseId);
    sendClientEvent({
      type: "response.cancel",
    });
  }

  // 更新 session 模式
  function updateSessionMode(newMode: Mode) {
    const sessionUpdate = {
      type: "session.update",
      session: {
        instructions: INSTRUCTIONS[newMode],
        voice: "sage",
        input_audio_transcription: {
          model: "whisper-1",
          language: "id", // 印尼語 ISO-639-1，提高辨識準確度
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          silence_duration_ms: 1200, // 1.2秒靜音才觸發
          prefix_padding_ms: 300,
        },
      },
    };
    sendClientEvent(sessionUpdate);
  }

  // 切換模式 (指定模式)
  async function handleModeChange(targetMode: Mode) {
    if (mode === targetMode) return;
    
    console.log("[mode] handleModeChange called, target:", targetMode, "current:", mode);
    setMode(targetMode);

    // 如果 session 正在運行，停止並重新啟動以清空對話歷史
    if (isSessionActive) {
      isSwitchingModeRef.current = true; // 同步設定
      setIsSwitchingMode(true);
      console.log("[mode] switching to", targetMode, "- restarting session");
      
      // 超時保護：5秒後強制解除切換狀態
      const timeout = setTimeout(() => {
        console.error("[mode] switch timeout! Force reset.");
        isSwitchingModeRef.current = false;
        setIsSwitchingMode(false);
      }, 5000);
      
      stopSession();
      console.log("[mode] stopSession completed, waiting 500ms...");
      // 等待一小段時間確保完全停止
      await new Promise(resolve => setTimeout(resolve, 500));
      console.log("[mode] wait completed, calling startSession()...");
      try {
        await startSession();
        console.log("[mode] startSession completed successfully");
        clearTimeout(timeout);
        isSwitchingModeRef.current = false; // 完成後清除
      } catch (err) {
        console.error("[mode] failed to restart session:", err);
        clearTimeout(timeout);
        isSwitchingModeRef.current = false;
        setIsSwitchingMode(false);
      }
    } else {
      console.log("[mode] session not active, just updating mode");
    }
  }

  function toggleFullScreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().then(() => setIsFullScreen(true));
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen().then(() => setIsFullScreen(false));
        }
    }
  }

  // 監聽全螢幕變化 (例如按 Esc 退出)
  useEffect(() => {
    const handleFullscreenChange = () => {
        setIsFullScreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // 自動啟動 session（頁面載入時）
  useEffect(() => {
    console.log("[auto-start] initializing session on page load");
    startSession().catch((err) => {
      console.error("[auto-start] failed to start session:", err);
    });
  }, []);

  function handleMute(mute: boolean) {
    if (localMediaStream.current) {
        localMediaStream.current.getAudioTracks().forEach(track => {
            track.enabled = !mute;
        });
        setIsMicMuted(mute);

        // 同步更新狀態指示燈
        setStatus(currentStatus => {
          if (currentStatus === "processing" || currentStatus === "speaking") {
            return currentStatus;
          }
          return "idle";
        });
    }
  }

  // 清除逐字稿
  function clearTranscripts() {
    setUserTranscripts([]);
    setAssistantTranscripts([]);
    setCurrentAssistantText("");
    currentAssistantTextRef.current = "";

    // 重置控制狀態
    isResponding.current = false;
    currentResponseId.current = null;
    console.log("[control] transcripts cleared, control state reset");
  }

  // 重新連線
  async function reconnect() {
    console.log("[reconnect] restarting session");
    stopSession();
    await new Promise(resolve => setTimeout(resolve, 500));
    await startSession();
  }

  // Attach event listeners to the data channel when a new one is created
  useEffect(() => {
    if (!dataChannel) return;

    const handleMessage = (e: MessageEvent) => {
      const event: RealtimeEvent = JSON.parse(e.data);
      if (!event.timestamp) {
        event.timestamp = new Date().toLocaleTimeString();
      }

      console.log("[realtime] event", event.type, event);
      setEvents((prev) => [event, ...prev]);

      // 更新狀態指示燈
      updateStatus(event);

      // 處理逐字稿事件
      handleTranscriptEvent(event);
    };

    const handleOpen = () => {
      if (sessionConfigured.current) return;
      sessionConfigured.current = true;

      setIsSessionActive(true);
      setIsConnecting(false);
      setIsSwitchingMode(false);
      setEvents([]);
      setUserTranscripts([]);
      setAssistantTranscripts([]);

      setCurrentAssistantText("");
      currentAssistantTextRef.current = "";

      // 配置 session：啟用逐字稿和設定指令
      updateSessionMode(mode);
      console.log("[realtime] session.update sent with mode:", mode);
    };

    dataChannel.addEventListener("message", handleMessage);
    dataChannel.addEventListener("open", handleOpen);
    if (dataChannel.readyState === "open") {
      handleOpen();
    }

    return () => {
      dataChannel.removeEventListener("message", handleMessage);
      dataChannel.removeEventListener("open", handleOpen);
    };
  }, [dataChannel]);

  // 更新狀態指示燈
  function updateStatus(event: RealtimeEvent) {
    // 使用者開始說話
    if (event.type === "input_audio_buffer.speech_started") {
      console.log("[VAD] speech started");
      setStatus("listening");
    }
    // 使用者停止說話，開始處理
    else if (event.type === "input_audio_buffer.speech_stopped") {
      console.log("[VAD] speech stopped");
      setStatus("processing");
    }
    // AI 開始回覆
    else if (event.type === "response.audio.delta" || event.type === "response.audio_transcript.delta") {
      setStatus("speaking");
    }
    // AI 回覆完成
    else if (event.type === "response.audio.done" || event.type === "response.done") {
      // 回覆完成後，根據麥克風狀態決定下一個狀態
      // 如果麥克風是靜音的，保持 idle；否則回到 listening
      setStatus((prevStatus) => {
        // 只有在回覆中才改變狀態，避免覆蓋其他狀態
        if (prevStatus === "speaking") {
          return isMicMuted ? "idle" : "listening";
        }
        return prevStatus;
      });
    }
    // Session 開始 - 不自動設為 listening，保持 idle 直到用戶按住說話
    else if (event.type === "session.created" || event.type === "session.updated") {
      // 不做任何事，保持當前狀態（應該是 idle）
    }
  }

  // 處理逐字稿事件
  function handleTranscriptEvent(event: RealtimeEvent) {
    const timestamp = event.timestamp || new Date().toLocaleTimeString();

    // User 印尼語逐字稿完成
    // 只處理 input_audio_transcription.completed 避免重複
    if (event.type === "conversation.item.input_audio_transcription.completed") {
      const transcript = event.transcript || "";
      if (transcript) {
        console.log("[transcript] user completed", transcript);
        setUserTranscripts((prev) => [
          ...prev,
          { text: transcript, timestamp },
        ]);

        // 【控制機制】只在口譯模式下執行一問一答控制
        if (mode === "interpreter") {
          console.log("[control] user input received, preparing response control");
          currentResponseId.current = null; // 重置，允許新的第一個 response
          isResponding.current = false;
        }

        requestAssistantResponse();
      }
    }

    // 【控制機制】追蹤 response 開始
    if (event.type === "response.created") {
      const responseId = event.response?.id || event.event_id || "";

      // 口譯模式下，嚴格執行一問一答
      if (mode === "interpreter") {
        console.log("[control] response.created", responseId, "currentId:", currentResponseId.current);

        // 如果這是第一個 response，記錄並允許
        if (!currentResponseId.current) {
          console.log("[control] ✓ First response, allowing:", responseId);
          currentResponseId.current = responseId;
          isResponding.current = true;
        }
        // 如果已經有 response 在進行中或已完成，立即取消這個新的
        else {
          console.log("[control] ✗ BLOCKING second response! Canceling:", responseId);
          // 立即發送取消指令
          sendClientEvent({
            type: "response.cancel",
          });
          return;
        }
      } else {
        console.log("[control] response.created (Q&A mode)", responseId);
      }
    }

    // Assistant 中文逐字稿 streaming
    if (
      event.type === "response.audio_transcript.delta" ||
      event.type === "response.text.delta" ||
      event.type === "response.output_audio_transcript.delta" ||
      event.type === "response.output_text.delta"
    ) {
      const source =
        event.type === "response.audio_transcript.delta" ||
        event.type === "response.output_audio_transcript.delta"
          ? "audio"
          : "text";
      if (
        assistantTranscriptSourceRef.current &&
        assistantTranscriptSourceRef.current !== source
      ) {
        return;
      }
      assistantTranscriptSourceRef.current = source;
      const delta =
        event.delta ||
        event.response?.audio_transcript?.delta ||
        event.response?.text?.delta ||
        event.output_audio_transcript?.delta ||
        event.output_text?.delta ||
        "";
      if (delta) {
        console.log("[transcript] assistant delta:", delta);
        setCurrentAssistantText((prev) => {
          const next = prev + delta;
          currentAssistantTextRef.current = next;
          return next;
        });
      }
    }

    // 【控制機制】Assistant 回覆完成，重置狀態
    if (event.type === "response.done") {
      const responseId = event.response?.id || "";
      console.log("[control] response.done", responseId);

      // 口譯模式：第一個 response 完成後，標記為完成但不重置 currentResponseId
      // 這樣可以阻止後續的 response
      if (mode === "interpreter") {
        isResponding.current = false;
        // 注意：不重置 currentResponseId，保持阻擋狀態
        console.log("[control] First response finished, will block any new responses");
      }
    }

    // Assistant 中文逐字稿完成
    if (
      event.type === "response.audio_transcript.done" ||
      event.type === "response.text.done" ||
      event.type === "response.output_audio_transcript.done" ||
      event.type === "response.output_text.done"
    ) {
      const source =
        event.type === "response.audio_transcript.done" ||
        event.type === "response.output_audio_transcript.done"
          ? "audio"
          : "text";
      if (
        assistantTranscriptSourceRef.current &&
        assistantTranscriptSourceRef.current !== source
      ) {
        return;
      }
      assistantTranscriptSourceRef.current = source;
      const transcript =
        event.transcript ||
        event.text ||
        event.response?.audio_transcript?.text ||
        event.response?.text?.text ||
        event.output_audio_transcript?.text ||
        event.output_text?.text ||
        currentAssistantTextRef.current;
      if (transcript) {
        console.log("[transcript] assistant done:", transcript);
        setAssistantTranscripts((prev) => [
          ...prev,
          { text: transcript, timestamp },
        ]);
        setCurrentAssistantText("");
        currentAssistantTextRef.current = "";
        assistantTranscriptSourceRef.current = null;
      }
    }
  }

  return (
    <>
      <nav className="absolute top-0 left-0 right-0 h-14 flex items-center z-10 bg-white border-b border-slate-200 shadow-sm">
        <div className="flex items-center gap-3 w-full px-4">
          <img style={{ width: "24px" }} src={logo} />
          <h1 className="text-base font-semibold text-slate-800 hidden sm:block">
            印尼語即時翻譯
          </h1>

          {/* Status indicator */}
          {isSessionActive && (
            <div className="flex items-center gap-3 px-6 py-2 rounded-full bg-slate-100 shadow-sm border border-slate-200">
              <div
                className={`w-4 h-4 rounded-full ${
                  status === "listening"
                    ? "bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                    : status === "processing"
                    ? "bg-amber-500 animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                    : status === "speaking"
                    ? "bg-blue-500 animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                    : "bg-slate-400"
                }`}
              />
              <span className="text-lg font-bold text-slate-700">
                {status === "listening"
                  ? "聆聽中"
                  : status === "processing"
                  ? "處理中"
                  : status === "speaking"
                  ? "回覆中"
                  : "待機"}
              </span>
            </div>
          )}

          <div className="ml-auto flex items-center gap-3">
            <div className="flex bg-slate-200 rounded-full p-1.5 border border-slate-300 shadow-inner">
              <button
                onClick={() => handleModeChange("interpreter")}
                className={`px-5 py-2 rounded-full text-base font-bold transition-all ${
                  mode === "interpreter"
                    ? "bg-white text-emerald-600 shadow-md ring-1 ring-black/5"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                }`}
              >
                口譯模式
              </button>
              <button
                onClick={() => handleModeChange("qa")}
                className={`px-5 py-2 rounded-full text-base font-bold transition-all ${
                  mode === "qa"
                    ? "bg-white text-blue-600 shadow-md ring-1 ring-black/5"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                }`}
              >
                問答模式
              </button>
            </div>
            
            <button
              onClick={toggleFullScreen}
              className="p-3 rounded-full text-slate-500 hover:bg-slate-100 transition-colors ml-2"
              title="全螢幕"
            >
              {isFullScreen ? <Minimize size={24} /> : <Maximize size={24} />}
            </button>
          </div>
        </div>
      </nav>

      <main className="absolute top-14 left-0 right-0 bottom-0 flex flex-col bg-slate-100">
        {/* Chat transcript area */}
        <section className="flex-1 flex overflow-hidden">
          {/* Left panel: User Indonesian */}
          <div className="flex-1 overflow-hidden border-r border-slate-200">
            <TranscriptPanel transcripts={userTranscripts} side="user" />
          </div>

          {/* Right panel: Assistant Chinese */}
          <div className="flex-1 overflow-hidden">
            <TranscriptPanel
              transcripts={[
                ...assistantTranscripts,
                ...(currentAssistantText ? [{
                  text: currentAssistantText + "▌",
                  timestamp: "輸入中..."
                }] : [])
              ]}
              side="assistant"
            />
          </div>
        </section>

        {/* Control panel */}
        <section className="h-44 shrink-0">
          <SessionControls
            startSession={startSession}
            sendTextMessage={sendTextMessage}
            isSessionActive={isSessionActive}
            isConnecting={isConnecting}
            isSwitchingMode={isSwitchingMode}
            onReconnect={reconnect}
            onClear={clearTranscripts}
            setMuted={handleMute}
            isMuted={isMicMuted}
          />
        </section>
      </main>
    </>
  );
}
