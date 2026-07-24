import { formatCurrency } from "../../utils/formatters";

type ValueSize = "card" | "table" | "inline";

interface ValueDisplayProps {
  value: string | number;
  kind?: "currency" | "text";
  className?: string;
  size?: ValueSize;
}

function joinClasses(classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatValue(value: string | number, kind: "currency" | "text") {
  if (kind === "currency" && typeof value === "number") return formatCurrency(value);
  if (typeof value === "number") return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return value;
}

function splitCurrency(value: string) {
  const normalizedValue = value.replace(/\s+/g, " ").trim();
  const match = normalizedValue.match(/^([^\d]+)\s*(.+)$/);

  if (!match) return null;
  return { symbol: match[1].trim(), amount: match[2].trim() };
}

export function ValueDisplay({ value, kind = "text", className = "", size = "inline" }: ValueDisplayProps) {
  const formattedValue = formatValue(value, kind);
  const looksLikeCurrency = /^[^\d]*R\$/.test(formattedValue.trim());
  const currencyParts = kind === "currency" || looksLikeCurrency ? splitCurrency(formattedValue) : null;

  if (currencyParts) {
    return (
      <span className={joinClasses(["financial-value", `financial-value--${size}`, className])} title={formattedValue}>
        <span className="financial-value__part">{currencyParts.symbol}</span>
        <span className="financial-value__part financial-value__amount">{currencyParts.amount}</span>
      </span>
    );
  }

  return (
    <span className={joinClasses(["responsive-value", `responsive-value--${size}`, className])} title={formattedValue}>
      {formattedValue}
    </span>
  );
}

export function MoneyValue({ value, className = "", size = "inline" }: Omit<ValueDisplayProps, "kind">) {
  return <ValueDisplay value={value} kind="currency" className={className} size={size} />;
}
