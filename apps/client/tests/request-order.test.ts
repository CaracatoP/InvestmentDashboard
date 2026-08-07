import assert from "node:assert/strict";
import test from "node:test";
import { createLatestRequestTracker } from "../src/services/request-order";

test("latest request tracker prevents older responses from winning", () => {
  const tracker = createLatestRequestTracker<"history" | "portfolio">();
  const first = tracker.start(["history"]);
  const second = tracker.start(["history"]);
  const portfolio = tracker.start(["portfolio"]);

  assert.equal(tracker.isLatest("history", first.get("history") ?? 0), false);
  assert.equal(tracker.isLatest("history", second.get("history") ?? 0), true);
  assert.equal(tracker.isLatest("portfolio", portfolio.get("portfolio") ?? 0), true);
});
