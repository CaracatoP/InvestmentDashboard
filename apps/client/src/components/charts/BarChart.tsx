import { useState } from "react";
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { formatCompactCurrency, formatCurrency } from "../../utils/formatters";
import { axisProps, ChartTooltip, chartHeightStyle, resolveChartColor, useChartPalette } from "./chart-theme";

export interface BarChartProps {
  data: Array<Record<string, string | number>>;
  dataKey?: string;
  name: string;
  /** Theme token (accent, aqua, violet, amber, rose, teal) or any CSS color. */
  color?: string;
  xAxisKey?: string;
  height?: number;
}

export function BarChart({ data, dataKey = "value", name, color = "aqua", xAxisKey = "month", height = 260 }: BarChartProps) {
  const palette = useChartPalette();
  const fill = resolveChartColor(color, palette);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const hasNegative = data.some((item) => Number(item[dataKey]) < 0);

  return (
    <div className="min-w-0" style={chartHeightStyle(height)}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart
          data={data}
          margin={{ left: 4, right: 8, top: 8, bottom: 0 }}
          onMouseMove={(state) => {
            const index = Number(state?.activeTooltipIndex ?? Number.NaN);
            setActiveIndex(Number.isFinite(index) ? index : null);
          }}
          onMouseLeave={() => setActiveIndex(null)}
        >
          <CartesianGrid vertical={false} />
          <XAxis dataKey={xAxisKey} interval="preserveStartEnd" {...axisProps} />
          <YAxis tickFormatter={formatCompactCurrency} width={72} {...axisProps} />
          <Tooltip cursor={false} content={<ChartTooltip format={formatCurrency} />} wrapperStyle={{ outline: "none" }} />
          <Bar dataKey={dataKey} name={name} fill={fill} radius={hasNegative ? 4 : [5, 5, 2, 2]} maxBarSize={40}>
            {data.map((item, index) => (
              <Cell
                key={`${String(item[xAxisKey])}-${index}`}
                fill={Number(item[dataKey]) < 0 ? palette.rose : fill}
                fillOpacity={activeIndex === null || activeIndex === index ? 0.9 : 0.4}
              />
            ))}
          </Bar>
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}
