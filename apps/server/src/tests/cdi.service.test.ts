import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { env } from "../config/env";
import {
  annualRateToDailyRate,
  calculateDailyCashBoxYield,
  convertBcbDailyPercentToRates,
  equivalentRate,
  getBusinessDatesBetween,
  isBusinessDay,
  refreshCdiAndRecalculate,
  refreshCdiRate
} from "../services/cdi.service";

const originalFetch = global.fetch;
const originalCdiProvider = env.cdiProvider;
const originalCdiRateFallback = env.cdiRateFallback;

function jsonResponse(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) }
  });
}

function textResponse(payload: string, init: ResponseInit = {}) {
  return new Response(payload, {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) }
  });
}

beforeEach(() => {
  env.cdiProvider = "bcb";
  env.cdiRateFallback = 10.65;
  global.fetch = originalFetch;
});

afterEach(() => {
  env.cdiProvider = originalCdiProvider;
  env.cdiRateFallback = originalCdiRateFallback;
  global.fetch = originalFetch;
});

test("annualRateToDailyRate uses 252 business days equivalent rate", () => {
  const annualRate = 13.65;
  const dailyRate = annualRateToDailyRate(annualRate);
  const annualized = (Math.pow(1 + dailyRate, 252) - 1) * 100;

  assert.ok(dailyRate > 0);
  assert.ok(Math.abs(annualized - annualRate) < 0.000001);
});

test("convertBcbDailyPercentToRates keeps units consistent across daily monthly and annual forms", () => {
  const converted = convertBcbDailyPercentToRates(0.052531);

  assert.ok(Math.abs(converted.dailyRate - 0.00052531) < 0.000000000001);
  assert.ok(Math.abs(converted.monthlyRate - equivalentRate(converted.dailyRate, 21)) < 0.000000000001);
  assert.ok(Math.abs(converted.annualRate - equivalentRate(converted.dailyRate, 252)) < 0.000000000001);
  assert.ok(Math.abs(converted.annualRatePercent - (Math.pow(1 + converted.dailyRate, 252) - 1) * 100) < 0.000000000001);
});

test("daily cashbox yield applies CDI percentage over equivalent business-day rate", () => {
  const yieldValue = calculateDailyCashBoxYield(1000, 13.65, 100);
  const incorrectCalendarDayYield = 1000 * (13.65 / 100 / 365);

  assert.ok(yieldValue > 0);
  assert.notEqual(Number(yieldValue.toFixed(8)), Number(incorrectCalendarDayYield.toFixed(8)));
});

test("business dates ignore weekends", () => {
  const dates = getBusinessDatesBetween("2026-07-24", "2026-07-28");

  assert.deepEqual(dates, ["2026-07-27", "2026-07-28"]);
  assert.equal(isBusinessDay("2026-07-25"), false);
  assert.equal(isBusinessDay("2026-07-27"), true);
});

test("refreshCdiRate uses Banco Central as the default source and converts the daily percent correctly", async () => {
  global.fetch = (async () =>
    jsonResponse([
      { data: "23/07/2026", valor: "0.052500" },
      { data: "24/07/2026", valor: "0.052531" }
    ])) as typeof fetch;

  const rate = await refreshCdiRate(new Date("2026-07-28T12:00:00.000Z"));

  assert.equal(rate.source, "bcb");
  assert.equal(rate.referenceDate, "2026-07-24");
  assert.ok(Math.abs(rate.dailyCdiRate - 0.00052531) < 0.000000000001);
  assert.ok(Math.abs(rate.annualCdiRate - convertBcbDailyPercentToRates(0.052531).annualRatePercent) < 0.000000000001);
});

test("refreshCdiRate uses the last valid BCB value on weekends and days without a new publication", async () => {
  let capturedUrl = "";

  global.fetch = (async (input) => {
    capturedUrl = String(input);
    return jsonResponse([{ data: "24/07/2026", valor: "0.052531" }]);
  }) as typeof fetch;

  const rate = await refreshCdiRate(new Date("2026-07-26T12:00:00.000Z"));

  assert.equal(rate.source, "bcb");
  assert.equal(rate.referenceDate, "2026-07-24");
  assert.ok(capturedUrl.includes("dataFinal=26%2F07%2F2026"));
});

test("refreshCdiRate falls back automatically when the BCB list is empty", async () => {
  global.fetch = (async () => jsonResponse([])) as typeof fetch;

  const rate = await refreshCdiRate(new Date("2026-07-01T12:00:00.000Z"));

  assert.equal(rate.source, "fallback");
  assert.equal(rate.referenceDate, "2026-07-01");
  assert.equal(rate.fallbackReason, "BCB returned no valid CDI values");
  assert.equal(rate.annualCdiRate, env.cdiRateFallback);
});

test("refreshCdiRate falls back automatically on timeout", async () => {
  global.fetch = (async () => {
    const error = new Error("aborted");
    error.name = "AbortError";
    throw error;
  }) as typeof fetch;

  const rate = await refreshCdiRate(new Date("2026-07-02T12:00:00.000Z"));

  assert.equal(rate.source, "fallback");
  assert.equal(rate.referenceDate, "2026-07-02");
  assert.equal(rate.fallbackReason, "Request timeout");
});

test("refreshCdiRate falls back automatically on HTTP errors", async () => {
  global.fetch = (async () => jsonResponse({ error: "unavailable" }, { status: 503 })) as typeof fetch;

  const rate = await refreshCdiRate(new Date("2026-07-03T12:00:00.000Z"));

  assert.equal(rate.source, "fallback");
  assert.equal(rate.referenceDate, "2026-07-03");
  assert.equal(rate.fallbackReason, "HTTP 503");
});

test("refreshCdiRate falls back automatically on invalid JSON", async () => {
  global.fetch = (async () => textResponse("{invalid-json")) as typeof fetch;

  const rate = await refreshCdiRate(new Date("2026-07-06T12:00:00.000Z"));

  assert.equal(rate.source, "fallback");
  assert.equal(rate.referenceDate, "2026-07-06");
  assert.equal(rate.fallbackReason, "Invalid JSON payload");
});

test("refreshCdiRate falls back automatically on invalid rates", async () => {
  global.fetch = (async () => jsonResponse([{ data: "07/07/2026", valor: "-1" }])) as typeof fetch;

  const rate = await refreshCdiRate(new Date("2026-07-07T12:00:00.000Z"));

  assert.equal(rate.source, "fallback");
  assert.equal(rate.referenceDate, "2026-07-07");
  assert.equal(rate.fallbackReason, "BCB returned no valid CDI values");
});

test("refreshCdiRate accepts explicit fallback provider without calling Banco Central", async () => {
  let calls = 0;
  env.cdiProvider = "fallback";
  global.fetch = (async () => {
    calls += 1;
    return jsonResponse([{ data: "08/07/2026", valor: "0.052531" }]);
  }) as typeof fetch;

  const rate = await refreshCdiRate(new Date("2026-07-08T12:00:00.000Z"));

  assert.equal(rate.source, "fallback");
  assert.equal(rate.referenceDate, "2026-07-08");
  assert.equal(calls, 0);
});

test("refreshCdiRate coalesces two simultaneous updates for the same reference date", async () => {
  let calls = 0;
  let resolveFetch: (value: Response) => void = () => undefined;

  global.fetch = (((_input: RequestInfo | URL) =>
    new Promise<Response>((resolve) => {
      calls += 1;
      resolveFetch = resolve;
    })) as unknown) as typeof fetch;

  const first = refreshCdiRate(new Date("2026-07-09T12:00:00.000Z"));
  const second = refreshCdiRate(new Date("2026-07-09T12:00:00.000Z"));

  assert.equal(calls, 1);
  resolveFetch(jsonResponse([{ data: "09/07/2026", valor: "0.052531" }]));

  const [left, right] = await Promise.all([first, second]);
  assert.equal(left.referenceDate, "2026-07-09");
  assert.equal(right.referenceDate, "2026-07-09");
  assert.equal(calls, 1);
});

test("refreshCdiAndRecalculate coalesces simultaneous manual refresh requests", async () => {
  let calls = 0;
  let resolveFetch: (value: Response) => void = () => undefined;

  global.fetch = (((_input: RequestInfo | URL) =>
    new Promise<Response>((resolve) => {
      calls += 1;
      resolveFetch = resolve;
    })) as unknown) as typeof fetch;

  const first = refreshCdiAndRecalculate(new Date("2026-07-10T12:00:00.000Z"));
  const second = refreshCdiAndRecalculate(new Date("2026-07-10T12:00:00.000Z"));

  assert.equal(calls, 1);
  resolveFetch(jsonResponse([{ data: "10/07/2026", valor: "0.052531" }]));

  const [left, right] = await Promise.all([first, second]);
  assert.equal(left.rate.referenceDate, "2026-07-10");
  assert.equal(right.rate.referenceDate, "2026-07-10");
  assert.equal(left.recalculation.applied, 0);
  assert.equal(right.recalculation.applied, 0);
  assert.equal(calls, 1);
});
