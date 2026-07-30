import assert from "node:assert/strict";
import test from "node:test";
import { normalizeThemePreference } from "../src/theme/app-theme";

test("normalizeThemePreference accepts supported theme modes", () => {
  assert.equal(normalizeThemePreference("dark"), "dark");
  assert.equal(normalizeThemePreference("light"), "light");
  assert.equal(normalizeThemePreference("system"), "system");
});

test("normalizeThemePreference falls back to dark for unknown values", () => {
  assert.equal(normalizeThemePreference("blue"), "dark");
  assert.equal(normalizeThemePreference(null), "dark");
});
