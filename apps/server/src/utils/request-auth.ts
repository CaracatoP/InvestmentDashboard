import type { Request } from "express";
import type { AuthContext } from "../auth/auth-context";
import { HttpError } from "./http-error";

export function requireCurrentRequestAuth(request: Request): AuthContext {
  if (!request.auth) throw new HttpError(401, "Autenticacao obrigatoria.");
  return request.auth;
}
