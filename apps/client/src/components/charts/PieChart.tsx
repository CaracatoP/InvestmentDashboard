import { Cell, Pie, PieChart as RechartsPieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { AllocationComparison } from "../../types/investments";
import { formatCurrency, formatPercentage } from "../../utils/formatters";

interface PieChartProps {
  data: AllocationComparison[];
  height?: number;
}

export function PieChart({ data, height = 280 }: PieChartProps) {
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_220px]">
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsPieChart>
            <Pie data={data} dataKey="value" nameKey="category" innerRadius={70} outerRadius={105} paddingAngle={3}>
              {data.map((item) => (
                <Cell key={item.category} fill={item.color ?? "#94a3b8"} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: "#141617", border: "1px solid #232728", borderRadius: 8 }}
              formatter={(value) => formatCurrency(Number(value))}
            />
          </RechartsPieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2 self-center">
        {data.map((item) => (
          <div key={item.category} className="flex items-center justify-between gap-3 rounded-lg bg-elevated px-3 py-2">
            <span className="flex min-w-0 items-center gap-2 text-sm text-muted">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item.color }} />
              <span className="truncate">{item.category}</span>
            </span>
            <span className="text-sm font-medium text-ink">{formatPercentage(item.currentPercentage)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
