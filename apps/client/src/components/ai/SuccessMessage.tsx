import { CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { AiChatStructuredResponse } from "../../types/ai";
import { ActionCard } from "./ActionCard";

type SuccessMessageProps = {
  response: AiChatStructuredResponse;
};

function successFields(response: AiChatStructuredResponse) {
  return (response.pendingAction?.fields ?? []).filter((field) => field.value !== null && field.value !== undefined && String(field.value).trim().length > 0);
}

export function SuccessMessage({ response }: SuccessMessageProps) {
  const navigate = useNavigate();
  const fields = successFields(response);
  const actions = response.sections.flatMap((section) => section.actions ?? []).filter((action) => action.route);

  return (
    <div className="space-y-2">
      <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
        <CheckCircle2 size={13} />
        {response.message || "Operacao registrada."}
      </div>

      {fields.length ? (
        <ActionCard
          title={response.pendingAction?.title ?? "Resumo"}
          summary={
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {fields.slice(0, 2).map((field) => (
                <span key={field.name}>
                  <span>{field.label}: </span>
                  <span className="font-medium text-ink">{String(field.value)}</span>
                </span>
              ))}
            </div>
          }
        >
          <div className="grid gap-1.5 sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field.name} className="rounded-lg bg-elevated/80 px-2.5 py-1.5">
                <p className="text-[11px] uppercase tracking-wide text-muted">{field.label}</p>
                <p className="mt-0.5 text-sm font-medium text-ink">{String(field.value)}</p>
              </div>
            ))}
          </div>
        </ActionCard>
      ) : null}

      {actions.length ? (
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <button
              key={action.id ?? action.route}
              type="button"
              onClick={() => action.route && navigate(action.route)}
              className="inline-flex h-8 items-center rounded-full border border-line bg-panel px-3 text-xs font-medium text-muted transition hover:border-accent/60 hover:text-ink"
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
