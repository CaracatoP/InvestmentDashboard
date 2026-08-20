import assert from "node:assert/strict";
import test from "node:test";
import { joinApiPath, normalizeApiUrl, resolveApiUrl } from "../src/config/api-url";

test("normalizeApiUrl removes trailing slashes", () => {
  assert.equal(normalizeApiUrl("https://api.example.com/"), "https://api.example.com");
  assert.equal(normalizeApiUrl("https://api.example.com///"), "https://api.example.com");
});

test("resolveApiUrl uses localhost only outside production", () => {
  assert.equal(resolveApiUrl(undefined, false), "http://localhost:4000");
});

test("resolveApiUrl uses the current origin when VITE_API_URL is missing in production", () => {
  assert.equal(resolveApiUrl(undefined, true, "https://investment-dashboard-client.vercel.app"), "https://investment-dashboard-client.vercel.app");
});

test("resolveApiUrl ignores a cross-origin production API URL and keeps the current origin", () => {
  assert.equal(
    resolveApiUrl(
      "https://investment-dashboardserver-production.up.railway.app",
      true,
      "https://investment-dashboard-client.vercel.app"
    ),
    "https://investment-dashboard-client.vercel.app"
  );
});

test("resolveApiUrl keeps a same-origin production API URL", () => {
  assert.equal(
    resolveApiUrl(
      "https://investment-dashboard-client.vercel.app",
      true,
      "https://investment-dashboard-client.vercel.app"
    ),
    "https://investment-dashboard-client.vercel.app"
  );
});

test("joinApiPath avoids duplicated slashes", () => {
  assert.equal(joinApiPath("https://api.example.com/", "/api"), "https://api.example.com/api");
  assert.equal(joinApiPath("https://api.example.com", "api/health"), "https://api.example.com/api/health");
});

test("joinApiPath keeps same-origin relative paths when no explicit API origin is required", () => {
  assert.equal(joinApiPath("", "/api"), "/api");
  assert.equal(joinApiPath("", "api/auth/me"), "/api/auth/me");
});
