import {
  Area,
  AreaChart as RechartsAreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { formatCompactCurrency } from "../../utils/formatters";

interface AreaChartProps {
  data: Array<Record<string, string | number>>;
  dataKey: string;
  name: string;
  color?: string;
  xAxisKey?: string;
  height?: number;
}

export function AreaChart({ data, dataKey, name, color = "#22c55e", xAxisKey = "month", height = 280 }: AreaChartProps) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsAreaChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id={`area-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.34} />
              <stop offset="95%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#232728" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey={xAxisKey} stroke="#8b9491" tickLine={false} axisLine={false} />
          <YAxis stroke="#8b9491" tickLine={false} axisLine={false} tickFormatter={formatCompactCurrency} width={72} />
          <Tooltip
            contentStyle={{ background: "#141617", border: "1px solid #232728", borderRadius: 8 }}
            labelStyle={{ color: "#f4f7f5" }}
            formatter={(value) => formatCompactCurrency(Number(value))}
          />
          <Area type="monotone" dataKey={dataKey} name={name} stroke={color} fill={`url(#area-${dataKey})`} strokeWidth={2.5} />
        </RechartsAreaChart>
      </ResponsiveContainer>
    </div>
  );
}
