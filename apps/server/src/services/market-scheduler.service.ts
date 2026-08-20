import { env } from "../config/env";
import { refreshAllMarketQuotes } from "./market-data.service";

const schedulerState = globalThis as typeof globalThis & {
  __investmentDashboardMarketSchedulerStarted?: boolean;
};

function getSaoPauloParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: env.marketTimezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  return {
    weekday: parts.find((part) => part.type === "weekday")?.value ?? "",
    hour: parts.find((part) => part.type === "hour")?.value ?? "00",
    minute: parts.find((part) => part.type === "minute")?.value ?? "00"
  };
}

function isWeekday(weekday: string) {
  return !["Sat", "Sun"].includes(weekday);
}

function shouldRunMarketRefresh(date: Date) {
  const parts = getSaoPauloParts(date);
  return isWeekday(parts.weekday) && env.marketRefreshHours.includes(`${parts.hour}:${parts.minute}`);
}

export function startMarketScheduler() {
  if (schedulerState.__investmentDashboardMarketSchedulerStarted) return;
  schedulerState.__investmentDashboardMarketSchedulerStarted = true;

  let lastRunKey = "";
  let isRunning = false;

  setInterval(() => {
    const now = new Date();
    const parts = getSaoPauloParts(now);
    const runKey = `${parts.weekday}-${parts.hour}:${parts.minute}`;

    if (!shouldRunMarketRefresh(now) || lastRunKey === runKey || isRunning) return;

    lastRunKey = runKey;
    isRunning = true;
    void refreshAllMarketQuotes()
      .then((result) => {
        console.info(`Market refresh finished: ${result.updated}/${result.total} updated.`);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Unknown market scheduler error";
        console.warn(`Market scheduler failed: ${message}`);
      })
      .finally(() => {
        isRunning = false;
      });
  }, 60_000).unref();
}
