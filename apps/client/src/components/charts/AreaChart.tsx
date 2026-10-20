import { useId } from "react";
import {
  Area,
  AreaChart as RechartsAreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { formatCompactCurrency, formatCurrency } from "../../utils/formatters";
import { axisProps, ChartTooltip, chartHeightStyle, resolveChartColor, useChartPalette } from "./chart-theme";

export interface AreaChartProps {
  data: Array<Record<string, string | number>>;
  dataKey: string;
  name: string;
  /** Theme token (accent, aqua, violet, amber, rose, teal) or any CSS color. */
  color?: string;
  xAxisKey?: string;
  height?: number;
}

export function AreaChart({ data, dataKey, name, color = "accent", xAxisKey = "month", height = 280 }: AreaChartProps) {
  const palette = useChartPalette();
  const stroke = resolveChartColor(color, palette);
  const gradientId = `area-${useId().replace(/:/g, "")}`;

  return (
    <div className="min-w-0" style={chartHeightStyle(height)}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsAreaChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis dataKey={xAxisKey} interval="preserveStartEnd" {...axisProps} />
          <YAxis tickFormatter={formatCompactCurrency} width={72} {...axisProps} />
          <Tooltip cursor={{ strokeDasharray: "4 4" }} content={<ChartTooltip format={formatCurrency} />} wrapperStyle={{ outline: "none" }} />
          <Area
            type="monotone"
            dataKey={dataKey}
            name={name}
            stroke={stroke}
            fill={`url(#${gradientId})`}
            strokeWidth={2}
            activeDot={{ r: 4.5, strokeWidth: 2, stroke: palette.panel, fill: stroke }}
          />
        </RechartsAreaChart>
      </ResponsiveContainer>
    </div>
  );
}
