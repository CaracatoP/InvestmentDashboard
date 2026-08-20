import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { runWithAuthContext } from "../auth/auth-context";
import { createBootstrapAdmin, getUserForAuthContext } from "../services/auth.service";
import {
  cancelWhatsAppPendingLink,
  createWhatsAppConnectionCode,
  disconnectWhatsAppIntegration,
  findVerifiedWhatsAppUserByPhoneNumber,
  getWhatsAppIntegrationStatus,
  verifyWhatsAppConnectionCode
} from "../services/whatsapp-link.service";
import { env } from "../config/env";
import { HttpError } from "../utils/http-error";

function asUser<T>(userId: string, callback: () => Promise<T>) {
  return runWithAuthContext({ userId, role: "user", channel: "web" }, callback);
}

function expectHttpStatus(statusCode: number) {
  return (error: unknown) => error instanceof HttpError && error.statusCode === statusCode;
}

async function createTestUser(prefix: string) {
  const result = await createBootstrapAdmin({
    email: `${prefix}-${randomUUID()}@example.com`,
    password: "SenhaForte123!"
  });
  return result.user;
}

test("whatsapp connection code is temporary, hashed and user-scoped", async () => {
  const firstUser = await createTestUser("whatsapp-a");
  const secondUser = await createTestUser("whatsapp-b");

  const created = await asUser(firstUser.id, () => createWhatsAppConnectionCode());
  assert.match(created.code, /^IH-[0-9A-F]{12}$/);
  assert.equal(created.link.status, "pending");
  assert.equal(Object.prototype.hasOwnProperty.call(created.link, "verificationCodeHash"), false);

  await asUser(secondUser.id, async () => {
    const status = await getWhatsAppIntegrationStatus();
    assert.equal(status.link, null);
    assert.equal(status.connected, false);
  });

  await assert.rejects(
    () => verifyWhatsAppConnectionCode({ phoneNumber: "+55 11 99999-0000", code: "IH-000000" }),
    expectHttpStatus(400)
  );
});

test("whatsapp verification is idempotent by external message id and can cancel pending links", async () => {
  const user = await createTestUser("whatsapp-idempotent");
  const externalMessageId = `msg-${randomUUID()}`;

  const pending = await asUser(user.id, () => createWhatsAppConnectionCode());
  const verified = await verifyWhatsAppConnectionCode({
    phoneNumber: "+55 (11) 98888-7777",
    code: pending.code,
    externalMessageId
  });

  assert.equal(verified.duplicated, false);
  assert.equal(verified.linked, true);
  assert.equal(verified.link?.status, "verified");
  assert.equal(verified.link?.phoneNormalized, "+5511988887777");
  assert.equal((await getUserForAuthContext(user.id))?.phoneNormalized, "+5511988887777");
  assert.ok((await getUserForAuthContext(user.id))?.whatsappLinkedAt);

  const duplicated = await verifyWhatsAppConnectionCode({
    phoneNumber: "+55 (11) 98888-7777",
    code: pending.code,
    externalMessageId
  });
  assert.deepEqual(duplicated, { duplicated: true, linked: false });
  await assert.rejects(
    () => verifyWhatsAppConnectionCode({ phoneNumber: "+55 (11) 98888-7777", code: pending.code }),
    expectHttpStatus(400)
  );

  await assert.rejects(() => asUser(user.id, () => createWhatsAppConnectionCode()), expectHttpStatus(409));

  const cancelUser = await createTestUser("whatsapp-cancel");
  await asUser(cancelUser.id, () => createWhatsAppConnectionCode());
  const cancelled = await asUser(cancelUser.id, () => cancelWhatsAppPendingLink());
  assert.equal(cancelled.cancelled, 1);
  assert.equal((await asUser(cancelUser.id, () => getWhatsAppIntegrationStatus())).link, null);
});

test("whatsapp connection code expires and verified links can be disconnected", async () => {
  const previousTtl = env.whatsappLinkTtlMinutes;
  env.whatsappLinkTtlMinutes = -1;
  const expiredUser = await createTestUser("whatsapp-expired");
  const expired = await asUser(expiredUser.id, () => createWhatsAppConnectionCode());

  await assert.rejects(
    () => verifyWhatsAppConnectionCode({ phoneNumber: "+55 (11) 96666-5555", code: expired.code }),
    expectHttpStatus(400)
  );
  env.whatsappLinkTtlMinutes = previousTtl;

  const linkedUser = await createTestUser("whatsapp-disconnect");
  const linkedCode = await asUser(linkedUser.id, () => createWhatsAppConnectionCode());
  await verifyWhatsAppConnectionCode({ phoneNumber: "+55 (11) 95555-4444", code: linkedCode.code });

  assert.equal((await findVerifiedWhatsAppUserByPhoneNumber("+55 (11) 95555-4444"))?.id, linkedUser.id);
  const disconnected = await asUser(linkedUser.id, () => disconnectWhatsAppIntegration());

  assert.equal(disconnected.disconnected, 1);
  assert.equal(await findVerifiedWhatsAppUserByPhoneNumber("+55 (11) 95555-4444"), null);
  assert.equal((await getUserForAuthContext(linkedUser.id))?.phoneNormalized, "");
});

test("whatsapp verification rejects phone numbers already linked to another user", async () => {
  const firstUser = await createTestUser("whatsapp-phone-owner");
  const secondUser = await createTestUser("whatsapp-phone-conflict");
  const phoneNumber = "+55 (21) 97777-1111";

  const firstCode = await asUser(firstUser.id, () => createWhatsAppConnectionCode());
  await verifyWhatsAppConnectionCode({ phoneNumber, code: firstCode.code });

  const secondCode = await asUser(secondUser.id, () => createWhatsAppConnectionCode());
  await assert.rejects(
    () => verifyWhatsAppConnectionCode({ phoneNumber, code: secondCode.code }),
    expectHttpStatus(409)
  );
  assert.equal((await asUser(secondUser.id, () => getWhatsAppIntegrationStatus())).link?.status, "pending");
});
