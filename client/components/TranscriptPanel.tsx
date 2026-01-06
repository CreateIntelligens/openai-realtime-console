import { useEffect, useRef } from "react";

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

  // 自動滾動到最新訊息
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcripts]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b border-gray-200 bg-gray-50">
        <h2 className="text-sm font-semibold text-gray-700">
          {side === "user" ? "USER (Bahasa Indonesia)" : "ASSISTANT (中文回覆)"}
        </h2>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {transcripts.length === 0 ? (
          <p className="text-gray-400 text-center mt-8">等待語音輸入...</p>
        ) : (
          transcripts.map((item, index) => (
            <div key={index} className="flex flex-col">
              <span className="text-xs text-gray-500 mb-1">{item.timestamp}</span>
              <p className="text-base leading-relaxed">{item.text}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
