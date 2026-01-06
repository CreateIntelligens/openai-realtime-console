import { useEffect, useRef, useState } from "react";
import SessionControls from "./SessionControls";
import TranscriptPanel from "./TranscriptPanel";

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

export default function App() {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [dataChannel, setDataChannel] = useState<RTCDataChannel | null>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const audioElement = useRef<HTMLAudioElement | null>(null);
  const sessionConfigured = useRef(false);
  const currentAssistantTextRef = useRef("");

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
    console.log("[realtime] startSession");
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
    pc.addTrack(ms.getTracks()[0], ms);

    // Set up data channel for sending and receiving events
    const dc = pc.createDataChannel("oai-events");
    setDataChannel(dc);

    // Start the session using the Session Description Protocol (SDP)
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGatheringComplete(pc);

    console.log("[realtime] negotiating SDP", { model: realtimeModel });
    const localSdp = pc.localDescription?.sdp || offer.sdp;
    const sdpResponse = await fetch(`${realtimeBaseUrl}?model=${realtimeModel}`, {
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
  }

  // Stop current session, clean up peer connection and data channel
  function stopSession() {
    sessionConfigured.current = false;
    currentAssistantTextRef.current = "";
    if (dataChannel) {
      dataChannel.close();
    }

    peerConnection.current?.getSenders().forEach((sender) => {
      if (sender.track) {
        sender.track.stop();
      }
    });

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
  }

  function requestAssistantResponse() {
    sendClientEvent({
      type: "response.create",
      response: {
        modalities: ["text", "audio"],
      },
    });
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

      // 處理逐字稿事件
      handleTranscriptEvent(event);
    };

    const handleOpen = () => {
      if (sessionConfigured.current) return;
      sessionConfigured.current = true;

      setIsSessionActive(true);
      setEvents([]);
      setUserTranscripts([]);
      setAssistantTranscripts([]);
      setCurrentAssistantText("");
      currentAssistantTextRef.current = "";

      // 配置 session：啟用逐字稿和設定指令
      const sessionUpdate = {
        type: "session.update",
        session: {
          instructions: "你是一位專業的口譯員。使用者會用印尼語（Bahasa Indonesia）向你提問，你必須用繁體中文回答。請保持專業、清晰、友善的態度。",
          voice: "sage",
          input_audio_transcription: {
            model: "whisper-1",
          },
          turn_detection: {
            type: "server_vad",
          },
        },
      };
      sendClientEvent(sessionUpdate);
      console.log("[realtime] session.update sent");
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

  // 處理逐字稿事件
  function handleTranscriptEvent(event: RealtimeEvent) {
    const timestamp = event.timestamp || new Date().toLocaleTimeString();

    // User 印尼語逐字稿完成
    if (
      event.type === "conversation.item.input_audio_transcription.completed" ||
      event.type === "conversation.item.created" ||
      event.type === "conversation.item.updated"
    ) {
      const content = Array.isArray(event.item?.content) ? event.item?.content : [];
      const contentTranscript =
        content.find((item: any) => typeof item?.transcript === "string")?.transcript ||
        content.find((item: any) => typeof item?.text === "string")?.text;
      const transcript =
        event.transcript ||
        event.item?.input_audio_transcription?.transcript ||
        contentTranscript ||
        event.item?.input_audio_transcription?.text ||
        "";
      if (transcript) {
        console.log("[transcript] user completed", transcript);
        setUserTranscripts((prev) => [
          ...prev,
          { text: transcript, timestamp },
        ]);
        requestAssistantResponse();
      }
    }

    // Assistant 中文逐字稿 streaming
    if (
      event.type === "response.audio_transcript.delta" ||
      event.type === "response.text.delta" ||
      event.type === "response.output_audio_transcript.delta" ||
      event.type === "response.output_text.delta"
    ) {
      const delta =
        event.delta ||
        event.response?.audio_transcript?.delta ||
        event.response?.text?.delta ||
        event.output_audio_transcript?.delta ||
        event.output_text?.delta ||
        "";
      if (delta) {
        setCurrentAssistantText((prev) => {
          const next = prev + delta;
          currentAssistantTextRef.current = next;
          return next;
        });
      }
    }

    // Assistant 中文逐字稿完成
    if (
      event.type === "response.audio_transcript.done" ||
      event.type === "response.text.done" ||
      event.type === "response.output_audio_transcript.done" ||
      event.type === "response.output_text.done"
    ) {
      const transcript =
        event.transcript ||
        event.text ||
        event.response?.audio_transcript?.text ||
        event.response?.text?.text ||
        event.output_audio_transcript?.text ||
        event.output_text?.text ||
        currentAssistantTextRef.current;
      if (transcript) {
        console.log("[transcript] assistant done", transcript);
        setAssistantTranscripts((prev) => [
          ...prev,
          { text: transcript, timestamp },
        ]);
        setCurrentAssistantText("");
        currentAssistantTextRef.current = "";
      }
    }
  }

  return (
    <>
      <nav className="absolute top-0 left-0 right-0 h-16 flex items-center bg-white border-b border-gray-200">
        <div className="flex items-center gap-4 w-full mx-4">
          <img style={{ width: "24px" }} src={logo} />
          <h1 className="text-lg font-semibold">印尼勞工即時翻譯系統</h1>
        </div>
      </nav>

      <main className="absolute top-16 left-0 right-0 bottom-0 flex flex-col">
        {/* 上半部：左右分欄逐字稿 */}
        <section className="flex-1 flex border-b border-gray-200">
          {/* 左側：User 印尼語 */}
          <div className="flex-1 border-r border-gray-200">
            <TranscriptPanel transcripts={userTranscripts} side="user" />
          </div>

          {/* 右側：Assistant 中文 */}
          <div className="flex-1">
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

        {/* 下半部：控制面板 */}
        <section className="h-32 p-4 bg-gray-50">
          <SessionControls
            startSession={startSession}
            stopSession={stopSession}
            sendClientEvent={sendClientEvent}
            sendTextMessage={sendTextMessage}
            serverEvents={events}
            isSessionActive={isSessionActive}
          />
        </section>
      </main>
    </>
  );
}
