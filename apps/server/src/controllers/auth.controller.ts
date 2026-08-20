import type { Request } from "express";
import { clearSessionCookie, readCsrfCookie, readSessionCookie, setCsrfCookie, setCsrfResponseHeader, setSessionCookie } from "../auth/cookie.service";
import { createSecureToken } from "../auth/token.service";
import { requireCurrentRequestAuth } from "../utils/request-auth";
import {
  approveUserByToken,
  changePassword,
  getUserForAuthContext,
  loginUser,
  logoutSession,
  registerUser,
  rejectUserByToken,
  requestPasswordReset,
  resetPassword
} from "../services/auth.service";
import { asyncHandler } from "../utils/async-handler";
import { created, ok } from "../utils/api-response";
import {
  authLoginSchema,
  authRegisterSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema
} from "../validators/auth.validator";

function getClientIp(request: Request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  return request.ip || request.socket.remoteAddress || "";
}

function renderDecisionPage(title: string, message: string) {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body{margin:0;background:#0b0f0c;color:#f8fafc;font-family:Inter,system-ui,sans-serif;display:grid;min-height:100vh;place-items:center}
      main{max-width:480px;border:1px solid #243126;background:#101511;border-radius:16px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
      h1{margin:0 0 12px;font-size:22px}p{color:#b6c2bb;line-height:1.5}a{color:#22c55e}
    </style>
  </head>
  <body><main><h1>${title}</h1><p>${message}</p><p><a href="/">Voltar ao Invest Hub</a></p></main></body>
</html>`;
}

function renderApprovalConfirmationPage(input: { title: string; message: string; actionUrl: string; buttonLabel: string }) {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${input.title}</title>
    <style>
      body{margin:0;background:#0b0f0c;color:#f8fafc;font-family:Inter,system-ui,sans-serif;display:grid;min-height:100vh;place-items:center}
      main{max-width:480px;border:1px solid #243126;background:#101511;border-radius:16px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
      h1{margin:0 0 12px;font-size:22px}p{color:#b6c2bb;line-height:1.5}button{border:0;border-radius:12px;background:#22c55e;color:#020617;font-weight:700;padding:12px 16px;cursor:pointer}a{color:#22c55e}
    </style>
  </head>
  <body>
    <main>
      <h1>${input.title}</h1>
      <p>${input.message}</p>
      <form method="post" action="${input.actionUrl}"><button type="submit">${input.buttonLabel}</button></form>
      <p><a href="/">Cancelar e voltar</a></p>
    </main>
  </body>
</html>`;
}

export const register = asyncHandler(async (request, response) => {
  const input = authRegisterSchema.parse(request.body);
  created(response, await registerUser(input));
});

export const login = asyncHandler(async (request, response) => {
  const input = authLoginSchema.parse(request.body);
  const result = await loginUser(input, {
    ipAddress: getClientIp(request),
    userAgent: request.headers["user-agent"] ?? ""
  });
  const csrfToken = createSecureToken(24);
  setSessionCookie(response, request, result.token);
  setCsrfCookie(response, request, csrfToken);
  setCsrfResponseHeader(response, csrfToken);
  ok(response, { user: result.user });
});

export const logout = asyncHandler(async (request, response) => {
  await logoutSession(readSessionCookie(request.headers.cookie));
  clearSessionCookie(response, request);
  ok(response, { loggedOut: true });
});

export const me = asyncHandler(async (request, response) => {
  const auth = requireCurrentRequestAuth(request);
  const csrfToken = readCsrfCookie(request.headers.cookie) || createSecureToken(24);
  if (!readCsrfCookie(request.headers.cookie)) setCsrfCookie(response, request, csrfToken);
  setCsrfResponseHeader(response, csrfToken);
  ok(response, { user: await getUserForAuthContext(auth.userId) });
});

export const forgotPassword = asyncHandler(async (request, response) => {
  const input = forgotPasswordSchema.parse(request.body);
  ok(response, await requestPasswordReset(input.email));
});

export const resetPasswordController = asyncHandler(async (request, response) => {
  const input = resetPasswordSchema.parse(request.body);
  ok(response, await resetPassword(input.token, input.password));
});

export const changePasswordController = asyncHandler(async (request, response) => {
  const auth = requireCurrentRequestAuth(request);
  const input = changePasswordSchema.parse(request.body);
  ok(response, await changePassword(auth.userId, input.currentPassword, input.password, auth.sessionId));
});

export const approveByToken = asyncHandler(async (request, response) => {
  await approveUserByToken(String(request.params.token));
  response.type("html").send(renderDecisionPage("Usuario aprovado", "O usuario foi aprovado com sucesso."));
});

export const rejectByToken = asyncHandler(async (request, response) => {
  await rejectUserByToken(String(request.params.token));
  response.type("html").send(renderDecisionPage("Usuario rejeitado", "A solicitacao foi rejeitada com sucesso."));
});

export const confirmApproveByToken = asyncHandler(async (request, response) => {
  response.type("html").send(renderApprovalConfirmationPage({
    title: "Confirmar aprovacao",
    message: "Confirme para aprovar esta solicitacao de acesso ao Invest Hub.",
    actionUrl: `/api/auth/approvals/${encodeURIComponent(String(request.params.token))}/approve`,
    buttonLabel: "Aprovar usuario"
  }));
});

export const confirmRejectByToken = asyncHandler(async (request, response) => {
  response.type("html").send(renderApprovalConfirmationPage({
    title: "Confirmar rejeicao",
    message: "Confirme para rejeitar esta solicitacao de acesso ao Invest Hub.",
    actionUrl: `/api/auth/approvals/${encodeURIComponent(String(request.params.token))}/reject`,
    buttonLabel: "Rejeitar usuario"
  }));
});
