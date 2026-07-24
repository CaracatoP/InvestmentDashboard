import type { ReactNode } from "react";

interface ChartCardProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function ChartCard({ title, description, children }: ChartCardProps) {
  return (
    <section className="min-w-0 rounded-lg border border-line bg-panel p-3 shadow-soft sm:p-4">
      <div className="mb-4">
        <h2 className="break-words text-base font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
