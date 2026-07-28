import { ChevronDown } from "lucide-react";
import { ReactNode, useState } from "react";

type ActionCardProps = {
  title: string;
  summary?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
};

export function ActionCard({ title, summary, children, defaultOpen = false }: ActionCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-line bg-panel/80 px-3 py-2 transition-all duration-200">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{title}</p>
          {summary ? <div className="mt-1 text-xs text-muted">{summary}</div> : null}
        </div>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-line px-2 text-xs text-muted transition hover:border-accent/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          aria-expanded={open}
        >
          <ChevronDown size={13} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
          {open ? "Ocultar" : "Detalhes"}
        </button>
      </div>
      <div className={`grid transition-all duration-200 ${open ? "mt-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
