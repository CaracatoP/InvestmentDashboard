import { useNavigate } from "react-router-dom";
import type { AiChatStructuredResponse, AiStructuredMetric, AiStructuredSection } from "../../types/ai";
import { formatCurrency, formatDate, formatPercentage } from "../../utils/formatters";
import { ActionCard } from "./ActionCard";
import { CompactConfirmation } from "./CompactConfirmation";
import { PendingField } from "./PendingField";
import { QuickReplyChip } from "./QuickReplyChip";
import { SuccessMessage } from "./SuccessMessage";

type StructuredResponseProps = {
  response: AiChatStructuredResponse;
  onSend: (message: string) => void;
  isLoading?: boolean;
};

const severityClass = {
  info: "border-aqua/30 bg-aqua/10 text-aqua",
  success: "border-accent/30 bg-accent/10 text-accent",
  warning: "border-amber/30 bg-amber/10 text-amber",
  critical: "border-rose/30 bg-rose/10 text-rose"
};

function statusLabel(response: AiChatStructuredResponse) {
  if (response.responseType === "success") return "Sucesso";
  if (response.responseType === "error") return "Erro";
  if (response.pendingAction?.status === "cancelled") return "Cancelada";
  if (response.pendingAction) return "Ação pendente";
  return "Consulta";
}

function statusClass(response: AiChatStructuredResponse) {
  if (response.responseType === "success") return "bg-accent/10 text-accent";
  if (response.responseType === "error") return "bg-rose/10 text-rose";
  if (response.pendingAction) return "bg-amber/10 text-amber";
  return "bg-aqua/10 text-aqua";
}

function formatValue(value: AiStructuredMetric["rawValue"], format?: AiStructuredMetric["format"], fallback?: string) {
  if (fallback) return fallback;
  if (value === null || value === undefined) return "-";
  if (format === "currency" && typeof value === "number") return formatCurrency(value / 100);
  if (format === "percent" && typeof value === "number") return formatPercentage(value);
  if (format === "date" && typeof value === "string") return formatDate(value);
  if (format === "boolean") return value ? "Sim" : "Nao";
  return String(value);
}

function MetricCards({ metrics }: { metrics: AiStructuredMetric[] }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {metrics.map((metric) => (
        <div key={`${metric.label}-${metric.value ?? metric.rawValue ?? ""}`} className="rounded-lg border border-line bg-panel px-2.5 py-1.5">
          <p className="text-[11px] text-muted">{metric.label}</p>
          <p className="mt-0.5 text-sm font-semibold text-ink">{formatValue(metric.rawValue, metric.format, metric.value)}</p>
        </div>
      ))}
    </div>
  );
}

function TableSection({ section }: { section: AiStructuredSection }) {
  if (!section.table) return null;
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="min-w-full divide-y divide-line text-xs">
        <thead className="bg-panel uppercase text-muted">
          <tr>
            {section.table.columns.map((column) => (
              <th key={column.key} className="px-2 py-1.5 text-left font-medium">{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line bg-elevated text-muted">
          {section.table.rows.slice(0, 8).map((row, index) => (
            <tr key={index}>
              {section.table?.columns.map((column) => (
                <td key={column.key} className="px-2 py-1.5">{formatValue(row[column.key], column.format)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionRenderer({ section, onSend }: { section: AiStructuredSection; onSend: (message: string) => void }) {
  const navigate = useNavigate();

  return (
    <section className="space-y-1.5">
      {section.title ? <h3 className="text-sm font-semibold text-ink">{section.title}</h3> : null}
      {section.content ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{section.content}</p> : null}
      {section.metrics?.length ? <MetricCards metrics={section.metrics} /> : null}
      {section.table ? <TableSection section={section} /> : null}
      {section.items?.length ? (
        <div className="space-y-1.5">
          {section.items.map((item) => (
            <div key={`${item.title}-${item.description ?? ""}`} className={`rounded-lg border px-2.5 py-1.5 text-xs ${severityClass[item.severity ?? "info"]}`}>
              <p className="font-medium">{item.title}</p>
              {item.description ? <p className="mt-0.5 opacity-90">{item.description}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
      {section.actions?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {section.actions.map((action) => (
            <QuickReplyChip
              key={action.id ?? action.label}
              onClick={() => action.route ? navigate(action.route) : onSend(action.type === "cancel" ? "cancelar" : "confirmo")}
            >
              {action.label}
            </QuickReplyChip>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function shouldCollapse(response: AiChatStructuredResponse) {
  if (response.sections.length > 2) return true;
  return response.sections.some((section) => (section.table?.rows.length ?? 0) > 3 || (section.items?.length ?? 0) > 3 || (section.content?.length ?? 0) > 180);
}

export function StructuredResponse({ response, onSend, isLoading }: StructuredResponseProps) {
  if (response.responseType === "success") return <SuccessMessage response={response} />;

  const hasPending = Boolean(response.pendingAction);
  const showSections = !hasPending;
  const content = (
    <>
      {showSections
        ? response.sections.map((section, index) => <SectionRenderer key={`${section.type}-${section.title ?? index}`} section={section} onSend={onSend} />)
        : null}
    </>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass(response)}`}>{statusLabel(response)}</span>
        {response.title ? <span className="text-sm font-semibold text-ink">{response.title}</span> : null}
      </div>

      {response.message && response.responseType !== "confirmation" ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{response.message}</p>
      ) : null}

      {response.pendingAction?.status === "collecting" ? <PendingField pendingAction={response.pendingAction} onSend={onSend} disabled={isLoading} /> : null}
      {response.pendingAction?.status === "awaiting_confirmation" ? <CompactConfirmation pendingAction={response.pendingAction} onSend={onSend} isLoading={isLoading} /> : null}

      {showSections && response.sections.length ? (
        shouldCollapse(response) ? (
          <ActionCard title="Ver detalhes">
            <div className="space-y-2">{content}</div>
          </ActionCard>
        ) : (
          <div className="space-y-2">{content}</div>
        )
      ) : null}

      {response.suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {response.suggestions.map((suggestion) => (
            <QuickReplyChip key={suggestion} onClick={() => onSend(suggestion)} disabled={isLoading}>
              {suggestion}
            </QuickReplyChip>
          ))}
        </div>
      ) : null}
    </div>
  );
}
