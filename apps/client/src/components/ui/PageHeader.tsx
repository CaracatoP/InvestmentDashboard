import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-5 flex min-w-0 flex-col gap-4 md:mb-6 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0 max-w-2xl">
        {eyebrow ? <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-accent">{eyebrow}</p> : null}
        <h1 className="break-words text-[clamp(1.35rem,5vw,1.875rem)] font-semibold tracking-normal text-ink">{title}</h1>
        {description ? <p className="mt-2 text-sm leading-6 text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">{actions}</div> : null}
    </div>
  );
}
