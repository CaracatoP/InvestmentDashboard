import { randomUUID } from "node:crypto";
import { isDatabaseConnected } from "../config/database";
import { env } from "../config/env";
import { getAuthContext } from "../auth/auth-context";
import { hashPassword, verifyPassword } from "../auth/password.service";
import { createSecureToken, hashToken } from "../auth/token.service";
import { PasswordResetTokenModel } from "../models/password-reset-token.model";
import { SessionModel } from "../models/session.model";
import { UserApprovalRequestModel } from "../models/user-approval-request.model";
import { UserModel } from "../models/user.model";
import { appendAuditLog } from "./audit.service";
import { sendApprovalRequestEmail, sendPasswordResetEmail, sendUserApprovalDecisionEmail } from "./email.service";
import { HttpError } from "../utils/http-error";
import type { AuthRole } from "../auth/auth-context";

export type UserStatus = "pending_approval" | "active" | "rejected" | "disabled";

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  role: AuthRole;
  status: UserStatus;
  phoneNumber?: string;
  phoneNormalized?: string;
  whatsappLinkedAt?: string | Date | null;
  timezone?: string;
  lastLoginAt?: string | Date | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

interface UserWithPassword extends SafeUser {
  passwordHash: string;
}

interface LocalSession {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date | null;
  lastUsedAt: Date;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface LocalApprovalRequest {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  decidedAt?: Date | null;
  decision?: "approved" | "rejected" | null;
  decidedByUserId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface LocalPasswordResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type LeanAuthRecord = Record<string, unknown> & { _id?: unknown; userId?: unknown; tokenHash?: unknown };
type LeanUserIdentityRecord = Record<string, unknown> & { _id: unknown };

const localUsers: UserWithPassword[] = [];
const localSessions: LocalSession[] = [];
const localApprovalRequests: LocalApprovalRequest[] = [];
const localPasswordResetTokens: LocalPasswordResetToken[] = [];

function addHours(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function addMinutes(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function addDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function withId(record: unknown) {
  const plain = record as Record<string, unknown> & { _id?: { toString: () => string } };
  return {
    ...plain,
    id: plain._id?.toString() ?? String(plain.id ?? "")
  };
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizePhone(phone?: string | null) {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

function toSafeUser(record: unknown): SafeUser {
  const user = withId(record) as Record<string, unknown>;
  return {
    id: String(user.id),
    name: String(user.name ?? ""),
    email: String(user.email ?? ""),
    role: (user.role === "admin" ? "admin" : "user") as AuthRole,
    status: (typeof user.status === "string" ? user.status : "pending_approval") as UserStatus,
    phoneNumber: typeof user.phoneNumber === "string" ? user.phoneNumber : "",
    phoneNormalized: typeof user.phoneNormalized === "string" ? user.phoneNormalized : "",
    whatsappLinkedAt: (user.whatsappLinkedAt as string | Date | null | undefined) ?? null,
    timezone: typeof user.timezone === "string" ? user.timezone : "America/Sao_Paulo",
    lastLoginAt: (user.lastLoginAt as string | Date | null | undefined) ?? null,
    createdAt: user.createdAt as string | Date | undefined,
    updatedAt: user.updatedAt as string | Date | undefined
  };
}

async function findUserByEmail(email: string): Promise<SafeUser | null> {
  const normalizedEmail = normalizeEmail(email);

  if (isDatabaseConnected()) {
    const user = await UserModel.findOne({ email: normalizedEmail }).lean();
    return user ? toSafeUser(user) : null;
  }

  const user = localUsers.find((item) => item.email === normalizedEmail);
  return user ? toSafeUser(user) : null;
}

async function findUserWithPasswordByEmail(email: string): Promise<UserWithPassword | null> {
  const normalizedEmail = normalizeEmail(email);

  if (isDatabaseConnected()) {
    const user = await UserModel.findOne({ email: normalizedEmail }).select("+passwordHash").lean();
    return user ? ({ ...toSafeUser(user), passwordHash: String((user as { passwordHash?: string }).passwordHash ?? "") } satisfies UserWithPassword) : null;
  }

  return localUsers.find((item) => item.email === normalizedEmail) ?? null;
}

async function findUserById(id: string): Promise<SafeUser | null> {
  if (isDatabaseConnected()) {
    const user = await UserModel.findById(id).lean();
    return user ? toSafeUser(user) : null;
  }

  const user = localUsers.find((item) => item.id === id);
  return user ? toSafeUser(user) : null;
}

export async function findActiveUserByPhoneNumber(phoneNumber: string): Promise<SafeUser | null> {
  const phoneNormalized = normalizePhone(phoneNumber);
  if (!phoneNormalized) return null;

  if (isDatabaseConnected()) {
    const user = await UserModel.findOne({ phoneNormalized, status: "active" }).lean();
    return user ? toSafeUser(user) : null;
  }

  const user = localUsers.find((item) => item.phoneNormalized === phoneNormalized && item.status === "active");
  return user ? toSafeUser(user) : null;
}

async function updateUser(id: string, input: Partial<UserWithPassword>): Promise<SafeUser | null> {
  if (isDatabaseConnected()) {
    const user = await UserModel.findByIdAndUpdate(id, input, { new: true }).lean();
    return user ? toSafeUser(user) : null;
  }

  const index = localUsers.findIndex((user) => user.id === id);
  if (index < 0) return null;
  localUsers[index] = { ...localUsers[index], ...input, updatedAt: new Date() };
  return toSafeUser(localUsers[index]);
}

async function createUser(input: {
  name: string;
  email: string;
  passwordHash: string;
  role: AuthRole;
  status: UserStatus;
  phoneNumber?: string;
  timezone?: string;
}) {
  const payload = {
    name: input.name.trim(),
    email: normalizeEmail(input.email),
    passwordHash: input.passwordHash,
    role: input.role,
    status: input.status,
    phoneNumber: input.phoneNumber?.trim() ?? "",
    phoneNormalized: normalizePhone(input.phoneNumber),
    timezone: input.timezone ?? "America/Sao_Paulo"
  };

  if (isDatabaseConnected()) {
    const user = await UserModel.create(payload).then((record) => record.toObject());
    return toSafeUser(user);
  }

  const now = new Date();
  const user: UserWithPassword = { ...payload, id: randomUUID(), lastLoginAt: null, createdAt: now, updatedAt: now };
  localUsers.push(user);
  return toSafeUser(user);
}

function buildApiUrl(path: string) {
  const baseUrl = env.apiPublicUrl.replace(/\/+$/, "");
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function buildAppUrl(path: string) {
  const baseUrl = env.appPublicUrl.replace(/\/+$/, "");
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

async function createApprovalRequest(user: SafeUser) {
  const token = createSecureToken();
  const payload = {
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: addHours(env.authApprovalTtlHours),
    decidedAt: null,
    decision: null
  };

  if (isDatabaseConnected()) {
    await UserApprovalRequestModel.create(payload);
  } else {
    const now = new Date();
    localApprovalRequests.push({ ...payload, id: randomUUID(), createdAt: now, updatedAt: now });
  }

  return { token, approveUrl: buildApiUrl(`/api/auth/approvals/${token}/approve`), rejectUrl: buildApiUrl(`/api/auth/approvals/${token}/reject`) };
}

async function notifyAdminAboutApproval(user: SafeUser, tokenData: { token: string; approveUrl: string; rejectUrl: string }) {
  if (!env.adminApprovalEmail) {
    console.warn("ADMIN_APPROVAL_EMAIL not configured. Approval request email was not sent.");
    return;
  }

  await sendApprovalRequestEmail({
    name: user.name,
    email: user.email,
    requestedAt: new Date(),
    approveUrl: tokenData.approveUrl,
    rejectUrl: tokenData.rejectUrl,
    approvalToken: tokenData.token
  });
}

async function maybeCreateApprovalRequestForPendingUser(user: SafeUser) {
  const now = new Date();
  if (isDatabaseConnected()) {
    const activeRequest = await UserApprovalRequestModel.findOne({
      userId: user.id,
      decision: null,
      expiresAt: { $gt: now }
    }).lean();
    if (activeRequest) return null;
  } else if (localApprovalRequests.some((request) => request.userId === user.id && !request.decision && request.expiresAt > now)) {
    return null;
  }

  return createApprovalRequest(user);
}

export async function registerUser(input: { name: string; email: string; password: string }) {
  const existing = await findUserByEmail(input.email);
  if (existing) {
    if (existing.status === "pending_approval") {
      const request = await maybeCreateApprovalRequestForPendingUser(existing);
      if (request) await notifyAdminAboutApproval(existing, request);
    }

    await appendAuditLog({
      userId: existing.id,
      actorType: "system",
      channel: "web",
      action: "USER_REGISTER_REQUESTED_DUPLICATE",
      entityType: "User",
      entityId: existing.id,
      metadata: { email: existing.email, status: existing.status }
    });

    return {
      status: "pending_approval" as const,
      message: "Se a solicitacao puder ser criada, ela sera enviada para aprovacao."
    };
  }

  const passwordHash = await hashPassword(input.password);
  const user = await createUser({
    name: input.name,
    email: input.email,
    passwordHash,
    role: "user",
    status: "pending_approval"
  });
  const approvalRequest = await createApprovalRequest(user);
  await notifyAdminAboutApproval(user, approvalRequest);
  await appendAuditLog({
    userId: user.id,
    actorType: "system",
    channel: "web",
    action: "USER_REGISTER_REQUESTED",
    entityType: "User",
    entityId: user.id,
    metadata: { email: user.email }
  });

  return {
    status: "pending_approval" as const,
    message: "Cadastro solicitado. Aguarde a aprovacao do administrador."
  };
}

async function createSession(user: SafeUser, input: { ipAddress?: string; userAgent?: string }) {
  const token = createSecureToken();
  const tokenHashValue = hashToken(token);
  const now = new Date();
  const payload = {
    userId: user.id,
    tokenHash: tokenHashValue,
    expiresAt: addDays(env.authSessionTtlDays),
    revokedAt: null,
    lastUsedAt: now,
    ipAddress: input.ipAddress ?? "",
    userAgent: input.userAgent ?? ""
  };

  if (isDatabaseConnected()) {
    const session = await SessionModel.create(payload).then((record) => record.toObject());
    return { token, sessionId: String(session._id) };
  }

  localSessions.push({ ...payload, id: randomUUID(), createdAt: now, updatedAt: now });
  return { token, sessionId: localSessions[localSessions.length - 1].id };
}

export async function loginUser(input: { email: string; password: string }, metadata: { ipAddress?: string; userAgent?: string } = {}) {
  const user = await findUserWithPasswordByEmail(input.email);
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    await appendAuditLog({
      actorType: "system",
      channel: "web",
      action: "LOGIN_FAILED",
      metadata: { email: normalizeEmail(input.email) }
    });
    throw new HttpError(401, "E-mail ou senha invalidos.");
  }

  if (user.status === "pending_approval") throw new HttpError(403, "Seu cadastro ainda esta aguardando aprovacao.");
  if (user.status === "rejected") throw new HttpError(403, "Sua solicitacao de acesso nao foi aprovada.");
  if (user.status === "disabled") throw new HttpError(403, "Sua conta esta desativada.");

  const session = await createSession(user, metadata);
  const loggedUser = await updateUser(user.id, { lastLoginAt: new Date() }) ?? user;
  await appendAuditLog({
    userId: user.id,
    actorType: user.role === "admin" ? "admin" : "user",
    actorUserId: user.id,
    channel: "web",
    action: "LOGIN_SUCCESS",
    entityType: "User",
    entityId: user.id
  });

  return { user: loggedUser, token: session.token, sessionId: session.sessionId };
}

export async function getUserFromSessionToken(token: string | null) {
  if (!token) return null;
  const tokenHashValue = hashToken(token);
  const now = new Date();

  if (isDatabaseConnected()) {
    const session = await SessionModel.findOne({
      tokenHash: tokenHashValue,
      revokedAt: null,
      expiresAt: { $gt: now }
    }).lean() as LeanAuthRecord | null;
    if (!session) return null;

    const user = await findUserById(String(session.userId));
    if (!user || user.status !== "active") return null;

    await SessionModel.findByIdAndUpdate(session._id, { lastUsedAt: now });
    return { user, sessionId: String(session._id), tokenHash: tokenHashValue };
  }

  const session = localSessions.find((item) => item.tokenHash === tokenHashValue && !item.revokedAt && item.expiresAt > now);
  if (!session) return null;
  const user = await findUserById(session.userId);
  if (!user || user.status !== "active") return null;
  session.lastUsedAt = now;
  session.updatedAt = now;
  return { user, sessionId: session.id, tokenHash: tokenHashValue };
}

export async function logoutSession(token: string | null) {
  if (!token) return;
  const tokenHashValue = hashToken(token);
  const now = new Date();

  if (isDatabaseConnected()) {
    await SessionModel.findOneAndUpdate({ tokenHash: tokenHashValue, revokedAt: null }, { revokedAt: now });
    return;
  }

  for (const session of localSessions) {
    if (session.tokenHash === tokenHashValue && !session.revokedAt) {
      session.revokedAt = now;
      session.updatedAt = now;
    }
  }
}

async function revokeOtherUserSessions(userId: string, currentSessionId?: string) {
  const now = new Date();
  if (isDatabaseConnected()) {
    await SessionModel.updateMany(
      { userId, revokedAt: null, ...(currentSessionId ? { _id: { $ne: currentSessionId } } : {}) },
      { revokedAt: now }
    );
    return;
  }

  for (const session of localSessions) {
    if (session.userId === userId && session.id !== currentSessionId && !session.revokedAt) {
      session.revokedAt = now;
      session.updatedAt = now;
    }
  }
}

async function decideApprovalRequest(
  tokenHashValue: string,
  decision: "approved" | "rejected",
  actorUserId: string | null,
  actorType: "admin" | "system"
) {
  const now = new Date();
  let request: LocalApprovalRequest | LeanAuthRecord | null = null;

  if (isDatabaseConnected()) {
    request = await UserApprovalRequestModel.findOne({
      tokenHash: tokenHashValue,
      decision: null,
      expiresAt: { $gt: now }
    }).lean() as LeanAuthRecord | null;
  } else {
    request = localApprovalRequests.find((item) => item.tokenHash === tokenHashValue && !item.decision && item.expiresAt > now) ?? null;
  }

  if (!request) throw new HttpError(400, "Token de aprovacao invalido ou expirado.");

  const userId = String(request.userId);
  const user = await findUserById(userId);
  if (!user || user.status !== "pending_approval") throw new HttpError(409, "Solicitacao ja decidida ou usuario indisponivel.");

  const nextStatus: UserStatus = decision === "approved" ? "active" : "rejected";
  const updatedUser = await updateUser(user.id, { status: nextStatus });
  if (!updatedUser) throw new HttpError(404, "Usuario nao encontrado.");

  if (isDatabaseConnected()) {
    await UserApprovalRequestModel.updateMany(
      { userId: user.id, decision: null },
      { decidedAt: now, decision, decidedByUserId: actorUserId }
    );
  } else {
    for (const approvalRequest of localApprovalRequests) {
      if (approvalRequest.userId !== user.id || approvalRequest.decision) continue;
      approvalRequest.decidedAt = now;
      approvalRequest.decision = decision;
      approvalRequest.decidedByUserId = actorUserId;
      approvalRequest.updatedAt = now;
    }
  }

  await appendAuditLog({
    userId: user.id,
    actorType,
    actorUserId,
    channel: actorType === "admin" ? "admin" : "system",
    action: decision === "approved" ? "USER_APPROVED" : "USER_REJECTED",
    entityType: "User",
    entityId: user.id,
    metadata: { email: user.email }
  });
  await sendUserApprovalDecisionEmail({ to: user.email, approved: decision === "approved" });
  return updatedUser;
}

export async function approveUserByToken(token: string) {
  return decideApprovalRequest(hashToken(token), "approved", null, "admin");
}

export async function rejectUserByToken(token: string) {
  return decideApprovalRequest(hashToken(token), "rejected", null, "admin");
}

export async function approveUserByAdmin(userId: string, actorUserId: string) {
  const pendingRequest = isDatabaseConnected()
    ? await UserApprovalRequestModel.findOne({ userId, decision: null }).sort({ createdAt: -1 }).lean() as LeanAuthRecord | null
    : localApprovalRequests.find((request) => request.userId === userId && !request.decision) ?? null;
  const pendingRequestTokenHash = pendingRequest?.tokenHash;
  if (!pendingRequestTokenHash) throw new HttpError(404, "Solicitacao pendente nao encontrada.");
  return decideApprovalRequest(String(pendingRequestTokenHash), "approved", actorUserId, "admin");
}

export async function rejectUserByAdmin(userId: string, actorUserId: string) {
  const pendingRequest = isDatabaseConnected()
    ? await UserApprovalRequestModel.findOne({ userId, decision: null }).sort({ createdAt: -1 }).lean() as LeanAuthRecord | null
    : localApprovalRequests.find((request) => request.userId === userId && !request.decision) ?? null;
  const pendingRequestTokenHash = pendingRequest?.tokenHash;
  if (!pendingRequestTokenHash) throw new HttpError(404, "Solicitacao pendente nao encontrada.");
  return decideApprovalRequest(String(pendingRequestTokenHash), "rejected", actorUserId, "admin");
}

export async function listUsers() {
  if (isDatabaseConnected()) {
    const users = await UserModel.find().sort({ createdAt: -1 }).lean();
    return users.map(toSafeUser);
  }

  return [...localUsers].sort((left, right) => new Date(right.createdAt ?? 0).getTime() - new Date(left.createdAt ?? 0).getTime()).map(toSafeUser);
}

export async function disableUser(userId: string, actorUserId: string) {
  const user = await updateUser(userId, { status: "disabled" });
  if (!user) throw new HttpError(404, "Usuario nao encontrado.");
  await revokeOtherUserSessions(userId);
  await appendAuditLog({
    userId,
    actorType: "admin",
    actorUserId,
    channel: "admin",
    action: "USER_DISABLED",
    entityType: "User",
    entityId: userId
  });
  return user;
}

export async function reactivateUser(userId: string, actorUserId: string) {
  const user = await updateUser(userId, { status: "active" });
  if (!user) throw new HttpError(404, "Usuario nao encontrado.");
  await appendAuditLog({
    userId,
    actorType: "admin",
    actorUserId,
    channel: "admin",
    action: "USER_REACTIVATED",
    entityType: "User",
    entityId: userId
  });
  return user;
}

export async function requestPasswordReset(email: string) {
  const user = await findUserByEmail(email);
  if (!user || user.status !== "active") {
    return { message: "Se existir uma conta ativa para este e-mail, enviaremos instrucoes de redefinicao." };
  }

  const token = createSecureToken();
  const payload = {
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: addMinutes(env.authPasswordResetTtlMinutes),
    usedAt: null
  };

  if (isDatabaseConnected()) {
    await PasswordResetTokenModel.create(payload);
  } else {
    const now = new Date();
    localPasswordResetTokens.push({ ...payload, id: randomUUID(), createdAt: now, updatedAt: now });
  }

  await sendPasswordResetEmail({
    to: user.email,
    resetUrl: buildAppUrl(`/redefinir-senha?token=${encodeURIComponent(token)}`),
    resetToken: token
  });
  return { message: "Se existir uma conta ativa para este e-mail, enviaremos instrucoes de redefinicao." };
}

export async function resetPassword(token: string, password: string) {
  const tokenHashValue = hashToken(token);
  const now = new Date();
  let resetRecord: LocalPasswordResetToken | LeanAuthRecord | null = null;

  if (isDatabaseConnected()) {
    resetRecord = await PasswordResetTokenModel.findOne({
      tokenHash: tokenHashValue,
      usedAt: null,
      expiresAt: { $gt: now }
    }).lean() as LeanAuthRecord | null;
  } else {
    resetRecord = localPasswordResetTokens.find((item) => item.tokenHash === tokenHashValue && !item.usedAt && item.expiresAt > now) ?? null;
  }

  if (!resetRecord) throw new HttpError(400, "Token invalido ou expirado.");

  const userId = String(resetRecord.userId);
  const passwordHash = await hashPassword(password);
  const user = await updateUser(userId, { passwordHash });
  if (!user) throw new HttpError(404, "Usuario nao encontrado.");

  if (isDatabaseConnected()) {
    await PasswordResetTokenModel.findByIdAndUpdate((resetRecord as LeanAuthRecord)._id, { usedAt: now });
  } else {
    const local = resetRecord as LocalPasswordResetToken;
    local.usedAt = now;
    local.updatedAt = now;
  }

  await revokeOtherUserSessions(userId);
  await appendAuditLog({
    userId,
    actorType: "system",
    channel: "web",
    action: "PASSWORD_RESET",
    entityType: "User",
    entityId: userId
  });

  return { message: "Senha redefinida com sucesso." };
}

export async function changePassword(userId: string, currentPassword: string, password: string, currentSessionId?: string) {
  const user = isDatabaseConnected()
    ? await UserModel.findById(userId).select("+passwordHash").lean()
    : localUsers.find((item) => item.id === userId);
  if (!user) throw new HttpError(404, "Usuario nao encontrado.");

  const passwordHashValue = String((user as { passwordHash?: string }).passwordHash ?? "");
  if (!(await verifyPassword(currentPassword, passwordHashValue))) throw new HttpError(400, "Senha atual invalida.");

  await updateUser(userId, { passwordHash: await hashPassword(password) });
  await revokeOtherUserSessions(userId, currentSessionId);
  await appendAuditLog({
    userId,
    actorType: getAuthContext()?.role === "admin" ? "admin" : "user",
    actorUserId: userId,
    channel: "web",
    action: "PASSWORD_CHANGED",
    entityType: "User",
    entityId: userId
  });
  return { message: "Senha alterada com sucesso." };
}

export async function createBootstrapAdmin(input: { email: string; password: string }) {
  const email = normalizeEmail(input.email);
  const existing = await findUserByEmail(email);
  if (existing) {
    return { created: false, user: existing };
  }

  const user = await createUser({
    name: "Administrador",
    email,
    passwordHash: await hashPassword(input.password),
    role: "admin",
    status: "active"
  });
  await appendAuditLog({
    userId: user.id,
    actorType: "system",
    channel: "system",
    action: "BOOTSTRAP_ADMIN_CREATED",
    entityType: "User",
    entityId: user.id,
    metadata: { email: user.email }
  });
  return { created: true, user };
}

export async function getUserForAuthContext(userId: string) {
  return findUserById(userId);
}

export async function createPasswordResetTokenForTests(userId: string) {
  if (process.env.INVEST_HUB_TEST_MODE !== "true" || isDatabaseConnected()) {
    throw new HttpError(403, "Helper disponivel somente em testes locais.");
  }

  const token = createSecureToken();
  const now = new Date();
  localPasswordResetTokens.push({
    id: randomUUID(),
    userId,
    tokenHash: hashToken(token),
    expiresAt: addMinutes(env.authPasswordResetTtlMinutes),
    usedAt: null,
    createdAt: now,
    updatedAt: now
  });
  return token;
}

export async function createApprovalRequestTokenForTests(userId: string, expiresAt = addHours(env.authApprovalTtlHours)) {
  if (process.env.INVEST_HUB_TEST_MODE !== "true" || isDatabaseConnected()) {
    throw new HttpError(403, "Helper disponivel somente em testes locais.");
  }

  const token = createSecureToken();
  const now = new Date();
  localApprovalRequests.push({
    id: randomUUID(),
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    decidedAt: null,
    decision: null,
    decidedByUserId: null,
    createdAt: now,
    updatedAt: now
  });
  return token;
}

export async function updateUserProfile(userId: string, input: { name?: string; phoneNumber?: string; timezone?: string }) {
  return updateUser(userId, {
    ...(input.name ? { name: input.name.trim() } : {}),
    ...(input.phoneNumber !== undefined ? { phoneNumber: input.phoneNumber.trim(), phoneNormalized: normalizePhone(input.phoneNumber) } : {}),
    ...(input.timezone ? { timezone: input.timezone } : {})
  });
}

export async function markUserWhatsAppLinked(userId: string, input: { phoneNumber: string; linkedAt?: Date }) {
  const phoneNormalized = normalizePhone(input.phoneNumber);
  if (!phoneNormalized) throw new HttpError(400, "Telefone invalido.");

  if (isDatabaseConnected()) {
    const existing = await UserModel.findOne({ phoneNormalized }).lean() as LeanUserIdentityRecord | null;
    if (existing && String(existing._id) !== userId) throw new HttpError(409, "Telefone ja vinculado a outro usuario.");
  } else {
    const existing = localUsers.find((user) => user.phoneNormalized === phoneNormalized && user.id !== userId);
    if (existing) throw new HttpError(409, "Telefone ja vinculado a outro usuario.");
  }

  const user = await updateUser(userId, {
    phoneNumber: input.phoneNumber.trim(),
    phoneNormalized,
    whatsappLinkedAt: input.linkedAt ?? new Date()
  });
  if (!user) throw new HttpError(404, "Usuario nao encontrado.");
  return user;
}

export async function clearUserWhatsAppLink(userId: string) {
  const user = await updateUser(userId, {
    phoneNumber: "",
    phoneNormalized: "",
    whatsappLinkedAt: null
  });
  if (!user) throw new HttpError(404, "Usuario nao encontrado.");
  return user;
}
