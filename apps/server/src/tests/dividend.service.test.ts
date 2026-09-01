import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { runWithAuthContext } from "../auth/auth-context";
import { findDividendById, listDividends } from "../repositories/investment.repository";
import { listAllMonthlyIncomeEntries } from "../repositories/monthly-planning.repository";
import { createDividendRecord, markDividendReceived, registerReceivedDividend } from "../services/dividend.service";
import { getDividendsOverview, getHistory } from "../services/portfolio.service";
import { getMonthlyPlanningOverview, saveMonthlyPlan } from "../services/monthly-planning.service";
import { HttpError } from "../utils/http-error";

function asUser<T>(userId: string, callback: () => Promise<T>) {
  return runWithAuthContext({ userId, role: "user", channel: "web" }, callback);
}

async function withMockedDate<T>(isoDate: string, callback: () => Promise<T>) {
  const RealDate = Date;

  class MockDate extends RealDate {
    constructor(...args: any[]) {
      switch (args.length) {
        case 0:
          super(isoDate);
          break;
        case 1:
          super(args[0]);
          break;
        case 2:
          super(args[0], args[1]);
          break;
        case 3:
          super(args[0], args[1], args[2]);
          break;
        case 4:
          super(args[0], args[1], args[2], args[3]);
          break;
        case 5:
          super(args[0], args[1], args[2], args[3], args[4]);
          break;
        case 6:
          super(args[0], args[1], args[2], args[3], args[4], args[5]);
          break;
        default:
          super(args[0], args[1], args[2], args[3], args[4], args[5], args[6]);
          break;
      }
    }

    static now() {
      return new RealDate(isoDate).getTime();
    }
  }

  globalThis.Date = MockDate as DateConstructor;
  try {
    return await callback();
  } finally {
    globalThis.Date = RealDate;
  }
}

function expectHttpStatus(statusCode: number) {
  return (error: unknown) => error instanceof HttpError && error.statusCode === statusCode;
}

test("dividends separate expected and received amounts", async () => {
  const userId = `dividend-status-${randomUUID()}`;

  await withMockedDate("2026-08-20T15:00:00.000Z", async () => asUser(userId, async () => {
    await createDividendRecord({
      assetTicker: "PETR4",
      type: "dividendo",
      totalValue: 85.4,
      valuePerShare: 0,
      amountPerShare: 0,
      paymentDate: "2026-08-20",
      status: "expected",
      source: "manual"
    });
    await createDividendRecord({
      assetTicker: "BBSE3",
      type: "dividendo",
      totalValue: 40,
      valuePerShare: 0,
      amountPerShare: 0,
      paymentDate: "2026-08-20",
      status: "received",
      source: "manual"
    });

    const overview = await getDividendsOverview();

    assert.equal(overview.totals.month, 40);
    assert.equal(overview.totals.year, 40);
    assert.equal(overview.totals.allTime, 40);
    assert.equal(overview.table.some((dividend) => dividend.assetTicker === "PETR4" && dividend.status === "expected"), true);
  }));
});

test("marking expected dividend as received updates the original record", async () => {
  const userId = `dividend-receive-${randomUUID()}`;

  await asUser(userId, async () => {
    const expected = await createDividendRecord({
      assetTicker: "PETR4",
      type: "dividendo",
      totalValue: 85.4,
      valuePerShare: 0,
      amountPerShare: 0,
      paymentDate: "2026-08-20",
      status: "expected",
      source: "manual"
    });
    assert.ok(expected.id);

    const received = await markDividendReceived(expected.id, {
      totalValue: 84.95,
      paymentDate: "2026-08-21",
      receivedAt: "2026-08-21"
    });
    const records = (await listDividends()).filter((dividend) => dividend.assetTicker === "PETR4");
    const history = await getHistory();

    assert.equal(received.id, expected.id);
    assert.equal(received.status, "received");
    assert.equal(received.totalValue, 84.95);
    assert.equal(records.length, 1);
    assert.equal(history.filter((event) => event.sourceType === "dividend" && event.sourceId === expected.id).length, 1);
  });
});

test("received dividend registration reuses matching expected dividend", async () => {
  const userId = `dividend-idempotent-${randomUUID()}`;

  await asUser(userId, async () => {
    const expected = await createDividendRecord({
      assetTicker: "VGIR11",
      type: "dividendo",
      totalValue: 52.3,
      valuePerShare: 0,
      amountPerShare: 0,
      paymentDate: "2026-08-20",
      status: "expected",
      source: "manual"
    });

    const registered = await registerReceivedDividend({
      assetTicker: "VGIR11",
      type: "dividendo",
      totalValue: 52.3,
      paymentDate: "2026-08-20"
    });
    const records = (await listDividends()).filter((dividend) => dividend.assetTicker === "VGIR11");

    assert.equal(registered.id, expected.id);
    assert.equal(registered.status, "received");
    assert.equal(records.length, 1);
  });
});

test("dividend ownership prevents IDOR access and mutation", async () => {
  const firstUserId = `dividend-owner-a-${randomUUID()}`;
  const secondUserId = `dividend-owner-b-${randomUUID()}`;
  let dividendId = "";

  await asUser(firstUserId, async () => {
    const dividend = await createDividendRecord({
      assetTicker: "ITUB4",
      type: "jcp",
      totalValue: 120,
      valuePerShare: 0,
      amountPerShare: 0,
      paymentDate: "2026-08-20",
      status: "expected",
      source: "manual"
    });
    dividendId = dividend.id ?? "";
  });

  await asUser(secondUserId, async () => {
    assert.equal(await findDividendById(dividendId), null);
    await assert.rejects(() => markDividendReceived(dividendId), expectHttpStatus(404));
  });

  await asUser(firstUserId, async () => {
    assert.equal((await findDividendById(dividendId))?.assetTicker, "ITUB4");
  });
});

test("monthly planning can include received dividends without creating manual income entries", async () => {
  const userId = `dividend-planning-${randomUUID()}`;

  await asUser(userId, async () => {
    await saveMonthlyPlan({
      year: 2026,
      month: 8,
      incomeInCents: 300000,
      includeDividendsAsIncome: true,
      categories: [],
      goals: []
    });
    await registerReceivedDividend({
      assetTicker: "MXRF11",
      type: "rendimento",
      totalValue: 180,
      paymentDate: "2026-08-12"
    });

    const overview = await getMonthlyPlanningOverview(2026, 8);
    const entries = await listAllMonthlyIncomeEntries();

    assert.equal(overview.summary.dividendIncomeInCents, 18000);
    assert.equal(overview.summary.totalIncomeWithDividendsInCents, 318000);
    assert.equal(entries.some((entry) => entry.sourceType === "dividend"), false);
  });
});
