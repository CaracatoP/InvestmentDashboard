import { Cell, Pie, PieChart as RechartsPieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { AllocationComparison } from "../../types/investments";
import { formatCurrency, formatPercentage } from "../../utils/formatters";

export interface PieChartProps {
  data: AllocationComparison[];
  height?: number;
}

export function PieChart({ data, height = 280 }: PieChartProps) {
  const minHeight = Math.min(220, height);

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
      <div className="min-w-0" style={{ height: `clamp(${minHeight}px, 58vw, ${height}px)` }}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsPieChart>
            <Pie data={data} dataKey="value" nameKey="category" innerRadius="52%" outerRadius="78%" paddingAngle={3}>
              {data.map((item) => (
                <Cell key={item.category} fill={item.color ?? "#94a3b8"} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: "#141617", border: "1px solid #232728", borderRadius: 8 }}
              wrapperStyle={{ maxWidth: "calc(100vw - 2rem)", outline: "none" }}
              formatter={(value) => formatCurrency(Number(value))}
            />
          </RechartsPieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid gap-2 self-center sm:grid-cols-2 lg:block lg:space-y-2">
        {data.map((item) => (
          <div key={item.category} className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-elevated px-3 py-2">
            <span className="flex min-w-0 items-center gap-2 text-sm text-muted">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item.color }} />
              <span className="break-words">{item.category}</span>
            </span>
            <span className="shrink-0 text-sm font-medium text-ink">{formatPercentage(item.currentPercentage)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
