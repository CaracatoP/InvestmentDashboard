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

test("resolveApiUrl throws when VITE_API_URL is missing in production", () => {
  assert.throws(() => resolveApiUrl(undefined, true), /VITE_API_URL is required in production/);
});

test("joinApiPath avoids duplicated slashes", () => {
  assert.equal(joinApiPath("https://api.example.com/", "/api"), "https://api.example.com/api");
  assert.equal(joinApiPath("https://api.example.com", "api/health"), "https://api.example.com/api/health");
});
