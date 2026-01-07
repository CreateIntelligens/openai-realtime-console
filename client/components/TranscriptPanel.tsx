import { useEffect, useRef, useState } from "react";

interface Transcript {
  text: string;
  timestamp: string;
}

interface TranscriptPanelProps {
  transcripts: Transcript[];
  side: "user" | "assistant";
}

export default function TranscriptPanel({ transcripts, side }: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  const isNearBottom = () => {
    if (!scrollRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    return scrollHeight - scrollTop - clientHeight < 100;
  };

  const handleScroll = () => {
    const nearBottom = isNearBottom();
    if (nearBottom) {
      setAutoScroll(true);
      setShowScrollButton(false);
    } else {
      setAutoScroll(false);
      setShowScrollButton(transcripts.length > 0);
    }
  };

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcripts, autoScroll]);

  const scrollToBottom = () => {
    setAutoScroll(true);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const isUser = side === "user";

  return (
    <div className="flex flex-col h-full relative bg-slate-50">
      {/* Header */}
      <div className={`px-4 py-3 border-b ${
        isUser
          ? "bg-gradient-to-r from-emerald-600 to-teal-600 border-emerald-700"
          : "bg-gradient-to-r from-blue-600 to-indigo-600 border-blue-700"
      }`}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-lg">
            {isUser ? "🇮🇩" : "🇹🇼"}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">
              {isUser ? "Bahasa Indonesia" : "中文翻譯"}
            </h2>
            <p className="text-xs text-white/70">
              {isUser ? "使用者輸入" : "系統回覆"}
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-3"
      >
        {transcripts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-3 ${
              isUser ? "bg-emerald-100" : "bg-blue-100"
            }`}>
              <span className="text-3xl">{isUser ? "🎤" : "💬"}</span>
            </div>
            <p className="text-slate-400 text-sm">
              {isUser ? "按住按鈕開始說話..." : "等待翻譯..."}
            </p>
          </div>
        ) : (
          <>
            {transcripts.map((item, index) => (
              <div
                key={index}
                className={`flex ${isUser ? "justify-start" : "justify-end"}`}
              >
                <div className={`max-w-[85%] ${isUser ? "order-1" : "order-1"}`}>
                  <span className={`text-xs text-slate-400 mb-1 block ${isUser ? "text-left" : "text-right"}`}>
                    {item.timestamp}
                  </span>
                  <div
                    className={`px-4 py-3 rounded-2xl shadow-sm ${
                      isUser
                        ? "bg-white border border-slate-200 rounded-tl-sm"
                        : "bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-tr-sm"
                    }`}
                  >
                    <p className={`text-base leading-relaxed ${isUser ? "text-slate-700" : "text-white"}`}>
                      {item.text}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Scroll button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className={`absolute bottom-4 right-4 rounded-full p-2.5 shadow-lg transition-all hover:scale-110 active:scale-95 ${
            isUser
              ? "bg-emerald-500 hover:bg-emerald-600"
              : "bg-blue-500 hover:bg-blue-600"
          }`}
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>
      )}
    </div>
  );
}
