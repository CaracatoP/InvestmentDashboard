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
  const minHeight = Math.min(220, height);

  return (
    <div className="min-w-0" style={{ height: `clamp(${minHeight}px, 58vw, ${height}px)` }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsAreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id={`area-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.34} />
              <stop offset="95%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#232728" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey={xAxisKey} stroke="#8b9491" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={18} tick={{ fontSize: 12 }} tickMargin={8} />
          <YAxis stroke="#8b9491" tickLine={false} axisLine={false} tickFormatter={formatCompactCurrency} width={58} tick={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={{ background: "#141617", border: "1px solid #232728", borderRadius: 8 }}
            labelStyle={{ color: "#f4f7f5" }}
            wrapperStyle={{ maxWidth: "calc(100vw - 2rem)", outline: "none" }}
            formatter={(value) => formatCompactCurrency(Number(value))}
          />
          <Area type="monotone" dataKey={dataKey} name={name} stroke={color} fill={`url(#area-${dataKey})`} strokeWidth={2.5} />
        </RechartsAreaChart>
      </ResponsiveContainer>
    </div>
  );
}
