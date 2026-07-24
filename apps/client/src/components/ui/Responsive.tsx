import type { ReactNode } from "react";

interface MobileDataCardProps {
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}

export function MobileDataCard({ title, subtitle, badge, children, actions }: MobileDataCardProps) {
  return (
    <article className="min-w-0 rounded-lg border border-line bg-panel p-4 shadow-soft">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="break-words font-semibold text-ink">{title}</div>
          {subtitle ? <div className="mt-1 break-words text-sm text-muted">{subtitle}</div> : null}
        </div>
        {badge ? <div className="shrink-0 text-right text-xs text-muted">{badge}</div> : null}
      </div>
      <div className="mt-4 min-w-0">{children}</div>
      {actions ? <div className="mt-4 flex flex-wrap gap-2">{actions}</div> : null}
    </article>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-line bg-elevated p-6 text-sm text-muted">{children}</div>;
}

export function ResponsiveGrid({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5 ${className}`}>{children}</section>;
}
