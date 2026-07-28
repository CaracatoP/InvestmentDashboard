import { env } from "../config/env";
import {
  createCashBoxYield,
  findCashBoxById,
  findCashBoxYield,
  findCdiRateByReferenceDate,
  getLatestCdiRate,
  getLatestCdiRateBeforeOrOn,
  listCashBoxes,
  listCdiRates,
  upsertCdiRate,
  updateCashBox
} from "../repositories/investment.repository";
import type { CashBoxMovementRecord, CashBoxRecord, CdiRateRecord, CdiRateSnapshot, CdiSource } from "../types/investment";
import { badRequest } from "../utils/http-error";
import { calculateCashBoxTotals, isCashBoxYield, toCashBoxContributionType } from "./cash-box.service";

const BCB_CDI_SERIES_CODE = 12;
const CDI_REQUEST_TIMEOUT_MS = 12_000;
const CDI_LOOKBACK_DAYS = 31;
const CDI_BUSINESS_DAYS_PER_YEAR = 252;
const CDI_BUSINESS_DAYS_PER_MONTH = 21;

interface CdiProviderResult {
  annualCdiRate: number;
  dailyCdiRate: number;
  referenceDate: string;
  source: CdiSource;
  fallbackReason?: string | null;
  fetchedAt: Date;
}

interface CdiRateProvider {
  name: CdiSource;
  fetchRate(referenceDate: Date): Promise<CdiProviderResult>;
}

interface BcbSeriesItem {
  data?: unknown;
  valor?: unknown;
}

export interface CdiYieldRecalculationResult {
  applied: number;
  skipped: number;
  cashBoxCount: number;
  referenceDate: string;
  yields: unknown[];
}

export interface CdiRefreshResult {
  rate: CdiRateSnapshot;
  recalculation: CdiYieldRecalculationResult;
}

const refreshPromises = new Map<string, Promise<CdiRateRecord>>();
let refreshAndRecalculatePromise: Promise<CdiRefreshResult> | null = null;

function serializeLogValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function logCdi(level: "info" | "warn", message: string, meta: Record<string, unknown> = {}) {
  const payload = Object.fromEntries(Object.entries(meta).filter(([, value]) => value !== undefined).map(([key, value]) => [key, serializeLogValue(value)]));
  const suffix = Object.keys(payload).length > 0 ? ` ${JSON.stringify(payload)}` : "";
  console[level](`[CDI] ${message}${suffix}`);
}

function normalizeCdiSource(source: string | null | undefined): CdiSource {
  const normalized = String(source ?? "").toLowerCase();
  if (normalized === "bcb") return "bcb";
  return "fallback";
}

function fallbackReasonFromRecord(record: CdiRateRecord | null | undefined) {
  if (!record) return null;
  if (typeof record.fallbackReason === "string" && record.fallbackReason.trim() !== "") return record.fallbackReason;
  const source = String(record.source ?? "");
  return source.startsWith("fallback:") ? source.slice("fallback:".length) : null;
}

function toSnapshot(record: CdiRateRecord): CdiRateSnapshot {
  return {
    rate: record.annualCdiRate,
    dailyRate: record.dailyCdiRate,
    referenceDate: record.referenceDate,
    source: normalizeCdiSource(record.source),
    updatedAt: record.fetchedAt,
    fallbackReason: fallbackReasonFromRecord(record)
  };
}

function validateNonNegativeNumber(value: number, message: string) {
  if (!Number.isFinite(value) || value < 0) throw badRequest(message);
}

export function percentToDecimal(percent: number) {
  validateNonNegativeNumber(percent, "Rate percent must be non-negative");
  return percent / 100;
}

export function decimalToPercent(decimal: number) {
  validateNonNegativeNumber(decimal, "Rate decimal must be non-negative");
  return decimal * 100;
}

export function equivalentRate(rateDecimal: number, periods: number) {
  validateNonNegativeNumber(rateDecimal, "Rate decimal must be non-negative");
  if (!Number.isInteger(periods) || periods <= 0) throw badRequest("Periods must be a positive integer");
  return Math.pow(1 + rateDecimal, periods) - 1;
}

// BCB series 12 returns the CDI as a daily percentage rate (% p.d.); this helper
// centralizes every conversion the app may need from that single source of truth.
export function convertBcbDailyPercentToRates(dailyRatePercent: number) {
  validateNonNegativeNumber(dailyRatePercent, "Daily CDI percent must be non-negative");

  const dailyRate = percentToDecimal(dailyRatePercent);
  const monthlyRate = equivalentRate(dailyRate, CDI_BUSINESS_DAYS_PER_MONTH);
  const annualRate = equivalentRate(dailyRate, CDI_BUSINESS_DAYS_PER_YEAR);

  return {
    dailyRatePercent,
    dailyRate,
    monthlyRate,
    monthlyRatePercent: decimalToPercent(monthlyRate),
    annualRate,
    annualRatePercent: decimalToPercent(annualRate)
  };
}

export function annualRateToDailyRate(annualRatePercent: number, businessDays = CDI_BUSINESS_DAYS_PER_YEAR) {
  validateNonNegativeNumber(annualRatePercent, "Annual CDI rate must be non-negative");
  if (!Number.isInteger(businessDays) || businessDays <= 0) throw badRequest("Business days must be a positive integer");
  return Math.pow(1 + percentToDecimal(annualRatePercent), 1 / businessDays) - 1;
}

class FallbackCdiProvider implements CdiRateProvider {
  name: CdiSource = "fallback";

  constructor(private readonly reason: string | null = null) {}

  async fetchRate(referenceDate: Date): Promise<CdiProviderResult> {
    const annualCdiRate = env.cdiRateFallback;
    const clampedReferenceDate = clampReferenceDate(toReferenceDate(referenceDate));

    validateNonNegativeNumber(annualCdiRate, "Fallback annual CDI rate must be non-negative");

    return {
      annualCdiRate,
      dailyCdiRate: annualRateToDailyRate(annualCdiRate),
      referenceDate: clampedReferenceDate,
      source: this.name,
      fallbackReason: this.reason,
      fetchedAt: new Date()
    };
  }
}

class BcbCdiProvider implements CdiRateProvider {
  name: CdiSource = "bcb";

  async fetchRate(referenceDate: Date): Promise<CdiProviderResult> {
    const requestedReferenceDate = clampReferenceDate(toReferenceDate(referenceDate));
    const startReferenceDate = addDays(requestedReferenceDate, -CDI_LOOKBACK_DAYS);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CDI_REQUEST_TIMEOUT_MS);
    const startedAt = Date.now();
    const url = new URL(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${BCB_CDI_SERIES_CODE}/dados`);

    url.searchParams.set("formato", "json");
    url.searchParams.set("dataInicial", referenceDateToBrazilianDate(startReferenceDate));
    url.searchParams.set("dataFinal", referenceDateToBrazilianDate(requestedReferenceDate));

    logCdi("info", "Buscando taxa no Banco Central", {
      source: this.name,
      series: BCB_CDI_SERIES_CODE,
      requestedReferenceDate
    });

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const responseText = await response.text();
      let payload: unknown;

      try {
        payload = JSON.parse(responseText);
      } catch {
        throw new Error("Invalid JSON payload");
      }

      if (!Array.isArray(payload)) throw new Error("Unexpected BCB payload");

      const latest = pickLatestValidBcbEntry(payload as BcbSeriesItem[], requestedReferenceDate);
      if (!latest) throw new Error("BCB returned no valid CDI values");

      const converted = convertBcbDailyPercentToRates(latest.dailyRatePercent);

      logCdi("info", "Taxa obtida com sucesso", {
        source: this.name,
        referenceDate: latest.referenceDate,
        durationMs: Date.now() - startedAt
      });

      return {
        annualCdiRate: converted.annualRatePercent,
        dailyCdiRate: converted.dailyRate,
        referenceDate: latest.referenceDate,
        source: this.name,
        fetchedAt: new Date()
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Request timeout");
      }

      const message = error instanceof Error ? error.message : "Unknown BCB provider error";
      throw new Error(message);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function getProvider() {
  if (env.cdiProvider === "fallback") return new FallbackCdiProvider("Configured provider");
  return new BcbCdiProvider();
}

function parseBcbRatePercent(value: unknown) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (normalized === "") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function brazilianDateToReferenceDate(value: string) {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;

  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function pickLatestValidBcbEntry(entries: BcbSeriesItem[], maxReferenceDate: string) {
  for (const entry of [...entries].reverse()) {
    const referenceDate = typeof entry.data === "string" ? brazilianDateToReferenceDate(entry.data) : null;
    if (!referenceDate || referenceDate > maxReferenceDate) continue;

    const dailyRatePercent = parseBcbRatePercent(entry.valor);
    if (dailyRatePercent === null || dailyRatePercent < 0) continue;

    return {
      referenceDate,
      dailyRatePercent
    };
  }

  return null;
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

function clampReferenceDate(referenceDate: string) {
  const today = toReferenceDate(new Date());
  return referenceDate > today ? today : referenceDate;
}

function referenceDateToUtcDate(referenceDate: string) {
  return new Date(`${referenceDate}T12:00:00.000Z`);
}

function referenceDateToBrazilianDate(referenceDate: string) {
  const [year, month, day] = referenceDate.split("-");
  return `${day}/${month}/${year}`;
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

async function persistCdiRate(input: CdiProviderResult) {
  const existingForDate = await findCdiRateByReferenceDate(input.referenceDate);

  if (input.source === "fallback" && existingForDate && normalizeCdiSource(existingForDate.source) === "bcb") {
    logCdi("warn", "Mantendo taxa valida do Banco Central ja armazenada", {
      referenceDate: input.referenceDate,
      fallbackReason: input.fallbackReason ?? null
    });
    return existingForDate;
  }

  return upsertCdiRate({
    annualCdiRate: input.annualCdiRate,
    dailyCdiRate: input.dailyCdiRate,
    referenceDate: input.referenceDate,
    source: input.source,
    fallbackReason: input.fallbackReason ?? null,
    fetchedAt: input.fetchedAt
  });
}

async function performRefreshCdiRate(referenceDate = new Date()) {
  const requestedReferenceDate = clampReferenceDate(toReferenceDate(referenceDate));
  const provider = getProvider();

  if (provider.name === "fallback") {
    logCdi("info", "Provider configurado explicitamente como fallback", {
      source: provider.name,
      requestedReferenceDate
    });

    const fallbackRate = await provider.fetchRate(referenceDate);
    return persistCdiRate(fallbackRate);
  }

  const startedAt = Date.now();

  try {
    const rate = await provider.fetchRate(referenceDate);
    const persisted = await persistCdiRate(rate);

    logCdi("info", "Atualizacao concluida", {
      source: normalizeCdiSource(persisted.source),
      referenceDate: persisted.referenceDate,
      durationMs: Date.now() - startedAt
    });

    return persisted;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown provider error";
    const durationMs = Date.now() - startedAt;
    const latestStoredBcbRate = await getLatestCdiRateBeforeOrOn(requestedReferenceDate);

    if (latestStoredBcbRate && normalizeCdiSource(latestStoredBcbRate.source) === "bcb") {
      logCdi("warn", "API do BCB indisponivel, reutilizando ultima taxa valida armazenada", {
        source: "bcb",
        requestedReferenceDate,
        referenceDate: latestStoredBcbRate.referenceDate,
        durationMs,
        reason
      });
      return latestStoredBcbRate;
    }

    logCdi("warn", "API do BCB indisponivel, utilizando fallback", {
      source: "fallback",
      requestedReferenceDate,
      durationMs,
      reason
    });

    const fallbackRate = await new FallbackCdiProvider(reason).fetchRate(referenceDate);
    const persisted = await persistCdiRate(fallbackRate);

    logCdi("info", "Atualizacao concluida", {
      source: normalizeCdiSource(persisted.source),
      referenceDate: persisted.referenceDate,
      durationMs
    });

    return persisted;
  }
}

export async function refreshCdiRate(referenceDate = new Date()): Promise<CdiRateRecord> {
  const requestKey = clampReferenceDate(toReferenceDate(referenceDate));
  const inFlight = refreshPromises.get(requestKey);
  if (inFlight) {
    logCdi("info", "Atualizacao ja em andamento, aguardando a execucao atual", {
      referenceDate: requestKey
    });
    return inFlight;
  }

  const promise = performRefreshCdiRate(referenceDate).finally(() => {
    refreshPromises.delete(requestKey);
  });

  refreshPromises.set(requestKey, promise);
  return promise;
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

  const latest = await getLatestCdiRateBeforeOrOn(referenceDate);
  if (latest) return latest;
  return refreshCdiRate(referenceDateToUtcDate(referenceDate));
}

export async function recalculateCashBoxYields(input: { from?: string; to?: string; cashBoxId?: string } = {}): Promise<CdiYieldRecalculationResult> {
  const to = clampReferenceDate(toReferenceDate(input.to ?? new Date()));
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
      if (rate.source !== "cashbox-override" && rate.referenceDate !== referenceDate) {
        skipped += 1;
        continue;
      }

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

  logCdi("info", "Recalculo de rendimentos concluido", {
    referenceDate: to,
    cashBoxCount: activeCashBoxes.length,
    applied,
    skipped
  });

  return {
    applied,
    skipped,
    cashBoxCount: activeCashBoxes.length,
    referenceDate: to,
    yields
  };
}

export async function refreshCdiAndRecalculate(referenceDate = new Date()): Promise<CdiRefreshResult> {
  if (refreshAndRecalculatePromise) {
    logCdi("info", "Atualizacao de CDI e recalc em andamento, reutilizando a mesma execucao");
    return refreshAndRecalculatePromise;
  }

  refreshAndRecalculatePromise = (async () => {
    const rate = await refreshCdiRate(referenceDate);
    const recalculation = await recalculateCashBoxYields();

    return {
      rate: toSnapshot(rate),
      recalculation
    };
  })().finally(() => {
    refreshAndRecalculatePromise = null;
  });

  return refreshAndRecalculatePromise;
}

export async function getCdiStatus() {
  const latest = (await getLatestCdiRate()) ?? (await refreshCdiRate());
  const history = await listCdiRates(30);

  return {
    ...toSnapshot(latest),
    provider: env.cdiProvider === "fallback" ? "fallback" : "bcb",
    timezone: env.cdiTimezone,
    updateHour: env.cdiUpdateHour,
    schedulersEnabled: env.enableSchedulers,
    fallbackAnnualRate: env.cdiRateFallback,
    history: history.map(toSnapshot)
  };
}
