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

const priceChangeFormatter = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

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
  if (range === "1mo" || range === "3mo") return pickEvenly(timestamps, 5);

  const byPeriod = new Map<string, string>();

  for (const point of data) {
    const date = new Date(point.timestamp);
    if (Number.isNaN(date.getTime())) continue;

    const key = range === "5y" || range === "max" ? String(date.getUTCFullYear()) : `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
    if (!byPeriod.has(key)) byPeriod.set(key, point.timestamp);
  }

  return pickEvenly([...byPeriod.values()], range === "5y" || range === "max" ? 5 : 6);
}

function getPriceStep(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1000) return 10;
  if (absolute >= 100) return 1;
  if (absolute >= 10) return 0.1;
  if (absolute >= 1) return 0.01;
  return 0.0001;
}

function roundDomainDown(value: number) {
  const step = getPriceStep(value);
  return Math.max(Math.floor(value / step) * step, step);
}

function roundDomainUp(value: number) {
  const step = getPriceStep(value);
  return Math.max(Math.ceil(value / step) * step, step * 2);
}

function calculatePriceDomain(data: AssetPriceHistoryPoint[]): [number, number] {
  const prices = data.map((point) => point.close).filter((price) => Number.isFinite(price) && price > 0);

  if (prices.length === 0) return [0.01, 1];

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const center = (minPrice + maxPrice) / 2;
  const realRange = maxPrice - minPrice;
  const minimumRange = Math.max(center * 0.02, getPriceStep(center) * 8);
  const chartRange = Math.max(realRange, minimumRange);
  const margin = chartRange * 0.04;
  const lower = realRange < minimumRange ? center - chartRange / 2 - margin : minPrice - margin;
  const upper = realRange < minimumRange ? center + chartRange / 2 + margin : maxPrice + margin;

  return [roundDomainDown(lower), roundDomainUp(upper)];
}

function buildYAxisTicks([min, max]: [number, number]) {
  const tickCount = 5;
  const step = (max - min) / (tickCount - 1);
  const precision = getPriceStep((min + max) / 2) < 0.01 ? 10000 : 100;
  const ticks = Array.from({ length: tickCount }, (_, index) => Math.round((min + step * index) * precision) / precision);

  return [...new Set(ticks)].filter((tick) => tick > 0);
}

function formatPriceAxisValue(value: number | string) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "";
  return Math.abs(numericValue) >= 1000 ? formatCompactCurrency(numericValue) : formatCurrency(numericValue);
}

function formatDailyChange(point: AssetPriceHistoryPoint) {
  if (typeof point.open !== "number" || !Number.isFinite(point.open) || point.open <= 0) return "Indisponivel";

  const change = point.close - point.open;
  const percentChange = change / point.open;
  const isFlat = Math.abs(change) < 0.000001;
  const sign = change > 0 ? "+" : "";
  const percentSign = percentChange > 0 ? "+" : "";

  if (isFlat) return `${formatCurrency(0)} (${priceChangeFormatter.format(0)})`;
  return `${sign}${formatCurrency(change)} (${percentSign}${priceChangeFormatter.format(percentChange)})`;
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
        <span>Fechamento: {formatCurrency(point.close)}</span>
        <span>Variacao do dia: {formatDailyChange(point)}</span>
        <span>Abertura: {typeof point.open === "number" ? formatCurrency(point.open) : "Indisponivel"}</span>
        <span>Maxima: {typeof point.high === "number" ? formatCurrency(point.high) : "Indisponivel"}</span>
        <span>Minima: {typeof point.low === "number" ? formatCurrency(point.low) : "Indisponivel"}</span>
        <span>Volume: {formatVolume(point.volume)}</span>
      </div>
    </div>
  );
}

export function PriceHistoryChart({ data, range, height = 280 }: PriceHistoryChartProps) {
  const minHeight = Math.min(220, height);
  const axisTicks = selectAxisTicks(data, range);
  const priceDomain = calculatePriceDomain(data);
  const priceTicks = buildYAxisTicks(priceDomain);

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
            minTickGap={36}
            tick={{ fontSize: 12 }}
            tickMargin={8}
            ticks={axisTicks}
            tickFormatter={(value) => formatAxisDate(String(value), range)}
          />
          <YAxis
            stroke="#8b9491"
            tickLine={false}
            axisLine={false}
            domain={priceDomain}
            ticks={priceTicks}
            tickFormatter={formatPriceAxisValue}
            width={72}
            tick={{ fontSize: 12 }}
          />
          <Tooltip
            content={({ active, label, payload }) => (
              <HistoryTooltip active={active} label={label} payload={payload as unknown as HistoryTooltipProps["payload"]} />
            )}
            wrapperStyle={{ maxWidth: "calc(100vw - 2rem)", outline: "none" }}
          />
          <Area
            type="monotone"
            dataKey="close"
            name="Fechamento"
            stroke="#38bdf8"
            fill="url(#asset-price-history)"
            strokeWidth={2.5}
            activeDot={{ r: 4, stroke: "#38bdf8", strokeWidth: 2 }}
          />
        </RechartsAreaChart>
      </ResponsiveContainer>
    </div>
  );
}
