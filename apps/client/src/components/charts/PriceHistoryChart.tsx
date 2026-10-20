import {
  Area,
  AreaChart as RechartsAreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { useId, useMemo } from "react";
import type { AssetPriceHistoryPoint } from "../../types/investments";
import { formatCompactCurrency, formatCurrency } from "../../utils/formatters";
import { axisProps, chartHeightStyle, useChartPalette } from "./chart-theme";

const priceChangeFormatter = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

export interface PriceHistoryChartProps {
  data: AssetPriceHistoryPoint[];
  range: string;
  height?: number;
  operations?: PriceHistoryOperation[];
}

interface HistoryTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<{ payload?: AssetPriceHistoryPoint }>;
}

interface PriceHistoryOperation {
  type: string;
  date: string;
  quantity: number;
  price: number;
  total: number;
}

interface OperationMarker {
  key: string;
  timestamp: string;
  close: number;
  type: string;
  quantity: number;
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

function dateOnly(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function buildOperationMarkers(data: AssetPriceHistoryPoint[], operations: PriceHistoryOperation[] = []) {
  if (data.length === 0 || operations.length === 0) return [];

  const sortedPoints = data
    .filter((point) => Number.isFinite(point.close) && point.close > 0)
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
  const markers: OperationMarker[] = [];

  for (const operation of operations) {
    if (operation.type !== "COMPRA" && operation.type !== "VENDA") continue;
    const operationDate = dateOnly(operation.date);
    if (!operationDate) continue;

    const point = sortedPoints.find((item) => dateOnly(item.timestamp) >= operationDate) ?? sortedPoints[sortedPoints.length - 1];
    if (!point) continue;

    markers.push({
      key: `${operation.type}-${operation.date}-${operation.quantity}-${operation.price}`,
      timestamp: point.timestamp,
      close: point.close,
      type: operation.type,
      quantity: operation.quantity
    });
  }

  return markers;
}

function HistoryTooltip({ active, payload, label }: HistoryTooltipProps) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload as AssetPriceHistoryPoint | undefined;
  if (!point) return null;

  const rows: Array<[string, string]> = [
    ["Variacao do dia", formatDailyChange(point)],
    ["Abertura", typeof point.open === "number" ? formatCurrency(point.open) : "Indisponivel"],
    ["Maxima", typeof point.high === "number" ? formatCurrency(point.high) : "Indisponivel"],
    ["Minima", typeof point.low === "number" ? formatCurrency(point.low) : "Indisponivel"],
    ["Volume", formatVolume(point.volume)]
  ];

  return (
    <div className="min-w-48 max-w-[calc(100vw_-_2rem)] rounded-lg border border-line bg-elevated px-3 py-2.5 text-xs shadow-soft">
      <p className="text-muted">{formatTooltipDate(String(label))}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums text-ink">{formatCurrency(point.close)}</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-line pt-2">
        {rows.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="text-muted">{term}</dt>
            <dd className="text-right tabular-nums text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function PriceHistoryChart({ data, range, height = 280, operations = [] }: PriceHistoryChartProps) {
  const palette = useChartPalette();
  const gradientId = `price-history-${useId().replace(/:/g, "")}`;
  const axisTicks = useMemo(() => selectAxisTicks(data, range), [data, range]);
  const priceDomain = useMemo(() => calculatePriceDomain(data), [data]);
  const priceTicks = useMemo(() => buildYAxisTicks(priceDomain), [priceDomain]);
  const operationMarkers = useMemo(() => buildOperationMarkers(data, operations), [data, operations]);
  const shouldAnimate = data.length <= 260;
  const firstClose = data.find((point) => point.close > 0)?.close ?? 0;
  const lastClose = [...data].reverse().find((point) => point.close > 0)?.close ?? 0;
  const stroke = lastClose < firstClose ? palette.rose : palette.accent;

  return (
    <div className="min-w-0">
      <div className="min-w-0" style={chartHeightStyle(height)}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsAreaChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity={0.26} />
                <stop offset="100%" stopColor={stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="timestamp"
              {...axisProps}
              interval="preserveStartEnd"
              minTickGap={36}
              ticks={axisTicks}
              tickFormatter={(value) => formatAxisDate(String(value), range)}
            />
            <YAxis
              {...axisProps}
              domain={priceDomain}
              ticks={priceTicks}
              tickFormatter={formatPriceAxisValue}
              width={76}
            />
            <Tooltip
              cursor={{ strokeDasharray: "4 4" }}
              content={({ active, label, payload }) => (
                <HistoryTooltip active={active} label={label} payload={payload as unknown as HistoryTooltipProps["payload"]} />
              )}
              wrapperStyle={{ outline: "none" }}
            />
            <Area
              type="monotone"
              dataKey="close"
              name="Fechamento"
              stroke={stroke}
              fill={`url(#${gradientId})`}
              strokeWidth={2}
              activeDot={{ r: 4.5, stroke: palette.panel, strokeWidth: 2, fill: stroke }}
              isAnimationActive={shouldAnimate}
            />
            {operationMarkers.map((marker, index) => (
              <ReferenceDot
                key={`${marker.key}-${index}`}
                x={marker.timestamp}
                y={marker.close}
                r={4.5}
                fill={marker.type === "COMPRA" ? palette.aqua : palette.amber}
                stroke={palette.panel}
                strokeWidth={2}
                ifOverflow="visible"
              />
            ))}
          </RechartsAreaChart>
        </ResponsiveContainer>
      </div>
      {operationMarkers.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: palette.aqua }} />Compra</li>
          <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: palette.amber }} />Venda</li>
        </ul>
      ) : null}
      </div>
  );
}
