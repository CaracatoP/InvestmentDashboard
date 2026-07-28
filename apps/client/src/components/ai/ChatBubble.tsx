import type { ReactNode } from "react";

type ChatBubbleProps = {
  role: "user" | "assistant" | "system";
  children: ReactNode;
  timestamp: string;
  grouped?: boolean;
};

export function ChatBubble({ role, children, timestamp, grouped }: ChatBubbleProps) {
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} ${grouped ? "mt-1" : "mt-3"}`}>
      <div
        className={`max-w-[min(42rem,92%)] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm transition-all duration-200 ${
          isUser
            ? "rounded-br-md bg-accent text-black"
            : "rounded-bl-md border border-line bg-elevated text-muted"
        }`}
      >
        {children}
        <p className={`mt-1 text-[10px] ${isUser ? "text-black/55" : "text-muted/80"}`}>{timestamp}</p>
      </div>
    </div>
  );
}
