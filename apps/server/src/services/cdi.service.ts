import { env } from "../config/env";
import {
  createCashBoxYield,
  findCashBoxById,
  findCashBoxYield,
  getLatestCdiRate,
  listCashBoxes,
  listCdiRates,
  upsertCdiRate,
  updateCashBox
} from "../repositories/investment.repository";
import type { CashBoxMovementRecord, CashBoxRecord, CdiRateRecord } from "../types/investment";
import { badRequest } from "../utils/http-error";
import { calculateCashBoxTotals, isCashBoxYield, toCashBoxContributionType } from "./cash-box.service";

interface CdiProviderResult {
  annualCdiRate: number;
  dailyCdiRate?: number;
  referenceDate: string;
  source: string;
}

interface CdiRateProvider {
  name: string;
  fetchRate(referenceDate: Date): Promise<CdiProviderResult>;
}

class FallbackCdiProvider implements CdiRateProvider {
  name = "fallback";

  async fetchRate(referenceDate: Date): Promise<CdiProviderResult> {
    return {
      annualCdiRate: env.cdiRateFallback,
      referenceDate: toReferenceDate(referenceDate),
      source: this.name
    };
  }
}

class BcbCdiProvider implements CdiRateProvider {
  name = "bcb";

  async fetchRate(referenceDate: Date): Promise<CdiProviderResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch("https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados/ultimos/1?formato=json", {
        signal: controller.signal
      });

      if (!response.ok) throw new Error(`CDI provider failed with status ${response.status}`);

      const payload = (await response.json()) as Array<{ data?: string; valor?: string }>;
      const item = payload[0];
      const dailyPercent = Number(String(item?.valor ?? "").replace(",", "."));

      if (!Number.isFinite(dailyPercent) || dailyPercent < 0) throw new Error("CDI provider returned an invalid rate");

      const dailyCdiRate = dailyPercent / 100;
      const annualCdiRate = (Math.pow(1 + dailyCdiRate, 252) - 1) * 100;

      return {
        annualCdiRate,
        dailyCdiRate,
        referenceDate: item?.data ? brazilianDateToReferenceDate(item.data) : toReferenceDate(referenceDate),
        source: this.name
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function getProvider(): CdiRateProvider {
  if (env.cdiProvider.toLowerCase() === "bcb") return new BcbCdiProvider();
  return new FallbackCdiProvider();
}

function brazilianDateToReferenceDate(value: string) {
  const [day, month, year] = value.split("/");
  if (!day || !month || !year) return toReferenceDate(new Date());
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function getTimeZoneParts(date: Date, timeZone = env.cdiTimezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  return {
    year: parts.find((part) => part.type === "year")?.value ?? "1970",
    month: parts.find((part) => part.type === "month")?.value ?? "01",
    day: parts.find((part) => part.type === "day")?.value ?? "01",
    weekday: parts.find((part) => part.type === "weekday")?.value ?? "",
    hour: parts.find((part) => part.type === "hour")?.value ?? "00",
    minute: parts.find((part) => part.type === "minute")?.value ?? "00"
  };
}

export function toReferenceDate(date: string | Date, timeZone = env.cdiTimezone) {
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const value = typeof date === "string" ? new Date(date) : date;
  const parts = getTimeZoneParts(value, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function referenceDateToUtcDate(referenceDate: string) {
  return new Date(`${referenceDate}T12:00:00.000Z`);
}

function addDays(referenceDate: string, days: number) {
  const date = referenceDateToUtcDate(referenceDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isBusinessDay(referenceDate: string | Date) {
  const date = typeof referenceDate === "string" ? referenceDateToUtcDate(toReferenceDate(referenceDate)) : referenceDate;
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}

export function getBusinessDatesBetween(from: string | Date, to: string | Date) {
  const start = toReferenceDate(from);
  const end = toReferenceDate(to);
  const dates: string[] = [];
  let cursor = addDays(start, 1);

  while (cursor <= end) {
    if (isBusinessDay(cursor)) dates.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return dates;
}

export function annualRateToDailyRate(annualRatePercent: number, businessDays = 252) {
  if (!Number.isFinite(annualRatePercent) || annualRatePercent < 0) throw badRequest("Annual CDI rate must be non-negative");
  return Math.pow(1 + annualRatePercent / 100, 1 / businessDays) - 1;
}

export function calculateDailyCashBoxYield(balance: number, annualRatePercent: number, cdiPercentage: number) {
  if (balance <= 0 || cdiPercentage <= 0) return 0;
  return balance * annualRateToDailyRate(annualRatePercent) * (cdiPercentage / 100);
}

function movementDelta(movement: CashBoxMovementRecord) {
  const type = toCashBoxContributionType(movement.type);
  if (type === "withdrawal") return -movement.value;
  return movement.value;
}

function nonYieldMovementDelta(movement: CashBoxMovementRecord) {
  const type = toCashBoxContributionType(movement.type);
  if (type === "yield") return 0;
  return movementDelta(movement);
}

function calculateBalanceThrough(cashBox: CashBoxRecord, referenceDate: string) {
  const initialBalance = cashBox.initialBalance ?? 0;
  const movementsBalance = (cashBox.movements ?? [])
    .filter((movement) => toReferenceDate(movement.date) <= referenceDate)
    .reduce((total, movement) => total + movementDelta(movement), 0);

  return Math.max(initialBalance + movementsBalance, 0);
}

function nonYieldMovementsOnDate(cashBox: CashBoxRecord, referenceDate: string) {
  return (cashBox.movements ?? [])
    .filter((movement) => toReferenceDate(movement.date) === referenceDate)
    .reduce((total, movement) => total + nonYieldMovementDelta(movement), 0);
}

export async function refreshCdiRate(referenceDate = new Date()): Promise<CdiRateRecord> {
  const provider = getProvider();

  try {
    const fetched = await provider.fetchRate(referenceDate);
    const dailyCdiRate = fetched.dailyCdiRate ?? annualRateToDailyRate(fetched.annualCdiRate);

    return upsertCdiRate({
      annualCdiRate: fetched.annualCdiRate,
      dailyCdiRate,
      referenceDate: fetched.referenceDate,
      source: fetched.source,
      fetchedAt: new Date()
    });
  } catch (error) {
    const dailyCdiRate = annualRateToDailyRate(env.cdiRateFallback);

    return upsertCdiRate({
      annualCdiRate: env.cdiRateFallback,
      dailyCdiRate,
      referenceDate: toReferenceDate(referenceDate),
      source: `fallback:${error instanceof Error ? error.message : "provider-error"}`,
      fetchedAt: new Date()
    });
  }
}

async function getRateForCalculation(referenceDate: string, annualRateOverride?: number) {
  if (annualRateOverride !== undefined) {
    return {
      annualCdiRate: annualRateOverride,
      dailyCdiRate: annualRateToDailyRate(annualRateOverride),
      referenceDate,
      source: "cashbox-override",
      fetchedAt: new Date()
    };
  }

  const latest = await getLatestCdiRate();
  if (latest) return latest;
  return refreshCdiRate(referenceDateToUtcDate(referenceDate));
}

export async function recalculateCashBoxYields(input: { from?: string; to?: string; cashBoxId?: string } = {}) {
  const to = toReferenceDate(input.to ?? new Date());
  const cashBoxes = input.cashBoxId ? [await findCashBoxById(input.cashBoxId)] : await listCashBoxes();
  const activeCashBoxes = cashBoxes.filter((cashBox): cashBox is NonNullable<typeof cashBox> => Boolean(cashBox?.active));
  let applied = 0;
  let skipped = 0;
  const yields = [];

  for (const cashBox of activeCashBoxes) {
    if (!cashBox.id) continue;
    let workingTotalYield = cashBox.totalYield ?? calculateCashBoxTotals(cashBox).totalYield;
    let workingMovements = [...(cashBox.movements ?? [])];
    let lastCalculationDate = input.from ?? cashBox.lastYieldCalculationAt ?? cashBox.createdAt;
    let workingBalance = calculateBalanceThrough(cashBox, toReferenceDate(lastCalculationDate));
    const dates = getBusinessDatesBetween(lastCalculationDate, to);

    for (const referenceDate of dates) {
      const existing = await findCashBoxYield(cashBox.id, referenceDate);
      if (existing) {
        skipped += 1;
        workingBalance = existing.closingBalance;
        lastCalculationDate = referenceDate;
        continue;
      }

      const rate = await getRateForCalculation(referenceDate, cashBox.annualRateOverride);
      workingBalance = Math.max(workingBalance + nonYieldMovementsOnDate(cashBox, referenceDate), 0);
      const yieldValue = calculateDailyCashBoxYield(workingBalance, rate.annualCdiRate, cashBox.cdiPercentage);
      const closingBalance = workingBalance + yieldValue;

      const yieldRecord = await createCashBoxYield({
        cashBoxId: cashBox.id,
        referenceDate,
        openingBalance: workingBalance,
        yieldValue,
        closingBalance,
        annualCdiRate: rate.annualCdiRate,
        dailyCdiRate: rate.dailyCdiRate,
        cdiPercentage: cashBox.cdiPercentage,
        source: rate.source,
        calculatedAt: new Date()
      });

      const hasMovement = workingMovements.some(
        (movement) => isCashBoxYield(toCashBoxContributionType(movement.type)) && toReferenceDate(movement.date) === referenceDate
      );
      workingMovements = hasMovement
        ? workingMovements
        : [
            ...workingMovements,
            {
              type: "yield" as const,
              value: yieldValue,
              date: referenceDate,
              description: `Rendimento CDI ${cashBox.cdiPercentage}%`
            }
          ];
      workingTotalYield += yieldValue;

      await updateCashBox(cashBox.id, {
        movements: workingMovements,
        currentBalance: closingBalance,
        totalYield: workingTotalYield,
        lastYieldCalculationAt: referenceDate
      });

      yields.push(yieldRecord);
      workingBalance = closingBalance;
      lastCalculationDate = referenceDate;
      applied += 1;
    }
  }

  return {
    applied,
    skipped,
    cashBoxCount: activeCashBoxes.length,
    referenceDate: to,
    yields
  };
}

export async function getCdiStatus() {
  const latest = await getLatestCdiRate();
  const history = await listCdiRates(30);

  return {
    provider: env.cdiProvider,
    timezone: env.cdiTimezone,
    updateHour: env.cdiUpdateHour,
    fallbackAnnualRate: env.cdiRateFallback,
    latest,
    history
  };
}
