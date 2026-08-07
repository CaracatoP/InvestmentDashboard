import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { getDeferredPlaceholderStyle } from "../src/components/ui/DeferredRender";

const root = resolve(import.meta.dirname, "..");

test("chart loader imports chart modules dynamically without importing recharts directly", () => {
  const source = readFileSync(resolve(root, "src/components/charts/LazyCharts.tsx"), "utf8");

  assert.match(source, /lazy\(\(\) => import\("\.\/LineChart"\)/);
  assert.match(source, /lazy\(\(\) => import\("\.\/BarChart"\)/);
  assert.match(source, /lazy\(\(\) => import\("\.\/PieChart"\)/);
  assert.match(source, /lazy\(\(\) => import\("\.\/PriceHistoryChart"\)/);
  assert.doesNotMatch(source, /from "recharts"/);
});

test("chart consumers use deferred chart entrypoints", () => {
  const consumers = [
    "src/pages/DashboardPage.tsx",
    "src/pages/DividendsPage.tsx",
    "src/pages/RebalancingPage.tsx",
    "src/pages/PortfolioPage.tsx",
    "src/pages/AssetPage.tsx",
    "src/pages/ProjectionsPage.tsx",
    "src/pages/CashBoxesPage.tsx",
    "src/components/planning/PlanningWorkspace.tsx"
  ];

  for (const file of consumers) {
    const source = readFileSync(resolve(root, file), "utf8");
    assert.doesNotMatch(source, /components\/charts\/(?:AreaChart|BarChart|LineChart|PieChart|PriceHistoryChart)|"\.\.\/charts\/(?:AreaChart|BarChart|LineChart|PieChart)"/);
  }
});

test("deferred chart fallback keeps the expected chart height contract", () => {
  assert.deepEqual(getDeferredPlaceholderStyle(180), { height: "clamp(180px, 58vw, 180px)" });
  assert.deepEqual(getDeferredPlaceholderStyle(280), { height: "clamp(220px, 58vw, 280px)" });
});
