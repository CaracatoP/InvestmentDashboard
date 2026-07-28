import { Bot, Loader2 } from "lucide-react";

type TypingIndicatorProps = {
  label?: string;
};

export function TypingIndicator({ label = "Pensando..." }: TypingIndicatorProps) {
  return (
    <div className="flex justify-start">
      <div className="inline-flex max-w-[min(34rem,92%)] items-center gap-2 rounded-2xl rounded-bl-md border border-line bg-elevated px-3 py-2 text-xs text-muted shadow-sm">
        <Bot size={14} className="text-accent" />
        <span>{label}</span>
        <Loader2 size={13} className="animate-spin text-accent" />
      </div>
    </div>
  );
}
