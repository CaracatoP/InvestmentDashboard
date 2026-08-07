export type CurrencyPreference = "BRL";

let currencyPreference: CurrencyPreference = "BRL";

function createCurrencyFormatter(options: Intl.NumberFormatOptions = {}) {
  const minimumFractionDigits = options.minimumFractionDigits ?? 2;
  const maximumFractionDigits = options.maximumFractionDigits ?? 2;

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currencyPreference,
    ...options,
    minimumFractionDigits: Math.min(minimumFractionDigits, maximumFractionDigits),
    maximumFractionDigits
  });
}

export function setCurrencyPreference(currency?: string | null) {
  currencyPreference = currency === "BRL" ? currency : "BRL";
}

export const currencyFormatter = {
  format: (value: number) => createCurrencyFormatter().format(value)
};

export const compactCurrencyFormatter = {
  format: (value: number) => createCurrencyFormatter({ notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(value)
};

export const percentFormatter = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 2
});

export function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

export function formatCents(valueInCents: number) {
  return formatCurrency(valueInCents / 100);
}

export function parseBrazilianMoneyToCents(value: string) {
  const normalized = value.trim().replace(/[^\d,.-]/g, "");
  if (!normalized || normalized.startsWith("-")) return null;

  const commaIndex = normalized.lastIndexOf(",");
  const integerInput = commaIndex >= 0 ? normalized.slice(0, commaIndex) : normalized;
  const decimalInput = commaIndex >= 0 ? normalized.slice(commaIndex + 1) : "";
  const integerPart = integerInput.replace(/\./g, "");
  const decimalPart = decimalInput.replace(/\./g, "");

  if (!/^\d*$/.test(integerPart) || !/^\d{0,2}$/.test(decimalPart)) return null;

  const reais = integerPart ? Number(integerPart) : 0;
  const cents = decimalPart ? Number(decimalPart.padEnd(2, "0")) : 0;
  const amountInCents = reais * 100 + cents;

  return Number.isSafeInteger(amountInCents) ? amountInCents : null;
}

export function formatCompactCurrency(value: number) {
  return compactCurrencyFormatter.format(value);
}

export function formatPercentage(value: number) {
  return percentFormatter.format(value / 100);
}

export function toDateKey(value: string | Date) {
  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }

  return (value instanceof Date ? value : new Date(value)).toISOString().slice(0, 10);
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(value));
}

export function exportJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) {
    return;
  }

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = String(row[header] ?? "");
          return `"${value.replace(/"/g, '""')}"`;
        })
        .join(",")
    )
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
