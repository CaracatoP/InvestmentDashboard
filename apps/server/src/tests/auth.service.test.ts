import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  approveUserByAdmin,
  approveUserByToken,
  changePassword,
  createApprovalRequestTokenForTests,
  createBootstrapAdmin,
  createPasswordResetTokenForTests,
  disableUser,
  getUserFromSessionToken,
  listUsers,
  loginUser,
  logoutSession,
  reactivateUser,
  registerUser,
  rejectUserByAdmin,
  requestPasswordReset,
  resetPassword
} from "../services/auth.service";
import { HttpError } from "../utils/http-error";

process.env.INVEST_HUB_TEST_MODE = "true";

const strongPassword = "SenhaForte123!";

function uniqueEmail(prefix: string) {
  return `${prefix}-${randomUUID()}@example.com`;
}

function expectHttpStatus(statusCode: number) {
  return (error: unknown) => error instanceof HttpError && error.statusCode === statusCode;
}

async function findUserByEmail(email: string) {
  const user = (await listUsers()).find((item) => item.email === email);
  assert.ok(user, `Expected user ${email} to exist`);
  return user;
}

test("registration waits for approval before login and active sessions can be revoked", async () => {
  const admin = await createBootstrapAdmin({ email: uniqueEmail("admin-approval"), password: strongPassword });
  const email = uniqueEmail("pending-user");

  await registerUser({ name: "Usuario Pendente", email, password: strongPassword });
  await assert.rejects(() => loginUser({ email, password: strongPassword }), expectHttpStatus(403));

  const pendingUser = await findUserByEmail(email);
  assert.equal(pendingUser.status, "pending_approval");

  const approvedUser = await approveUserByAdmin(pendingUser.id, admin.user.id);
  assert.equal(approvedUser.status, "active");

  const session = await loginUser({ email, password: strongPassword }, { ipAddress: "127.0.0.1", userAgent: "node-test" });
  assert.equal(session.user.email, email);
  assert.ok(await getUserFromSessionToken(session.token));

  await changePassword(session.user.id, strongPassword, "NovaSenhaForte123!", session.sessionId);
  await assert.rejects(() => loginUser({ email, password: strongPassword }), expectHttpStatus(401));

  await logoutSession(session.token);
  assert.equal(await getUserFromSessionToken(session.token), null);
  assert.equal((await loginUser({ email, password: "NovaSenhaForte123!" })).user.email, email);
});

test("admin can reject, disable and reactivate users without changing bootstrap credentials", async () => {
  const adminEmail = uniqueEmail("admin-idempotent");
  const firstBootstrap = await createBootstrapAdmin({ email: adminEmail, password: strongPassword });
  const secondBootstrap = await createBootstrapAdmin({ email: adminEmail, password: "OutraSenhaForte123!" });
  assert.equal(firstBootstrap.created, true);
  assert.equal(secondBootstrap.created, false);
  assert.equal(secondBootstrap.user.id, firstBootstrap.user.id);
  assert.equal((await loginUser({ email: adminEmail, password: strongPassword })).user.role, "admin");
  await assert.rejects(() => loginUser({ email: adminEmail, password: "OutraSenhaForte123!" }), expectHttpStatus(401));

  const rejectedEmail = uniqueEmail("rejected-user");
  await registerUser({ name: "Usuario Rejeitado", email: rejectedEmail, password: strongPassword });
  const rejectedTarget = await findUserByEmail(rejectedEmail);
  const rejected = await rejectUserByAdmin(rejectedTarget.id, firstBootstrap.user.id);
  assert.equal(rejected.status, "rejected");
  await assert.rejects(() => loginUser({ email: rejectedEmail, password: strongPassword }), expectHttpStatus(403));

  const disabledEmail = uniqueEmail("disabled-user");
  await registerUser({ name: "Usuario Desativado", email: disabledEmail, password: strongPassword });
  const disabledTarget = await findUserByEmail(disabledEmail);
  await approveUserByAdmin(disabledTarget.id, firstBootstrap.user.id);
  const disabled = await disableUser(disabledTarget.id, firstBootstrap.user.id);
  assert.equal(disabled.status, "disabled");
  await assert.rejects(() => loginUser({ email: disabledEmail, password: strongPassword }), expectHttpStatus(403));

  const reactivated = await reactivateUser(disabledTarget.id, firstBootstrap.user.id);
  assert.equal(reactivated.status, "active");
  assert.equal((await loginUser({ email: disabledEmail, password: strongPassword })).user.email, disabledEmail);
});

test("approval tokens are single-use, expirable and duplicate registration stays generic", async () => {
  const duplicateEmail = uniqueEmail("duplicate-pending");
  const genericPendingMessage = "Se a solicitacao puder ser criada, ela sera enviada para aprovacao.";
  await registerUser({ name: "Usuario Duplicado", email: duplicateEmail, password: strongPassword });
  assert.equal((await registerUser({ name: "Usuario Duplicado", email: duplicateEmail, password: strongPassword })).message, genericPendingMessage);

  const reusableTarget = await findUserByEmail(duplicateEmail);
  const token = await createApprovalRequestTokenForTests(reusableTarget.id);
  assert.equal((await approveUserByToken(token)).status, "active");
  await assert.rejects(() => approveUserByToken(token), expectHttpStatus(400));

  const expiredEmail = uniqueEmail("expired-approval");
  await registerUser({ name: "Usuario Expirado", email: expiredEmail, password: strongPassword });
  const expiredTarget = await findUserByEmail(expiredEmail);
  const expiredToken = await createApprovalRequestTokenForTests(expiredTarget.id, new Date(Date.now() - 1000));
  await assert.rejects(() => approveUserByToken(expiredToken), expectHttpStatus(400));
  assert.equal((await findUserByEmail(expiredEmail)).status, "pending_approval");
});

test("password reset is generic for unknown emails, one-use and revokes old sessions", async () => {
  const adminEmail = uniqueEmail("admin-reset");
  const admin = await createBootstrapAdmin({ email: adminEmail, password: strongPassword });
  const genericMessage = "Se existir uma conta ativa para este e-mail, enviaremos instrucoes de redefinicao.";

  assert.equal((await requestPasswordReset(uniqueEmail("missing"))).message, genericMessage);
  assert.equal((await requestPasswordReset(adminEmail)).message, genericMessage);

  const oldSession = await loginUser({ email: adminEmail, password: strongPassword });
  const resetToken = await createPasswordResetTokenForTests(admin.user.id);

  assert.equal((await resetPassword(resetToken, "SenhaResetada123!")).message, "Senha redefinida com sucesso.");
  assert.equal(await getUserFromSessionToken(oldSession.token), null);
  await assert.rejects(() => resetPassword(resetToken, "SenhaNaoUsada123!"), expectHttpStatus(400));
  await assert.rejects(() => loginUser({ email: adminEmail, password: strongPassword }), expectHttpStatus(401));
  assert.equal((await loginUser({ email: adminEmail, password: "SenhaResetada123!" })).user.id, admin.user.id);
});
