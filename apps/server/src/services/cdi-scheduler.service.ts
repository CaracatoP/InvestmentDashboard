import { env } from "../config/env";
import { recalculateCashBoxYields, refreshCdiRate } from "./cdi.service";

const schedulerState = globalThis as typeof globalThis & {
  __investmentDashboardCdiSchedulerStarted?: boolean;
};

function getCdiParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: env.cdiTimezone,
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

function shouldRunCdiRefresh(date: Date) {
  const parts = getCdiParts(date);
  return isWeekday(parts.weekday) && `${parts.hour}:${parts.minute}` === env.cdiUpdateHour;
}

export function startCdiScheduler() {
  if (schedulerState.__investmentDashboardCdiSchedulerStarted) return;
  schedulerState.__investmentDashboardCdiSchedulerStarted = true;

  let lastRunKey = "";

  setInterval(() => {
    const now = new Date();
    const parts = getCdiParts(now);
    const runKey = `${parts.weekday}-${parts.hour}:${parts.minute}`;

    if (!shouldRunCdiRefresh(now) || lastRunKey === runKey) return;

    lastRunKey = runKey;
    void refreshCdiRate()
      .then(() => recalculateCashBoxYields())
      .then((result) => {
        console.info(`CDI cashbox yield finished: ${result.applied} applied, ${result.skipped} skipped.`);
      });
  }, 60_000).unref();
}
