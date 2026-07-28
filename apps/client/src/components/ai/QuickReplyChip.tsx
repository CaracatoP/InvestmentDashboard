type QuickReplyChipProps = {
  children: string;
  onClick: () => void;
  disabled?: boolean;
};

export function QuickReplyChip({ children, onClick, disabled }: QuickReplyChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-8 items-center rounded-full border border-line bg-panel px-3 text-xs font-medium text-muted transition hover:border-accent/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}
