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
    <div className="h-2 overflow-hidden rounded-full bg-line">
      <div className={`h-full rounded-full ${toneClass[tone]}`} style={{ width: `${safeValue}%` }} />
    </div>
  );
}
