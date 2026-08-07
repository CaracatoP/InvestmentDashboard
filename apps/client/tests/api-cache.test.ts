import assert from "node:assert/strict";
import test from "node:test";
import { createApiResponseCache, createCanonicalCacheKey, normalizeCacheQuery } from "../src/services/api-cache";

test("api cache deduplicates simultaneous requests with the same key", async () => {
  let calls = 0;
  let resolveRequest: (value: number) => void = () => undefined;
  const cache = createApiResponseCache({ now: () => 0, maxEntries: 10 });
  const request = () => {
    calls += 1;
    return new Promise<number>((resolve) => {
      resolveRequest = resolve;
    });
  };

  const first = cache.get({ key: "/dashboard", domains: ["dashboard"], staleTimeMs: 1000, request });
  const second = cache.get({ key: "/dashboard", domains: ["dashboard"], staleTimeMs: 1000, request });

  assert.equal(calls, 1);
  assert.equal(cache.inflightSize, 1);

  resolveRequest(42);

  assert.equal(await first, 42);
  assert.equal(await second, 42);
  assert.equal(cache.inflightSize, 0);
  assert.equal(cache.size, 1);
});

test("api cache expires entries by TTL", async () => {
  let time = 0;
  let calls = 0;
  const cache = createApiResponseCache({ now: () => time, maxEntries: 10 });
  const request = async () => {
    calls += 1;
    return calls;
  };

  assert.equal(await cache.get({ key: "/history", domains: ["history"], staleTimeMs: 100, request }), 1);
  assert.equal(await cache.get({ key: "/history", domains: ["history"], staleTimeMs: 100, request }), 1);

  time = 101;

  assert.equal(await cache.get({ key: "/history", domains: ["history"], staleTimeMs: 100, request }), 2);
  assert.equal(calls, 2);
});

test("api cache invalidates only selected domains", async () => {
  let dashboardCalls = 0;
  let historyCalls = 0;
  const cache = createApiResponseCache({ now: () => 0, maxEntries: 10 });

  await cache.get({ key: "/dashboard", domains: ["dashboard"], staleTimeMs: 1000, request: async () => ++dashboardCalls });
  await cache.get({ key: "/history", domains: ["history"], staleTimeMs: 1000, request: async () => ++historyCalls });

  cache.clear(["dashboard"]);

  assert.equal(await cache.get({ key: "/dashboard", domains: ["dashboard"], staleTimeMs: 1000, request: async () => ++dashboardCalls }), 2);
  assert.equal(await cache.get({ key: "/history", domains: ["history"], staleTimeMs: 1000, request: async () => ++historyCalls }), 1);
});

test("api cache removes failed requests from deduplication and does not cache errors", async () => {
  let calls = 0;
  const cache = createApiResponseCache({ now: () => 0, maxEntries: 10 });
  const request = async () => {
    calls += 1;
    throw new Error("network failed");
  };

  await assert.rejects(() => cache.get({ key: "/goals", domains: ["goals"], staleTimeMs: 1000, request }), /network failed/);

  assert.equal(cache.inflightSize, 0);
  assert.equal(cache.size, 0);

  await assert.rejects(() => cache.get({ key: "/goals", domains: ["goals"], staleTimeMs: 1000, request }), /network failed/);
  assert.equal(calls, 2);
});

test("api cache clears all data on logout", async () => {
  const cache = createApiResponseCache({ now: () => 0, maxEntries: 10 });

  await cache.get({ key: "/settings", domains: ["settings"], staleTimeMs: 1000, request: async () => "profile" });
  cache.clearForLogout();

  assert.equal(cache.size, 0);
  assert.equal(cache.inflightSize, 0);
});

test("api cache isolates data when user scope changes", async () => {
  let calls = 0;
  const cache = createApiResponseCache({ now: () => 0, maxEntries: 10, initialScope: "user-a" });
  const request = async () => {
    calls += 1;
    return `payload-${calls}`;
  };

  assert.equal(await cache.get({ key: "/portfolio", domains: ["portfolio"], staleTimeMs: 1000, request }), "payload-1");

  cache.setScope("user-b");

  assert.equal(cache.size, 0);
  assert.equal(await cache.get({ key: "/portfolio", domains: ["portfolio"], staleTimeMs: 1000, request }), "payload-2");
});

test("api cache builds canonical keys from unordered query parameters", () => {
  assert.equal(
    createCanonicalCacheKey("/monthly-planning?year=2026&comparisonRange=1", { month: 8 }),
    createCanonicalCacheKey("/monthly-planning", { month: 8, comparisonRange: 1, year: 2026 })
  );
  assert.equal(normalizeCacheQuery({ b: "2", a: "1", empty: "", skip: undefined }), "a=1&b=2");
});

test("api cache enforces maximum entry count", async () => {
  const cache = createApiResponseCache({ now: () => 0, maxEntries: 2 });

  await cache.get({ key: "/a", domains: ["dashboard"], staleTimeMs: 1000, request: async () => "a" });
  await cache.get({ key: "/b", domains: ["history"], staleTimeMs: 1000, request: async () => "b" });
  await cache.get({ key: "/c", domains: ["settings"], staleTimeMs: 1000, request: async () => "c" });

  assert.equal(cache.size, 2);
  assert.equal(cache.has("/a"), false);
  assert.equal(cache.has("/b"), true);
  assert.equal(cache.has("/c"), true);
});
