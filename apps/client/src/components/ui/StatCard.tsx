import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string;
  detail?: string;
  icon: ReactNode;
  tone?: "green" | "blue" | "violet" | "amber" | "rose";
}

const toneClass = {
  green: "text-accent bg-accent/10",
  blue: "text-aqua bg-aqua/10",
  violet: "text-violet bg-violet/10",
  amber: "text-amber bg-amber/10",
  rose: "text-rose bg-rose/10"
};

export function StatCard({ label, value, detail, icon, tone = "green" }: StatCardProps) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
      className="min-w-0 rounded-lg border border-line bg-panel p-4 shadow-soft motion-reduce:transform-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">{label}</p>
          <p className="mt-2 break-words text-[clamp(1.05rem,4.5vw,1.25rem)] font-semibold tracking-normal text-ink [overflow-wrap:anywhere]">{value}</p>
        </div>
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${toneClass[tone]}`}>{icon}</div>
      </div>
      {detail ? <p className="mt-3 break-words text-xs text-muted">{detail}</p> : null}
    </motion.article>
  );
}
