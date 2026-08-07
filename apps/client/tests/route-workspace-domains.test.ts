import assert from "node:assert/strict";
import test from "node:test";
import { getWorkspaceDomainsForPath } from "../src/services/route-workspace-domains";

test("route workspace domains keep initial dashboard load compact", () => {
  assert.deepEqual(getWorkspaceDomainsForPath("/"), ["settings", "dashboard"]);
});

test("route workspace domains request only data required by store-backed pages", () => {
  assert.deepEqual(getWorkspaceDomainsForPath("/carteira"), ["settings", "portfolio"]);
  assert.deepEqual(getWorkspaceDomainsForPath("/dividendos"), ["settings", "dividends"]);
  assert.deepEqual(getWorkspaceDomainsForPath("/historico"), ["settings", "history"]);
  assert.deepEqual(getWorkspaceDomainsForPath("/projecoes"), ["settings", "dashboard", "contributions", "dividends", "goals"]);
});
