import { lazy, Suspense, type ReactNode } from "react";
import { DeferredRender, getDeferredPlaceholderStyle } from "../ui/DeferredRender";
import type { AreaChartProps } from "./AreaChart";
import type { BarChartProps } from "./BarChart";
import type { LineChartProps } from "./LineChart";
import type { PieChartProps } from "./PieChart";
import type { PriceHistoryChartProps } from "./PriceHistoryChart";

const AreaChartModule = lazy(() => import("./AreaChart").then((module) => ({ default: module.AreaChart })));
const BarChartModule = lazy(() => import("./BarChart").then((module) => ({ default: module.BarChart })));
const LineChartModule = lazy(() => import("./LineChart").then((module) => ({ default: module.LineChart })));
const PieChartModule = lazy(() => import("./PieChart").then((module) => ({ default: module.PieChart })));
const PriceHistoryChartModule = lazy(() => import("./PriceHistoryChart").then((module) => ({ default: module.PriceHistoryChart })));

interface ChartLoadingFallbackProps {
  height?: number;
  label?: string;
}

export function ChartLoadingFallback({ height = 280, label = "Carregando grafico..." }: ChartLoadingFallbackProps) {
  return (
    <div
      className="min-w-0 animate-pulse rounded-lg border border-line/70 bg-elevated/40"
      style={getDeferredPlaceholderStyle(height)}
      role="status"
      aria-label={label}
    >
      <span className="sr-only">{label}</span>
    </div>
  );
}

function renderDeferredChart(chart: ReactNode, height?: number) {
  const fallback = <ChartLoadingFallback height={height} />;

  return (
    <DeferredRender fallback={fallback}>
      <Suspense fallback={fallback}>{chart}</Suspense>
    </DeferredRender>
  );
}

export function LazyAreaChart(props: AreaChartProps) {
  return renderDeferredChart(<AreaChartModule {...props} />, props.height);
}

export function LazyBarChart(props: BarChartProps) {
  return renderDeferredChart(<BarChartModule {...props} />, props.height);
}

export function LazyLineChart(props: LineChartProps) {
  return renderDeferredChart(<LineChartModule {...props} />, props.height);
}

export function LazyPieChart(props: PieChartProps) {
  return renderDeferredChart(<PieChartModule {...props} />, props.height);
}

export function LazyPriceHistoryChart(props: PriceHistoryChartProps) {
  return renderDeferredChart(<PriceHistoryChartModule {...props} />, props.height);
}
