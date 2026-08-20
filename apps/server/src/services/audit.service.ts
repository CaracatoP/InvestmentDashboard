import { randomUUID } from "node:crypto";
import { isDatabaseConnected } from "../config/database";
import { getAuthContext, getCurrentChannel, type AuthChannel } from "../auth/auth-context";
import { AuditLogModel } from "../models/audit-log.model";

export type AuditActorType = "user" | "admin" | "system" | "whatsapp";

export interface AuditLogInput {
  userId?: string | null;
  actorType?: AuditActorType;
  actorUserId?: string | null;
  channel?: AuthChannel;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

const sensitiveKeys = new Set(["password", "passwordHash", "token", "tokenHash", "authorization", "session", "secret", "apiKey"]);
const localAuditLogs: Array<AuditLogInput & { id: string; createdAt: Date }> = [];

function sanitizeMetadata(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sanitizeMetadata);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
      const normalizedKey = key.toLowerCase();
      if ([...sensitiveKeys].some((sensitiveKey) => normalizedKey.includes(sensitiveKey))) {
        return [key, "[redacted]"];
      }
      return [key, sanitizeMetadata(entry)];
    })
  );
}

export async function appendAuditLog(input: AuditLogInput) {
  const context = getAuthContext();
  const payload = {
    userId: input.userId ?? context?.userId ?? null,
    actorType: input.actorType ?? (context?.role === "admin" ? "admin" : "user"),
    actorUserId: input.actorUserId ?? context?.userId ?? null,
    channel: input.channel ?? getCurrentChannel("web"),
    action: input.action,
    entityType: input.entityType ?? "",
    entityId: input.entityId ?? "",
    metadata: sanitizeMetadata(input.metadata ?? {}) as Record<string, unknown>
  };

  if (isDatabaseConnected()) {
    await AuditLogModel.create(payload);
    return;
  }

  localAuditLogs.unshift({ ...payload, id: randomUUID(), createdAt: new Date() });
}

export function listLocalAuditLogs() {
  return [...localAuditLogs];
}
