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

  // 檢查是否在底部附近（100px 內）
  const isNearBottom = () => {
    if (!scrollRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    return scrollHeight - scrollTop - clientHeight < 100;
  };

  // 處理滾動事件
  const handleScroll = () => {
    const nearBottom = isNearBottom();

    // 如果使用者滾到底部附近，啟用自動滾動
    if (nearBottom) {
      setAutoScroll(true);
      setShowScrollButton(false);
    } else {
      // 使用者往上滾，停用自動滾動
      setAutoScroll(false);
      setShowScrollButton(transcripts.length > 0);
    }
  };

  // 自動滾動到最新訊息（只在 autoScroll 啟用時）
  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcripts, autoScroll]);

  // 手動滾動到底部
  const scrollToBottom = () => {
    setAutoScroll(true);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="flex flex-col h-full relative">
      <div className="px-4 py-2 border-b border-gray-200 bg-gray-50">
        <h2 className="text-sm font-semibold text-gray-700">
          {side === "user" ? "USER (Bahasa Indonesia)" : "ASSISTANT (中文回覆)"}
        </h2>
      </div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth"
      >
        {transcripts.length === 0 ? (
          <p className="text-gray-400 text-center mt-8">等待語音輸入...</p>
        ) : (
          <>
            {transcripts.map((item, index) => (
              <div key={index} className="flex flex-col">
                <span className="text-xs text-gray-500 mb-1">{item.timestamp}</span>
                <p className="text-base leading-relaxed">{item.text}</p>
              </div>
            ))}
            {/* 底部錨點，用於自動滾動 */}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* 回到最新按鈕 */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 bg-blue-500 hover:bg-blue-600 text-white rounded-full p-3 shadow-lg transition-all duration-200 hover:scale-110 z-10"
          aria-label="回到最新訊息"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
