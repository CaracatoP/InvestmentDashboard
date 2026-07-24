import {
  Area,
  AreaChart as RechartsAreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { AssetPriceHistoryPoint } from "../../types/investments";
import { formatCompactCurrency, formatCurrency } from "../../utils/formatters";

interface PriceHistoryChartProps {
  data: AssetPriceHistoryPoint[];
  range: string;
  height?: number;
}

interface HistoryTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<{ payload?: AssetPriceHistoryPoint }>;
}

function formatAxisDate(value: string, range: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  if (range === "1mo" || range === "3mo") {
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date);
  }

  if (range === "5y" || range === "max") {
    return new Intl.DateTimeFormat("pt-BR", { month: "2-digit", year: "2-digit" }).format(date);
  }

  return new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "");
}

function formatTooltipDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function pickEvenly(values: string[], maxTicks: number) {
  if (values.length <= maxTicks) return values;

  const step = (values.length - 1) / (maxTicks - 1);
  return Array.from({ length: maxTicks }, (_, index) => values[Math.round(index * step)]).filter((value): value is string => Boolean(value));
}

function selectAxisTicks(data: AssetPriceHistoryPoint[], range: string) {
  const timestamps = data.map((point) => point.timestamp);
  if (range === "1mo" || range === "3mo") return pickEvenly(timestamps, 6);

  const byPeriod = new Map<string, string>();

  for (const point of data) {
    const date = new Date(point.timestamp);
    if (Number.isNaN(date.getTime())) continue;

    const key = range === "5y" || range === "max" ? String(date.getUTCFullYear()) : `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
    if (!byPeriod.has(key)) byPeriod.set(key, point.timestamp);
  }

  return pickEvenly([...byPeriod.values()], 7);
}

function formatVolume(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Indisponivel";
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function HistoryTooltip({ active, payload, label }: HistoryTooltipProps) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload as AssetPriceHistoryPoint | undefined;
  if (!point) return null;

  return (
    <div className="max-w-[calc(100vw_-_2rem)] rounded-lg border border-line bg-panel p-3 text-xs shadow-soft">
      <p className="font-medium text-ink">{formatTooltipDate(String(label))}</p>
      <div className="mt-2 grid gap-1 text-muted">
        <span>Abertura: {typeof point.open === "number" ? formatCurrency(point.open) : "Indisponivel"}</span>
        <span>Maxima: {typeof point.high === "number" ? formatCurrency(point.high) : "Indisponivel"}</span>
        <span>Minima: {typeof point.low === "number" ? formatCurrency(point.low) : "Indisponivel"}</span>
        <span>Fechamento: {formatCurrency(point.close)}</span>
        <span>Volume: {formatVolume(point.volume)}</span>
      </div>
    </div>
  );
}

export function PriceHistoryChart({ data, range, height = 280 }: PriceHistoryChartProps) {
  const minHeight = Math.min(220, height);
  const axisTicks = selectAxisTicks(data, range);

  return (
    <div className="min-w-0" style={{ height: `clamp(${minHeight}px, 58vw, ${height}px)` }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsAreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="asset-price-history" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.34} />
              <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#232728" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="timestamp"
            stroke="#8b9491"
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={24}
            tick={{ fontSize: 12 }}
            tickMargin={8}
            ticks={axisTicks}
            tickFormatter={(value) => formatAxisDate(String(value), range)}
          />
          <YAxis stroke="#8b9491" tickLine={false} axisLine={false} tickFormatter={formatCompactCurrency} width={58} tick={{ fontSize: 12 }} />
          <Tooltip
            content={({ active, label, payload }) => (
              <HistoryTooltip active={active} label={label} payload={payload as unknown as HistoryTooltipProps["payload"]} />
            )}
            wrapperStyle={{ maxWidth: "calc(100vw - 2rem)", outline: "none" }}
          />
          <Area type="monotone" dataKey="close" name="Fechamento" stroke="#38bdf8" fill="url(#asset-price-history)" strokeWidth={2.5} />
        </RechartsAreaChart>
      </ResponsiveContainer>
    </div>
  );
}
