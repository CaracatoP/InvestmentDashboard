import type { AiChatMessageRecord } from "../ai/schemas/ai.schema";

function compact(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function limitLines(lines: string[], maxLines = 12) {
  return lines.filter(Boolean).slice(0, maxLines).join("\n");
}

export function formatWhatsAppAssistantResponse(message?: AiChatMessageRecord | null) {
  const structured = message?.structuredResponse;
  if (!structured) return compact(message?.content) || "Nao consegui gerar uma resposta agora.";

  const lines: string[] = [];
  if (structured.responseType === "success") lines.push(`✅ ${structured.title || "Operacao concluida"}`);
  else if (structured.responseType === "error") lines.push(`⚠️ ${structured.title || "Nao consegui concluir"}`);
  else if (structured.responseType === "confirmation") lines.push(`Confirme: ${structured.title || "operacao"}`);
  else if (structured.responseType === "form") lines.push(`Preciso de uma informacao`);
  else if (structured.title) lines.push(compact(structured.title));

  const pendingFields = structured.pendingAction?.fields ?? [];
  if (pendingFields.length > 0) {
    for (const field of pendingFields.slice(0, 8)) {
      const value = compact(field.value);
      if (value) lines.push(`${field.label}: ${value}`);
    }
  }

  const missing = structured.pendingAction?.missingFields?.[0];
  if (missing) lines.push(`Informe: ${missing.label}`);

  const metrics = structured.sections?.flatMap((section) => section.type === "metrics" ? (section.metrics ?? []) : []) ?? [];
  if (pendingFields.length === 0 && metrics.length > 0) {
    for (const metric of metrics.slice(0, 8)) {
      lines.push(`${metric.label}: ${compact(metric.value)}`);
    }
  }

  if (structured.message && !lines.some((line) => line.includes(structured.message))) {
    lines.push(compact(structured.message));
  }

  if (structured.responseType === "confirmation") lines.push("Responda: confirmo ou cancelar.");
  return limitLines(lines);
}
