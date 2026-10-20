import type { ReactNode } from "react";
import { ValueDisplay } from "./ValueDisplay";

interface StatCardProps {
  label: string;
  value: string;
  detail?: string;
  icon: ReactNode;
  tone?: "green" | "blue" | "violet" | "amber" | "rose";
  /** "plain" drops the card frame so the metric can sit inside a shared panel. */
  variant?: "card" | "plain";
}

const toneClass = {
  green: "text-accent",
  blue: "text-aqua",
  violet: "text-violet",
  amber: "text-amber",
  rose: "text-rose"
};

export function StatCard({ label, value, detail, icon, tone = "green", variant = "card" }: StatCardProps) {
  const frame = variant === "card" ? "rounded-xl border border-line bg-panel p-4 shadow-soft sm:p-5" : "p-4 sm:p-5";

  return (
    <article className={`stat-card min-w-0 ${frame}`}>
      <p className="flex min-w-0 items-start gap-2 text-sm leading-5 text-muted">
        <span className={`mt-0.5 shrink-0 [&>svg]:h-4 [&>svg]:w-4 ${toneClass[tone]}`} aria-hidden="true">{icon}</span>
        <span className="min-w-0 break-words">{label}</span>
      </p>
      <p className="mt-2.5 min-w-0 font-semibold tracking-tight text-ink">
        <ValueDisplay value={value} size="card" />
      </p>
      {detail ? <p className="mt-1.5 min-w-0 break-words text-xs leading-5 text-muted" title={detail}>{detail}</p> : null}
    </article>
  );
}
