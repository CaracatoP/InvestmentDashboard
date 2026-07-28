import { CheckCircle2, Loader2, Pencil, XCircle } from "lucide-react";
import type { AiStructuredPendingAction } from "../../types/ai";
import { ActionCard } from "./ActionCard";

type CompactConfirmationProps = {
  pendingAction: AiStructuredPendingAction;
  onSend: (message: string) => void;
  isLoading?: boolean;
};

function normalizeLabel(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isVisibleField(field: { value?: string | number | boolean | null }) {
  return field.value !== null && field.value !== undefined && String(field.value).trim().length > 0;
}

function isPrimaryField(label: string) {
  const normalized = normalizeLabel(label);
  return /(valor|renda|setor|categoria|descricao|meta|periodo|tipo)/.test(normalized);
}

function FieldGrid({ fields }: { fields: Array<{ name: string; label: string; value?: string | number | boolean | null }> }) {
  if (!fields.length) return null;
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {fields.map((field) => (
        <div key={field.name} className="rounded-lg bg-elevated/80 px-2.5 py-1.5">
          <p className="text-[11px] uppercase tracking-wide text-muted">{field.label}</p>
          <p className="mt-0.5 text-sm font-medium text-ink">{String(field.value)}</p>
        </div>
      ))}
    </div>
  );
}

export function CompactConfirmation({ pendingAction, onSend, isLoading }: CompactConfirmationProps) {
  const visibleFields = (pendingAction.fields ?? []).filter(isVisibleField);
  const primaryFields = visibleFields.filter((field) => isPrimaryField(field.label));
  const detailFields = visibleFields.filter((field) => !isPrimaryField(field.label));
  const summaryFields = primaryFields.slice(0, 2);

  return (
    <div className="rounded-xl border border-accent/30 bg-accent/5 px-3 py-2">
      <ActionCard
        title={pendingAction.title}
        defaultOpen={false}
        summary={
          summaryFields.length ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {summaryFields.map((field) => (
                <span key={field.name}>
                  <span className="text-muted">{field.label}: </span>
                  <span className="font-medium text-ink">{String(field.value)}</span>
                </span>
              ))}
            </div>
          ) : null
        }
      >
        <div className="space-y-2">
          <FieldGrid fields={primaryFields.length ? primaryFields : visibleFields} />
          {detailFields.length ? <FieldGrid fields={detailFields} /> : null}
        </div>
      </ActionCard>

      {pendingAction.status === "awaiting_confirmation" ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onSend("confirmo")}
            disabled={isLoading}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-semibold text-black transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {isLoading ? "Executando" : "Confirmar"}
          </button>
          <button
            type="button"
            onClick={() => onSend("cancelar")}
            disabled={isLoading}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-panel px-3 text-xs font-medium text-muted transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Pencil size={13} />
            Editar
          </button>
          <button
            type="button"
            onClick={() => onSend("cancelar")}
            disabled={isLoading}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-panel px-3 text-xs font-medium text-muted transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            <XCircle size={13} />
            Cancelar
          </button>
        </div>
      ) : null}
    </div>
  );
}
