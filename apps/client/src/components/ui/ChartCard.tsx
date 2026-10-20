import type { ReactNode } from "react";

interface ChartCardProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function ChartCard({ title, description, children }: ChartCardProps) {
  return (
    <section className="min-w-0 rounded-xl border border-line bg-panel p-4 shadow-soft sm:p-5">
      <div className="mb-4">
        <h2 className="break-words text-[0.9375rem] font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
