import { useState } from "react";
import { MessageSquare, RotateCw, Trash2, Mic } from "react-feather";

interface SessionStoppedProps {
  startSession: () => void;
  isConnecting: boolean;
}

function SessionStopped({ startSession, isConnecting }: SessionStoppedProps) {
  const [isActivating, setIsActivating] = useState(false);

  function handleStartSession() {
    if (isActivating || isConnecting) return;
    setIsActivating(true);
    startSession();
  }

  // 如果是外部傳入的 isConnecting 或內部點擊後的 isActivating，都顯示連線中
  const loading = isConnecting || isActivating;

  // 如果正在自動連線中，我們可以選擇隱藏按鈕，或者顯示一個不可點擊的狀態
  // 這裡選擇顯示一個不可點擊的 "連線中..." 狀態，讓使用者知道發生了什麼
  
  return (
    <div className="flex items-center justify-center w-full h-full">
      <button
        onClick={handleStartSession}
        disabled={loading}
        className="flex items-center gap-4 px-10 py-5 rounded-full text-xl font-bold text-white transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 shadow-lg"
        style={{
          background: loading
            ? "linear-gradient(135deg, #94a3b8 0%, #64748b 100%)"
            : "linear-gradient(135deg, #10b981 0%, #059669 100%)",
        }}
      >
        <Mic size={32} className={loading ? "animate-pulse" : ""} />
        <span>{loading ? "連線中..." : "開始對話"}</span>
      </button>
    </div>
  );
}

interface SessionActiveProps {
  sendTextMessage: (message: string) => void;
  onReconnect: () => void;
  onClear: () => void;
  setMuted: (muted: boolean) => void;
  isMuted: boolean;
}

function SessionActive({
  sendTextMessage,
  onReconnect,
  onClear,
  setMuted,
  isMuted
}: SessionActiveProps) {
  const [message, setMessage] = useState("");

  function handleSendMessage() {
    if (message.trim()) {
      sendTextMessage(message);
      setMessage("");
    }
  }

  return (
    <div className="flex flex-col items-center justify-center w-full h-full gap-4 px-4 py-3">
      {/* Main push-to-talk button */}
      <button
        onMouseDown={() => setMuted(false)}
        onMouseUp={() => setMuted(true)}
        onMouseLeave={() => setMuted(true)}
        onTouchStart={() => setMuted(false)}
        onTouchEnd={() => setMuted(true)}
        className={`relative flex items-center gap-3 px-10 py-5 rounded-full text-xl font-bold transition-all touch-manipulation select-none shadow-xl ${
          !isMuted
            ? "text-white scale-105"
            : "text-slate-600 hover:bg-slate-200"
        }`}
        style={{
          background: !isMuted
            ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
            : "linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)",
          boxShadow: !isMuted
            ? "0 10px 40px rgba(16, 185, 129, 0.4)"
            : "0 4px 20px rgba(0, 0, 0, 0.1)",
        }}
      >
        <Mic size={28} className={!isMuted ? "animate-pulse" : ""} />
        <span>{!isMuted ? "說話中..." : "按住說話"}</span>

        {/* Pulse ring when speaking */}
        {!isMuted && (
          <span className="absolute inset-0 rounded-full animate-ping bg-emerald-400 opacity-30" />
        )}
      </button>

      {/* Text input row */}
      <div className="flex items-center gap-3 w-full max-w-3xl">
        <input
          type="text"
          placeholder="或輸入文字..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
          className="flex-1 px-6 py-4 rounded-full border-2 border-slate-200 bg-white text-lg text-slate-700 placeholder-slate-400 focus:border-emerald-500 focus:outline-none transition-colors shadow-sm"
        />
        <button
          onClick={handleSendMessage}
          className="p-4 rounded-full bg-emerald-500 text-white hover:bg-emerald-600 active:scale-95 transition-all shadow-md"
          title="傳送"
        >
          <MessageSquare size={24} />
        </button>
        <button
          onClick={onReconnect}
          className="p-4 rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 active:scale-95 transition-all shadow-sm"
          title="重新連線"
        >
          <RotateCw size={24} />
        </button>
        <button
          onClick={onClear}
          className="p-4 rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 active:scale-95 transition-all shadow-sm"
          title="清除"
        >
          <Trash2 size={24} />
        </button>
      </div>
    </div>
  );
}

interface SessionControlsProps {
  startSession: () => void;
  sendTextMessage: (message: string) => void;
  isSessionActive: boolean;
  isConnecting: boolean;
  isSwitchingMode: boolean;
  onReconnect: () => void;
  onClear: () => void;
  setMuted: (muted: boolean) => void;
  isMuted: boolean;
}

export default function SessionControls({
  startSession,
  sendTextMessage,
  isSessionActive,
  isConnecting,
  isSwitchingMode,
  onReconnect,
  onClear,
  setMuted,
  isMuted,
}: SessionControlsProps) {
  if (isSwitchingMode) {
    return (
      <div className="h-full bg-white border-t border-slate-200 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500">
          <RotateCw className="animate-spin" size={24} />
          <span className="text-lg font-medium">切換模式中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-white border-t border-slate-200">
      {isSessionActive ? (
        <SessionActive
          sendTextMessage={sendTextMessage}
          onReconnect={onReconnect}
          onClear={onClear}
          setMuted={setMuted}
          isMuted={isMuted}
        />
      ) : (
        <SessionStopped startSession={startSession} isConnecting={isConnecting} />
      )}
    </div>
  );
}
