import type { AiChatMessageRecord, AiChatStructuredResponse } from "../ai/schemas/ai.schema";
import { parseAiChatStructuredResponseStrict } from "../ai/utils/ai-response-parser";

const safeFallbackMessage = "Nao consegui montar a resposta corretamente. Tente novamente em alguns instantes.";
const supportedResponseTypes = ["text", "summary", "table", "cards", "confirmation", "form", "success", "error"] as const;

function compact(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function formatDate(value: string) {
  const trimmed = compact(value);
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    const [year, month] = trimmed.split("-");
    return `${month}/${year}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split("-");
    return `${day}/${month}/${year}`;
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    return formatDate(trimmed.slice(0, 10));
  }
  return trimmed;
}

function formatCurrency(rawValue: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(rawValue / 100);
}

function formatValue(value: unknown, format?: string) {
  if (value === null || value === undefined) return "";
  if (format === "date") return formatDate(String(value));
  if (format === "currency") {
    if (typeof value === "number") return formatCurrency(value);
    const numeric = Number(String(value).replace(/[^\d.-]/g, ""));
    return Number.isFinite(numeric) ? formatCurrency(numeric) : compact(value);
  }
  if (typeof value === "boolean") return value ? "Sim" : "Nao";
  return compact(value);
}

function looksLikeStructuredJson(value: string) {
  return /"message"\s*:/.test(value) && /"responseType"\s*:/.test(value);
}

function extractJsonBlock(value: string) {
  const trimmed = value.trim();
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) return trimmed;
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}

function parseStructuredResponseLenient(rawContent: string): AiChatStructuredResponse | null {
  try {
    return parseAiChatStructuredResponseStrict(rawContent);
  } catch {
    try {
      const parsed = JSON.parse(extractJsonBlock(rawContent)) as Record<string, unknown>;
      const message = typeof parsed.message === "string" ? compact(parsed.message) : "";
      if (!message) return null;
      const responseType = typeof parsed.responseType === "string"
        && supportedResponseTypes.includes(parsed.responseType as (typeof supportedResponseTypes)[number])
        ? (parsed.responseType as (typeof supportedResponseTypes)[number])
        : "text";

      return {
        message,
        responseType,
        title: typeof parsed.title === "string" ? compact(parsed.title) : undefined,
        sections: Array.isArray(parsed.sections) ? (parsed.sections as AiChatStructuredResponse["sections"]) : [],
        pendingAction: parsed.pendingAction && typeof parsed.pendingAction === "object"
          ? (parsed.pendingAction as AiChatStructuredResponse["pendingAction"])
          : null,
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.filter((item): item is string => typeof item === "string").map(compact) : [],
        metadata: parsed.metadata && typeof parsed.metadata === "object"
          ? (parsed.metadata as AiChatStructuredResponse["metadata"])
          : {}
      };
    } catch {
      return null;
    }
  }
}

function resolveStructuredResponse(message?: AiChatMessageRecord | null): AiChatStructuredResponse | null {
  if (message?.structuredResponse?.message) return message.structuredResponse;

  const rawContent = compact(message?.content);
  if (!rawContent) return null;
  if (!looksLikeStructuredJson(rawContent)) return null;
  return parseStructuredResponseLenient(rawContent);
}

function titleForResponse(structured: AiChatStructuredResponse) {
  if (structured.title) return structured.title;
  if (structured.responseType === "success") return "Operacao concluida";
  if (structured.responseType === "error") return "Nao foi possivel concluir";
  if (structured.responseType === "confirmation") return "Confirme antes de executar";
  if (structured.responseType === "form") return "Preciso de uma informacao";
  return "";
}

function iconForResponse(structured: AiChatStructuredResponse) {
  if (structured.responseType === "success") return "✅";
  if (structured.responseType === "error") return "⚠️";
  if (structured.responseType === "confirmation") return "🔐";
  if (structured.responseType === "form") return "🔎";
  if (structured.responseType === "summary" || structured.responseType === "table" || structured.responseType === "cards") return "📊";
  return "";
}

function renderPrimaryMessage(lines: string[], structured: AiChatStructuredResponse) {
  const title = titleForResponse(structured);
  const icon = iconForResponse(structured);
  if (title) {
    lines.push(icon ? `${icon} *${title}*` : `*${title}*`);
  }

  const message = compact(structured.message);
  if (!message) return;
  if (title && compact(title).toLowerCase() === message.toLowerCase()) return;
  lines.push(message);
}

function renderPendingFields(lines: string[], structured: AiChatStructuredResponse) {
  const fields = structured.pendingAction?.fields ?? [];
  if (fields.length === 0) return;

  lines.push("");
  for (const field of fields.slice(0, 8)) {
    const formatted = formatValue(field.value, field.type);
    if (!formatted) continue;
    lines.push(`• ${field.label}: ${formatted}`);
  }
}

function renderPendingSelection(lines: string[], structured: AiChatStructuredResponse) {
  const missingField = structured.pendingAction?.missingFields?.[0];
  if (!missingField) return;

  const options = missingField.options ?? [];
  if (options.length > 0) {
    lines.push("");
    for (const [index, option] of options.slice(0, 8).entries()) {
      lines.push(`${index + 1}. ${compact(option.label)}`);
    }
    lines.push("");
    lines.push("Responda com o numero ou com o nome.");
    return;
  }

  lines.push("");
  lines.push(`Informe: ${missingField.label}`);
}

function renderSectionTitle(lines: string[], title?: string) {
  if (!title) return;
  lines.push("");
  lines.push(`*${compact(title)}*`);
}

function renderSections(lines: string[], structured: AiChatStructuredResponse) {
  for (const section of structured.sections ?? []) {
    if (section.type === "text" && section.content) {
      renderSectionTitle(lines, section.title);
      lines.push(compact(section.content));
      continue;
    }

    if (section.type === "metrics" && (section.metrics?.length ?? 0) > 0) {
      renderSectionTitle(lines, section.title);
      for (const metric of section.metrics ?? []) {
        const value = compact(metric.value) || formatValue(metric.rawValue, metric.format);
        if (!value) continue;
        lines.push(`• ${metric.label}: ${value}`);
      }
      continue;
    }

    if ((section.type === "list" || section.type === "alert") && (section.items?.length ?? 0) > 0) {
      renderSectionTitle(lines, section.title);
      for (const item of section.items ?? []) {
        const prefix = item.severity === "critical" || item.severity === "warning"
          ? "⚠️"
          : item.severity === "success"
            ? "✅"
            : "•";
        const description = compact(item.description);
        lines.push(description ? `${prefix} ${item.title}: ${description}` : `${prefix} ${item.title}`);
      }
      continue;
    }

    if (section.type === "table" && section.table) {
      renderSectionTitle(lines, section.title);
      for (const [index, row] of section.table.rows.slice(0, 8).entries()) {
        const cells = section.table.columns
          .filter((column) => column.key !== "id")
          .slice(0, 4)
          .map((column) => formatValue(row[column.key], column.format))
          .filter(Boolean);
        if (cells.length === 0) continue;
        lines.push(`${index + 1}. ${cells.join(" - ")}`);
      }
    }
  }
}

function renderSuggestions(lines: string[], structured: AiChatStructuredResponse) {
  const suggestions = (structured.suggestions ?? []).map((suggestion) => compact(suggestion)).filter(Boolean).slice(0, 4);
  if (suggestions.length === 0) return;

  lines.push("");
  lines.push("*Sugestoes*");
  for (const suggestion of suggestions) {
    lines.push(`• ${suggestion}`);
  }
}

function renderConfirmationHint(lines: string[], structured: AiChatStructuredResponse) {
  if (structured.responseType !== "confirmation") return;
  lines.push("");
  lines.push("Responda com *confirmo* ou *cancelar*.");
}

function finalizeMessage(lines: string[]) {
  const normalized: string[] = [];

  for (const line of lines.map((entry) => entry.trim())) {
    if (!line && normalized[normalized.length - 1] === "") continue;
    normalized.push(line);
  }

  const compacted = normalized.join("\n").trim();
  if (!compacted) return safeFallbackMessage;
  return compacted.length > 3500 ? `${compacted.slice(0, 3497).trimEnd()}...` : compacted;
}

export function formatWhatsAppAssistantResponse(message?: AiChatMessageRecord | null) {
  try {
    const structured = resolveStructuredResponse(message);
    if (structured) {
      const lines: string[] = [];
      renderPrimaryMessage(lines, structured);
      renderPendingFields(lines, structured);
      renderPendingSelection(lines, structured);
      renderSections(lines, structured);
      renderSuggestions(lines, structured);
      renderConfirmationHint(lines, structured);
      return finalizeMessage(lines);
    }

    const rawContent = compact(message?.content);
    if (!rawContent) return "Nao consegui gerar uma resposta agora.";
    if (looksLikeStructuredJson(rawContent) || rawContent.startsWith("{") || rawContent.startsWith("[")) {
      return safeFallbackMessage;
    }
    return rawContent;
  } catch {
    return safeFallbackMessage;
  }
}
