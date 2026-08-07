import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  getWorkspaceSyncMetrics,
  invalidateWorkspaceCache,
  onWorkspaceCacheInvalidated,
  onWorkspaceSyncEvent,
  resetWorkspaceSyncMetrics
} from "../src/services/cache-invalidation";

beforeEach(() => {
  resetWorkspaceSyncMetrics();
});

test("workspace cache invalidation defaults to all domains", () => {
  const received: string[][] = [];
  const unsubscribe = onWorkspaceCacheInvalidated((domains) => received.push(domains));

  invalidateWorkspaceCache();
  unsubscribe();

  assert.deepEqual(received, [["all"]]);
});

test("workspace cache invalidation deduplicates selected domains", () => {
  const received: string[][] = [];
  const unsubscribe = onWorkspaceCacheInvalidated((domains) => received.push(domains));

  invalidateWorkspaceCache(["dashboard", "history", "dashboard"]);
  unsubscribe();

  assert.deepEqual(received, [["dashboard", "history"]]);
});

test("workspace sync preserves metadata and updates metrics", () => {
  const received: Array<ReturnType<typeof getWorkspaceSyncMetrics>["lastEvent"]> = [];
  const unsubscribe = onWorkspaceSyncEvent((detail) => received.push(detail));

  const detail = invalidateWorkspaceCache({
    domains: ["settings", "ai", "settings"],
    source: "ai",
    reason: "ai-action-executed",
    mutationKey: "settings.profile.update",
    affectedEntities: [{ type: "settings" }]
  });
  unsubscribe();

  assert.equal(received.length, 1);
  assert.deepEqual(received[0], detail);
  assert.deepEqual(received[0]?.domains, ["settings", "ai"]);
  assert.equal(received[0]?.mutationKey, "settings.profile.update");
  assert.deepEqual(received[0]?.affectedEntities, [{ type: "settings" }]);

  const metrics = getWorkspaceSyncMetrics();
  assert.equal(metrics.emitted, 1);
  assert.equal(metrics.delivered, 1);
  assert.equal(metrics.lastEvent?.reason, "ai-action-executed");
  assert.equal(metrics.lastEvent?.source, "ai");
});
