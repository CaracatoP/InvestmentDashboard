interface ProgressBarProps {
  value: number;
  tone?: "green" | "blue" | "violet" | "amber";
}

const toneClass = {
  green: "bg-accent",
  blue: "bg-aqua",
  violet: "bg-violet",
  amber: "bg-amber"
};

export function ProgressBar({ value, tone = "green" }: ProgressBarProps) {
  const safeValue = Math.min(Math.max(value, 0), 100);

  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-line/80" role="presentation">
      <div className={`h-full rounded-full transition-[width] duration-500 ease-out ${toneClass[tone]}`} style={{ width: `${safeValue}%` }} />
    </div>
  );
}
