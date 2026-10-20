import { useEffect, useState } from "react";
import type { ReactNode } from "react";

/** Theme tokens a chart may reference by name instead of a raw color. */
export type ChartTone = "accent" | "aqua" | "violet" | "amber" | "rose" | "teal" | "muted" | "ink";

/** Categorical order used when a series or slice has no color of its own. */
export const chartSequence: ChartTone[] = ["accent", "aqua", "violet", "amber", "rose", "teal"];

const tones: ChartTone[] = ["accent", "aqua", "violet", "amber", "rose", "teal", "muted", "ink"];

type ChartPalette = Record<ChartTone | "panel" | "line", string>;

function readPalette(): ChartPalette {
  const palette = {} as ChartPalette;
  const styles = typeof document === "undefined" ? null : getComputedStyle(document.documentElement);

  for (const name of [...tones, "panel", "line"] as const) {
    const value = styles?.getPropertyValue(`--color-${name}`).trim();
    palette[name] = value ? `rgb(${value})` : "currentColor";
  }

  return palette;
}

/** Resolves theme tokens to concrete colors; SVG attributes cannot read CSS variables directly. */
export function useChartPalette() {
  const [palette, setPalette] = useState(readPalette);

  useEffect(() => {
    const update = () => setPalette(readPalette());
    window.addEventListener("invest-hub:theme-change", update);
    return () => window.removeEventListener("invest-hub:theme-change", update);
  }, []);

  return palette;
}

/** Default colors the server assigns to categories, mapped onto the current theme tokens. */
const legacyColorTokens: Record<string, ChartTone> = {
  "#22c55e": "accent",
  "#38bdf8": "aqua",
  "#a78bfa": "violet",
  "#f59e0b": "amber",
  "#fb7185": "rose",
  "#14b8a6": "teal",
  "#8b9491": "muted"
};

export function resolveChartColor(color: string | undefined, palette: ChartPalette, index = 0) {
  if (!color) return palette[chartSequence[index % chartSequence.length]];
  const token = legacyColorTokens[color.toLowerCase()] ?? color;
  return (palette as Record<string, string>)[token] ?? color;
}

export function chartHeightStyle(height: number) {
  const minHeight = Math.min(220, height);
  return { height: `clamp(${minHeight}px, 58vw, ${height}px)` };
}

export const axisProps = {
  tickLine: false,
  axisLine: false,
  tickMargin: 10,
  minTickGap: 18
} as const;

interface TooltipEntry {
  name?: string | number;
  value?: unknown;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

interface ChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: TooltipEntry[];
  format: (value: number) => string;
  footer?: (entries: TooltipEntry[]) => ReactNode;
}

/** Tooltip card drawn with theme classes so it follows light and dark mode. */
export function ChartTooltip({ active, label, payload, format, footer }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="min-w-40 max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-elevated px-3 py-2.5 text-sm shadow-soft">
      {label !== undefined && label !== "" ? <p className="mb-1.5 text-xs font-medium text-muted">{label}</p> : null}
      <ul className="space-y-1">
        {payload.map((entry) => (
          <li key={String(entry.dataKey ?? entry.name)} className="flex items-center justify-between gap-4">
            <span className="flex min-w-0 items-center gap-2 text-muted">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: entry.color }} />
              <span className="truncate">{entry.name}</span>
            </span>
            <span className="font-semibold tabular-nums text-ink">{format(Number(entry.value))}</span>
          </li>
        ))}
      </ul>
      {footer ? footer(payload) : null}
    </div>
  );
}

export function ChartLegend({ items }: { items: Array<{ name: string; color: string; dashed?: boolean }> }) {
  if (items.length < 2) return null;

  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
      {items.map((item) => (
        <li key={item.name} className="flex items-center gap-2">
          <span
            className="h-0.5 w-4 rounded-full"
            style={item.dashed ? { backgroundImage: `linear-gradient(90deg, ${item.color} 55%, transparent 55%)`, backgroundSize: "6px 2px" } : { background: item.color }}
          />
          {item.name}
        </li>
      ))}
    </ul>
  );
}
