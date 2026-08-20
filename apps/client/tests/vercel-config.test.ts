import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("vercel config proxies /api before the SPA rewrite", () => {
  const configPath = new URL("../vercel.json", import.meta.url);
  const config = JSON.parse(readFileSync(configPath, "utf-8")) as {
    rewrites?: Array<{ source?: string; destination?: string }>;
  };

  assert.ok(Array.isArray(config.rewrites));
  assert.equal(config.rewrites?.[0]?.source, "/api/(.*)");
  assert.match(config.rewrites?.[0]?.destination ?? "", /^https:\/\/.+\/api\/\$1$/);
  assert.equal(config.rewrites?.[1]?.source, "/(.*)");
  assert.equal(config.rewrites?.[1]?.destination, "/index.html");
});
