import { useId } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { formatCompactCurrency, formatCurrency } from "../../utils/formatters";
import { axisProps, ChartLegend, ChartTooltip, chartHeightStyle, resolveChartColor, useChartPalette } from "./chart-theme";

interface Series {
  dataKey: string;
  name: string;
  /** Theme token (accent, aqua, violet, amber, rose, teal, muted) or any CSS color. */
  color: string;
  /** Draws the series as a reference line (dashed, no fill). */
  dashed?: boolean;
  /** Fills the area under the series with a soft gradient. */
  area?: boolean;
}

export interface LineChartProps {
  data: Array<Record<string, string | number>>;
  series: Series[];
  xAxisKey?: string;
  height?: number;
}

export function LineChart({ data, series, xAxisKey = "month", height = 280 }: LineChartProps) {
  const palette = useChartPalette();
  const idPrefix = `line-${useId().replace(/:/g, "")}`;
  const resolved = series.map((item, index) => ({ ...item, stroke: resolveChartColor(item.color, palette, index) }));

  return (
    <div className="min-w-0">
      <ChartLegend items={resolved.map((item) => ({ name: item.name, color: item.stroke, dashed: item.dashed }))} />
      <div className="min-w-0" style={chartHeightStyle(height)}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
            <defs>
              {resolved.filter((item) => item.area).map((item) => (
                <linearGradient key={item.dataKey} id={`${idPrefix}-${item.dataKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={item.stroke} stopOpacity={0.24} />
                  <stop offset="100%" stopColor={item.stroke} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey={xAxisKey} interval="preserveStartEnd" {...axisProps} />
            <YAxis tickFormatter={formatCompactCurrency} width={72} {...axisProps} />
            <Tooltip cursor={{ strokeDasharray: "4 4" }} content={<ChartTooltip format={formatCurrency} />} wrapperStyle={{ outline: "none" }} />
            {resolved.map((item) => {
              const activeDot = { r: 4.5, strokeWidth: 2, stroke: palette.panel, fill: item.stroke };

              return item.area ? (
                <Area
                  key={item.dataKey}
                  type="monotone"
                  dataKey={item.dataKey}
                  name={item.name}
                  stroke={item.stroke}
                  strokeWidth={2.25}
                  fill={`url(#${idPrefix}-${item.dataKey})`}
                  activeDot={activeDot}
                />
              ) : (
                <Line
                  key={item.dataKey}
                  type="monotone"
                  dataKey={item.dataKey}
                  name={item.name}
                  stroke={item.stroke}
                  strokeWidth={item.dashed ? 1.75 : 2.25}
                  strokeDasharray={item.dashed ? "5 5" : undefined}
                  dot={false}
                  activeDot={activeDot}
                />
              );
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
