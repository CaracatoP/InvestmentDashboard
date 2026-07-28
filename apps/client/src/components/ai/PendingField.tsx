import { AlertTriangle } from "lucide-react";
import type { AiStructuredPendingAction } from "../../types/ai";
import { QuickReplyChip } from "./QuickReplyChip";

type PendingFieldProps = {
  pendingAction: AiStructuredPendingAction;
  onSend: (message: string) => void;
  disabled?: boolean;
};

export function PendingField({ pendingAction, onSend, disabled }: PendingFieldProps) {
  const field = pendingAction.missingFields?.[0];
  if (!field) return null;

  return (
    <div className="rounded-xl border border-amber/30 bg-amber/10 px-3 py-2 text-sm text-amber">
      <div className="flex items-center gap-2">
        <AlertTriangle size={14} />
        <p className="font-medium">Falta informar {field.label.toLowerCase()}.</p>
      </div>
      <p className="mt-1 text-xs text-amber/85">Informe apenas esse campo para continuar.</p>
      {field.options?.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {field.options.map((option) => (
            <QuickReplyChip key={option.value} onClick={() => onSend(option.label)} disabled={disabled}>
              {option.label}
            </QuickReplyChip>
          ))}
        </div>
      ) : null}
    </div>
  );
}
