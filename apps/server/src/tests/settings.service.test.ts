import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { resetSettingsRecord } from "../repositories/investment.repository";
import { getSettings, updateSettings } from "../services/portfolio.service";
import { settingsUpdateSchema } from "../validators/settings.validator";

beforeEach(async () => {
  await resetSettingsRecord();
});

test("settings profile loads functional defaults", async () => {
  const settings = await getSettings();

  assert.equal(settings.profile.name, "Investidor");
  assert.equal(settings.profile.theme, "dark");
  assert.equal(settings.profile.currency, "BRL");
});

test("settings profile persists valid user preferences", async () => {
  await updateSettings({
    profileName: "Joao Gabriel",
    theme: "system",
    currency: "BRL"
  });

  const settings = await getSettings();

  assert.equal(settings.profile.name, "Joao Gabriel");
  assert.equal(settings.profile.theme, "system");
  assert.equal(settings.profile.currency, "BRL");
});

test("settings validator rejects empty profile name and unsupported currency", () => {
  assert.throws(() => settingsUpdateSchema.parse({ profileName: "" }), /Nome deve ter pelo menos 2 caracteres/);
  assert.throws(() => settingsUpdateSchema.parse({ currency: "USD" }), /Invalid enum value/);
  assert.throws(() => settingsUpdateSchema.parse({ theme: "blue" }), /Invalid enum value/);
});
