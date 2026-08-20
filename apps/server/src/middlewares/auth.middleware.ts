import type { NextFunction, Request, Response } from "express";
import { runWithAuthContext } from "../auth/auth-context";
import { readSessionCookie } from "../auth/cookie.service";
import { getUserFromSessionToken } from "../services/auth.service";
import { HttpError } from "../utils/http-error";

export async function requireAuth(request: Request, _response: Response, next: NextFunction) {
  try {
    const sessionToken = readSessionCookie(request.headers.cookie);
    const session = await getUserFromSessionToken(sessionToken);
    if (!session) {
      next(new HttpError(401, "Autenticacao obrigatoria."));
      return;
    }

    const context = {
      userId: session.user.id,
      role: session.user.role,
      email: session.user.email,
      channel: "web" as const,
      sessionId: session.sessionId
    };

    request.auth = context;
    runWithAuthContext(context, () => next());
  } catch (error) {
    next(error);
  }
}

export function requireAdmin(request: Request, _response: Response, next: NextFunction) {
  if (request.auth?.role !== "admin") {
    next(new HttpError(403, "Acesso administrativo obrigatorio."));
    return;
  }

  next();
}
