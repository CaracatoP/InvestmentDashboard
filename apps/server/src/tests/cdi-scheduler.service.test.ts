import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { env } from "../config/env";
import {
  resetCdiSchedulerStateForTests,
  shouldRunCdiRefresh,
  shouldRunStartupCdiRefresh,
  startCdiScheduler
} from "../services/cdi-scheduler.service";

const originalEnableSchedulers = env.enableSchedulers;
const originalCdiUpdateHour = env.cdiUpdateHour;
const originalSetInterval = global.setInterval;

function fakeTimer() {
  return {
    unref() {
      return this;
    }
  } as unknown as ReturnType<typeof setInterval>;
}

beforeEach(() => {
  env.enableSchedulers = true;
  env.cdiUpdateHour = 8;
  resetCdiSchedulerStateForTests();
  global.setInterval = (((_handler: TimerHandler, _timeout?: number) => fakeTimer()) as unknown) as typeof setInterval;
});

afterEach(() => {
  env.enableSchedulers = originalEnableSchedulers;
  env.cdiUpdateHour = originalCdiUpdateHour;
  global.setInterval = originalSetInterval;
  resetCdiSchedulerStateForTests();
});

test("scheduler can be disabled by configuration", () => {
  let intervalCalls = 0;
  env.enableSchedulers = false;
  global.setInterval = (((_handler: TimerHandler, _timeout?: number) => {
    intervalCalls += 1;
    return fakeTimer();
  }) as unknown) as typeof setInterval;

  const result = startCdiScheduler({ skipInitialRefresh: true });

  assert.deepEqual(result, { started: false, reason: "disabled" });
  assert.equal(intervalCalls, 0);
});

test("scheduler starts only once", () => {
  let intervalCalls = 0;
  global.setInterval = (((_handler: TimerHandler, _timeout?: number) => {
    intervalCalls += 1;
    return fakeTimer();
  }) as unknown) as typeof setInterval;

  const first = startCdiScheduler({ skipInitialRefresh: true });
  const second = startCdiScheduler({ skipInitialRefresh: true });

  assert.deepEqual(first, { started: true });
  assert.deepEqual(second, { started: false, reason: "already-started" });
  assert.equal(intervalCalls, 1);
});

test("shouldRunCdiRefresh only triggers on weekdays at the configured hour", () => {
  assert.equal(shouldRunCdiRefresh(new Date("2026-07-28T11:00:00.000Z")), true);
  assert.equal(shouldRunCdiRefresh(new Date("2026-07-28T11:30:00.000Z")), false);
  assert.equal(shouldRunCdiRefresh(new Date("2026-07-25T11:00:00.000Z")), false);
});

test("startup refresh only runs when the latest stored rate is stale and the configured hour has passed", () => {
  assert.equal(shouldRunStartupCdiRefresh(new Date("2026-07-28T11:00:00.000Z"), "2026-07-27"), true);
  assert.equal(shouldRunStartupCdiRefresh(new Date("2026-07-28T10:00:00.000Z"), "2026-07-27"), false);
  assert.equal(shouldRunStartupCdiRefresh(new Date("2026-07-25T11:00:00.000Z"), "2026-07-24"), false);
  assert.equal(shouldRunStartupCdiRefresh(new Date("2026-07-28T11:00:00.000Z"), null), true);
});
