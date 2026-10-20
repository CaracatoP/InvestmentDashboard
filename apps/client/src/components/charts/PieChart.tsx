import { useState } from "react";
import { Cell, Pie, PieChart as RechartsPieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { AllocationComparison } from "../../types/investments";
import { formatCompactCurrency, formatCurrency, formatPercentage } from "../../utils/formatters";
import { chartHeightStyle, resolveChartColor, useChartPalette } from "./chart-theme";

export interface PieChartProps {
  data: AllocationComparison[];
  height?: number;
}

interface SliceTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: AllocationComparison & { fill?: string } }>;
}

function SliceTooltip({ active, payload }: SliceTooltipProps) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;

  return (
    <div className="rounded-lg border border-line bg-elevated px-3 py-2.5 text-sm shadow-soft">
      <p className="flex items-center gap-2 font-medium text-ink">
        <span className="h-2 w-2 rounded-full" style={{ background: item.fill }} />
        {item.category}
      </p>
      <p className="mt-1 tabular-nums text-muted">
        {formatCurrency(Number(item.value ?? 0))} · {formatPercentage(item.currentPercentage)}
      </p>
    </div>
  );
}

export function PieChart({ data, height = 280 }: PieChartProps) {
  const palette = useChartPalette();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const slices = data.map((item, index) => ({ ...item, fill: resolveChartColor(item.color, palette, index) }));
  const total = slices.reduce((sum, item) => sum + Number(item.value ?? 0), 0);
  const showTargets = slices.some((item) => item.targetPercentage > 0);
  const active = slices.find((item) => item.category === activeCategory);

  return (
    <div className="pie-layout min-w-0">
      <div className="pie-layout__grid">
      <div className="relative min-w-0" style={chartHeightStyle(height)}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsPieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="category"
              innerRadius="64%"
              outerRadius="88%"
              paddingAngle={slices.length > 1 ? 2 : 0}
              cornerRadius={4}
              stroke="none"
              onMouseEnter={(_, index) => setActiveCategory(slices[index]?.category ?? null)}
              onMouseLeave={() => setActiveCategory(null)}
            >
              {slices.map((item) => (
                <Cell key={item.category} fill={item.fill} fillOpacity={!activeCategory || activeCategory === item.category ? 1 : 0.35} />
              ))}
            </Pie>
            <Tooltip content={<SliceTooltip />} wrapperStyle={{ outline: "none" }} />
          </RechartsPieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-xs text-muted">{active ? active.category : "Total"}</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink">
              {active ? formatPercentage(active.currentPercentage) : formatCompactCurrency(total)}
            </p>
          </div>
        </div>
      </div>
      <ul className="pie-layout__legend min-w-0">
        {slices.map((item) => (
          <li
            key={item.category}
            className={`flex min-w-0 items-center justify-between gap-3 border-b border-line/60 py-2 text-sm transition-opacity last:border-b-0 ${activeCategory && activeCategory !== item.category ? "opacity-50" : ""}`}
            onMouseEnter={() => setActiveCategory(item.category)}
            onMouseLeave={() => setActiveCategory(null)}
          >
            <span className="flex min-w-0 items-center gap-2.5 text-ink">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: item.fill }} />
              <span className="truncate">{item.category}</span>
            </span>
            <span className="shrink-0 text-right tabular-nums">
              <span className="font-medium text-ink">{formatPercentage(item.currentPercentage)}</span>
              {showTargets ? <span className="ml-1.5 text-xs text-muted">meta {formatPercentage(item.targetPercentage)}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      </div>
    </div>
  );
}
