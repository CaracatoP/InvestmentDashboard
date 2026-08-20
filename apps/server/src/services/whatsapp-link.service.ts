import { randomBytes, randomUUID } from "node:crypto";
import { isDatabaseConnected } from "../config/database";
import { env } from "../config/env";
import { getCurrentUserId } from "../auth/auth-context";
import { hashToken, safeTokenEquals } from "../auth/token.service";
import { WhatsAppLinkModel } from "../models/whatsapp-link.model";
import { WebhookEventModel } from "../models/webhook-event.model";
import { appendAuditLog } from "./audit.service";
import { clearUserWhatsAppLink, findActiveUserByPhoneNumber, markUserWhatsAppLinked } from "./auth.service";
import { HttpError } from "../utils/http-error";

type WhatsAppLinkStatus = "pending" | "verified" | "revoked";

interface LocalWhatsAppLink {
  id: string;
  userId: string;
  phoneNormalized: string;
  status: WhatsAppLinkStatus;
  verificationCodeHash: string;
  expiresAt: Date;
  verifiedAt?: Date | null;
  revokedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type LeanWhatsAppLink = Record<string, unknown> & { _id: unknown; userId: unknown };

const localWhatsAppLinks: LocalWhatsAppLink[] = [];
const localWebhookEvents = new Set<string>();

function nowPlusMinutes(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function withId(record: unknown) {
  const plain = record as Record<string, unknown> & { _id?: { toString: () => string } };
  return {
    ...plain,
    id: plain._id?.toString() ?? String(plain.id ?? "")
  };
}

function generateConnectionCode() {
  return `IH-${randomBytes(6).toString("hex").toUpperCase()}`;
}

export function normalizeWhatsAppPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

function sanitizeLink(record: unknown) {
  const link = withId(record) as Record<string, unknown>;
  return {
    id: String(link.id),
    status: String(link.status) as WhatsAppLinkStatus,
    phoneNormalized: typeof link.phoneNormalized === "string" ? link.phoneNormalized : "",
    expiresAt: link.expiresAt as string | Date,
    verifiedAt: (link.verifiedAt as string | Date | null | undefined) ?? null,
    revokedAt: (link.revokedAt as string | Date | null | undefined) ?? null,
    createdAt: link.createdAt as string | Date | undefined,
    updatedAt: link.updatedAt as string | Date | undefined
  };
}

async function findCurrentLink(userId = getCurrentUserId()) {
  if (isDatabaseConnected()) {
    const link = await WhatsAppLinkModel.findOne({
      userId,
      status: { $in: ["pending", "verified"] },
      revokedAt: null
    }).sort({ createdAt: -1 }).lean();
    return link ? sanitizeLink(link) : null;
  }

  const link = localWhatsAppLinks
    .filter((item) => item.userId === userId && ["pending", "verified"].includes(item.status) && !item.revokedAt)
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
  return link ? sanitizeLink(link) : null;
}

export async function getWhatsAppIntegrationStatus(userId = getCurrentUserId()) {
  const link = await findCurrentLink(userId);
  return {
    enabled: env.whatsappEnabled,
    configured: Boolean(env.whatsappPhoneNumberId && env.whatsappVerifyToken && env.whatsappAppSecret && env.whatsappAccessToken),
    officialNumber: env.whatsappOfficialNumber,
    link,
    connected: link?.status === "verified"
  };
}

export async function beginWhatsAppWebhookEvent(input: { externalMessageId: string }) {
  const externalMessageId = input.externalMessageId.trim();
  if (!externalMessageId) throw new HttpError(400, "Mensagem externa do WhatsApp ausente.");
  const idempotencyKey = `whatsapp:${externalMessageId}`;

  if (isDatabaseConnected()) {
    try {
      await WebhookEventModel.create({ provider: "meta", externalMessageId, channel: "whatsapp", status: "received" });
      return { duplicate: false };
    } catch (error) {
      if ((error as { code?: number }).code === 11000) return { duplicate: true };
      throw error;
    }
  }

  if (localWebhookEvents.has(idempotencyKey)) return { duplicate: true };
  localWebhookEvents.add(idempotencyKey);
  return { duplicate: false };
}

export async function completeWhatsAppWebhookEvent(input: { externalMessageId: string; status: "ignored" | "processed" | "failed"; userId?: string | null }) {
  if (!input.externalMessageId.trim()) return;

  if (isDatabaseConnected()) {
    await WebhookEventModel.findOneAndUpdate(
      { provider: "meta", externalMessageId: input.externalMessageId },
      {
        status: input.status,
        userId: input.userId ?? null,
        processedAt: new Date()
      }
    );
  }
}

export async function createWhatsAppConnectionCode(userId = getCurrentUserId()) {
  const existing = await findCurrentLink(userId);
  if (existing?.status === "verified") throw new HttpError(409, "WhatsApp ja esta conectado.");

  const code = generateConnectionCode();
  const expiresAt = nowPlusMinutes(env.whatsappLinkTtlMinutes);

  if (isDatabaseConnected()) {
    await WhatsAppLinkModel.updateMany({ userId, status: "pending", revokedAt: null }, { status: "revoked", revokedAt: new Date() });
    const link = await WhatsAppLinkModel.create({
      userId,
      phoneNormalized: "",
      status: "pending",
      verificationCodeHash: hashToken(code),
      expiresAt
    }).then((record) => record.toObject());
    await appendAuditLog({ userId, actorType: "user", channel: "web", action: "WHATSAPP_LINK_REQUESTED", entityType: "WhatsAppLink", entityId: String(link._id) });
    return { code, expiresAt, link: sanitizeLink(link) };
  }

  for (const link of localWhatsAppLinks) {
    if (link.userId === userId && link.status === "pending" && !link.revokedAt) {
      link.status = "revoked";
      link.revokedAt = new Date();
      link.updatedAt = new Date();
    }
  }
  const now = new Date();
  const link: LocalWhatsAppLink = {
    id: randomUUID(),
    userId,
    phoneNormalized: "",
    status: "pending",
    verificationCodeHash: hashToken(code),
    expiresAt,
    verifiedAt: null,
    revokedAt: null,
    createdAt: now,
    updatedAt: now
  };
  localWhatsAppLinks.push(link);
  await appendAuditLog({ userId, actorType: "user", channel: "web", action: "WHATSAPP_LINK_REQUESTED", entityType: "WhatsAppLink", entityId: link.id });
  return { code, expiresAt, link: sanitizeLink(link) };
}

export async function cancelWhatsAppPendingLink(userId = getCurrentUserId()) {
  const now = new Date();
  if (isDatabaseConnected()) {
    const result = await WhatsAppLinkModel.updateMany({ userId, status: "pending", revokedAt: null }, { status: "revoked", revokedAt: now });
    if (result.modifiedCount > 0) {
      await appendAuditLog({ userId, actorType: "user", channel: "web", action: "WHATSAPP_LINK_CANCELLED", entityType: "WhatsAppLink" });
    }
    return { cancelled: result.modifiedCount };
  }

  let cancelled = 0;
  for (const link of localWhatsAppLinks) {
    if (link.userId !== userId || link.status !== "pending" || link.revokedAt) continue;
    link.status = "revoked";
    link.revokedAt = now;
    link.updatedAt = now;
    cancelled += 1;
  }
  if (cancelled > 0) await appendAuditLog({ userId, actorType: "user", channel: "web", action: "WHATSAPP_LINK_CANCELLED", entityType: "WhatsAppLink" });
  return { cancelled };
}

export async function verifyWhatsAppConnectionCode(input: { phoneNumber: string; code: string; externalMessageId?: string }) {
  const phoneNormalized = normalizeWhatsAppPhone(input.phoneNumber);
  if (!phoneNormalized) throw new HttpError(400, "Telefone invalido.");

  if (input.externalMessageId) {
    const event = await beginWhatsAppWebhookEvent({ externalMessageId: input.externalMessageId });
    if (event.duplicate) return { duplicated: true, linked: false };
  }

  const codeHash = hashToken(input.code.trim().toUpperCase());
  const now = new Date();

  if (isDatabaseConnected()) {
    const candidate = await WhatsAppLinkModel.findOne({
      verificationCodeHash: codeHash,
      status: "pending",
      revokedAt: null,
      expiresAt: { $gt: now }
    }).lean() as LeanWhatsAppLink | null;
    if (!candidate) throw new HttpError(400, "Codigo invalido ou expirado.");
    await markUserWhatsAppLinked(String(candidate.userId), { phoneNumber: input.phoneNumber, linkedAt: now });
    const updated = await WhatsAppLinkModel.findByIdAndUpdate(candidate._id, {
      phoneNormalized,
      status: "verified",
      verifiedAt: now
    }, { new: true }).lean();
    await appendAuditLog({ userId: String(candidate.userId), actorType: "whatsapp", channel: "whatsapp", action: "WHATSAPP_LINK_VERIFIED", entityType: "WhatsAppLink", entityId: String(candidate._id) });
    if (input.externalMessageId) await completeWhatsAppWebhookEvent({ externalMessageId: input.externalMessageId, status: "processed", userId: String(candidate.userId) });
    return { duplicated: false, linked: true, link: sanitizeLink(updated) };
  }

  const link = localWhatsAppLinks.find((item) => item.status === "pending" && !item.revokedAt && item.expiresAt > now && safeTokenEquals(item.verificationCodeHash, codeHash));
  if (!link) throw new HttpError(400, "Codigo invalido ou expirado.");
  await markUserWhatsAppLinked(link.userId, { phoneNumber: input.phoneNumber, linkedAt: now });
  link.phoneNormalized = phoneNormalized;
  link.status = "verified";
  link.verifiedAt = now;
  link.updatedAt = now;
  await appendAuditLog({ userId: link.userId, actorType: "whatsapp", channel: "whatsapp", action: "WHATSAPP_LINK_VERIFIED", entityType: "WhatsAppLink", entityId: link.id });
  if (input.externalMessageId) await completeWhatsAppWebhookEvent({ externalMessageId: input.externalMessageId, status: "processed", userId: link.userId });
  return { duplicated: false, linked: true, link: sanitizeLink(link) };
}

export async function findVerifiedWhatsAppUserByPhoneNumber(phoneNumber: string) {
  const phoneNormalized = normalizeWhatsAppPhone(phoneNumber);
  if (!phoneNormalized) return null;

  if (isDatabaseConnected()) {
    const link = await WhatsAppLinkModel.findOne({
      phoneNormalized,
      status: "verified",
      revokedAt: null
    }).lean() as LeanWhatsAppLink | null;
    if (!link) return null;
    return findActiveUserByPhoneNumber(phoneNormalized);
  }

  const link = localWhatsAppLinks.find((item) => item.phoneNormalized === phoneNormalized && item.status === "verified" && !item.revokedAt);
  if (!link) return null;
  return findActiveUserByPhoneNumber(phoneNormalized);
}

export async function disconnectWhatsAppIntegration(userId = getCurrentUserId()) {
  const now = new Date();

  if (isDatabaseConnected()) {
    const result = await WhatsAppLinkModel.updateMany(
      { userId, status: { $in: ["pending", "verified"] }, revokedAt: null },
      { status: "revoked", revokedAt: now }
    );
    await clearUserWhatsAppLink(userId);
    if (result.modifiedCount > 0) {
      await appendAuditLog({ userId, actorType: "user", channel: "web", action: "WHATSAPP_LINK_DISCONNECTED", entityType: "WhatsAppLink" });
    }
    return { disconnected: result.modifiedCount };
  }

  let disconnected = 0;
  for (const link of localWhatsAppLinks) {
    if (link.userId !== userId || !["pending", "verified"].includes(link.status) || link.revokedAt) continue;
    link.status = "revoked";
    link.revokedAt = now;
    link.updatedAt = now;
    disconnected += 1;
  }
  await clearUserWhatsAppLink(userId);
  if (disconnected > 0) await appendAuditLog({ userId, actorType: "user", channel: "web", action: "WHATSAPP_LINK_DISCONNECTED", entityType: "WhatsAppLink" });
  return { disconnected };
}
