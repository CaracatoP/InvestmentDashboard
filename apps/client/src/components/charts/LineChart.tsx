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

interface LineChartProps {
  data: Array<Record<string, string | number>>;
  series: Series[];
  xAxisKey?: string;
  height?: number;
}

export function LineChart({ data, series, xAxisKey = "month", height = 280 }: LineChartProps) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsLineChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
          <CartesianGrid stroke="#232728" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey={xAxisKey} stroke="#8b9491" tickLine={false} axisLine={false} />
          <YAxis stroke="#8b9491" tickLine={false} axisLine={false} tickFormatter={formatCompactCurrency} width={72} />
          <Tooltip
            contentStyle={{ background: "#141617", border: "1px solid #232728", borderRadius: 8 }}
            labelStyle={{ color: "#f4f7f5" }}
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
