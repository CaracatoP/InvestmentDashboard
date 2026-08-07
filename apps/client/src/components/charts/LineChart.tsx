import {
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { formatCompactCurrency } from "../../utils/formatters";

interface Series {
  dataKey: string;
  name: string;
  color: string;
}

export interface LineChartProps {
  data: Array<Record<string, string | number>>;
  series: Series[];
  xAxisKey?: string;
  height?: number;
}

export function LineChart({ data, series, xAxisKey = "month", height = 280 }: LineChartProps) {
  const minHeight = Math.min(220, height);

  return (
    <div className="min-w-0" style={{ height: `clamp(${minHeight}px, 58vw, ${height}px)` }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsLineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid stroke="#232728" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey={xAxisKey} stroke="#8b9491" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={18} tick={{ fontSize: 12 }} tickMargin={8} />
          <YAxis stroke="#8b9491" tickLine={false} axisLine={false} tickFormatter={formatCompactCurrency} width={58} tick={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={{ background: "#141617", border: "1px solid #232728", borderRadius: 8 }}
            labelStyle={{ color: "#f4f7f5" }}
            wrapperStyle={{ maxWidth: "calc(100vw - 2rem)", outline: "none" }}
            formatter={(value) => formatCompactCurrency(Number(value))}
          />
          {series.map((item) => (
            <Line
              key={item.dataKey}
              type="monotone"
              dataKey={item.dataKey}
              name={item.name}
              stroke={item.color}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5 }}
            />
          ))}
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}
