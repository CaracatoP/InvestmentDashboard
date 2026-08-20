import type { NextFunction, Request, Response } from "express";
import { readCsrfCookie } from "../auth/cookie.service";
import { safeTokenEquals } from "../auth/token.service";
import { HttpError } from "../utils/http-error";

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function csrfProtection(request: Request, _response: Response, next: NextFunction) {
  if (!unsafeMethods.has(request.method.toUpperCase())) {
    next();
    return;
  }

  const cookieToken = readCsrfCookie(request.headers.cookie);
  const headerValue = request.headers["x-csrf-token"];
  const headerToken = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (!cookieToken || !headerToken || !safeTokenEquals(cookieToken, headerToken)) {
    next(new HttpError(403, "CSRF token invalido."));
    return;
  }

  next();
}
