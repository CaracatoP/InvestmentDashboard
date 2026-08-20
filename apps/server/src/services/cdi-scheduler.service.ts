import { env } from "../config/env";
import { runWithAuthContext } from "../auth/auth-context";
import { getLatestCdiRate } from "../repositories/investment.repository";
import { refreshCdiAndRecalculate, toReferenceDate } from "./cdi.service";
import { listUsers } from "./auth.service";

const schedulerState = globalThis as typeof globalThis & {
  __investmentDashboardCdiSchedulerStarted?: boolean;
  __investmentDashboardCdiSchedulerTimer?: ReturnType<typeof setInterval>;
};

function logCdiScheduler(level: "info" | "warn", message: string, meta: Record<string, unknown> = {}) {
  const payload = Object.fromEntries(Object.entries(meta).filter(([, value]) => value !== undefined));
  const suffix = Object.keys(payload).length > 0 ? ` ${JSON.stringify(payload)}` : "";
  console[level](`[CDI] ${message}${suffix}`);
}

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
    hour: Number(parts.find((part) => part.type === "hour")?.value ?? "0"),
    minute: Number(parts.find((part) => part.type === "minute")?.value ?? "0")
  };
}

function isWeekday(weekday: string) {
  return !["Sat", "Sun"].includes(weekday);
}

export function shouldRunCdiRefresh(date: Date) {
  const parts = getCdiParts(date);
  return isWeekday(parts.weekday) && parts.hour === env.cdiUpdateHour && parts.minute === 0;
}

export function shouldRunStartupCdiRefresh(date: Date, latestReferenceDate?: string | null) {
  if (!latestReferenceDate) return true;

  const parts = getCdiParts(date);
  if (!isWeekday(parts.weekday)) return false;

  return parts.hour >= env.cdiUpdateHour && latestReferenceDate < toReferenceDate(date);
}

async function runScheduledRefresh(trigger: "startup" | "interval") {
  try {
    const activeUsers = (await listUsers()).filter((user) => user.status === "active");
    let lastResult: Awaited<ReturnType<typeof refreshCdiAndRecalculate>> | null = null;
    let applied = 0;
    let skipped = 0;

    for (const user of activeUsers) {
      const result = await runWithAuthContext({ userId: user.id, role: user.role, email: user.email, channel: "system" }, () =>
        refreshCdiAndRecalculate()
      );
      lastResult = result;
      applied += result.recalculation.applied;
      skipped += result.recalculation.skipped;
    }

    if (!lastResult) {
      logCdiScheduler("info", "Nenhum usuario ativo para recalculo", { trigger });
      return;
    }

    logCdiScheduler("info", "Atualizacao e recalculo concluidos", {
      trigger,
      source: lastResult.rate.source,
      referenceDate: lastResult.rate.referenceDate,
      applied,
      skipped
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown CDI scheduler error";
    logCdiScheduler("warn", "Scheduler falhou", {
      trigger,
      reason: message
    });
  }
}

export function resetCdiSchedulerStateForTests() {
  if (schedulerState.__investmentDashboardCdiSchedulerTimer) {
    clearInterval(schedulerState.__investmentDashboardCdiSchedulerTimer);
  }

  schedulerState.__investmentDashboardCdiSchedulerStarted = false;
  schedulerState.__investmentDashboardCdiSchedulerTimer = undefined;
}

export function startCdiScheduler(options: { skipInitialRefresh?: boolean } = {}) {
  if (!env.enableSchedulers) {
    logCdiScheduler("info", "Scheduler desativado por configuracao");
    return { started: false, reason: "disabled" as const };
  }

  if (schedulerState.__investmentDashboardCdiSchedulerStarted) {
    return { started: false, reason: "already-started" as const };
  }

  schedulerState.__investmentDashboardCdiSchedulerStarted = true;
  let lastRunKey = "";

  if (!options.skipInitialRefresh) {
    void getLatestCdiRate()
      .then((latest) => {
        const now = new Date();
        if (!shouldRunStartupCdiRefresh(now, latest?.referenceDate ?? null)) return;

        const parts = getCdiParts(now);
        if (shouldRunCdiRefresh(now)) {
          lastRunKey = `${parts.weekday}-${parts.hour}:${String(parts.minute).padStart(2, "0")}`;
        }

        void runScheduledRefresh("startup");
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Unknown startup refresh error";
        logCdiScheduler("warn", "Falha ao decidir refresh inicial", { reason: message });
      });
  }

  schedulerState.__investmentDashboardCdiSchedulerTimer = setInterval(() => {
    const now = new Date();
    const parts = getCdiParts(now);
    const runKey = `${parts.weekday}-${parts.hour}:${String(parts.minute).padStart(2, "0")}`;

    if (!shouldRunCdiRefresh(now) || lastRunKey === runKey) return;

    lastRunKey = runKey;
    void runScheduledRefresh("interval");
  }, 60_000);

  schedulerState.__investmentDashboardCdiSchedulerTimer.unref();

  return { started: true as const };
}
