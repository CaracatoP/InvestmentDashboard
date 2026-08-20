import type { Response } from "express";
import { env } from "../config/env";

export const sessionCookieName = "invest_hub_session";
export const csrfCookieName = "invest_hub_csrf";

export function parseCookieHeader(header: string | undefined) {
  const cookies = new Map<string, string>();
  if (!header) return cookies;

  for (const pair of header.split(";")) {
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex < 0) continue;
    const key = pair.slice(0, separatorIndex).trim();
    const value = pair.slice(separatorIndex + 1).trim();
    if (key) cookies.set(key, decodeURIComponent(value));
  }

  return cookies;
}

export function readSessionCookie(header: string | undefined) {
  return parseCookieHeader(header).get(sessionCookieName) ?? null;
}

export function readCsrfCookie(header: string | undefined) {
  return parseCookieHeader(header).get(csrfCookieName) ?? null;
}

export function setSessionCookie(response: Response, token: string) {
  response.cookie(sessionCookieName, token, {
    httpOnly: true,
    secure: env.authCookieSecure,
    sameSite: env.authCookieSameSite,
    maxAge: env.authSessionTtlDays * 24 * 60 * 60 * 1000,
    path: "/"
  });
}

export function setCsrfCookie(response: Response, token: string) {
  response.cookie(csrfCookieName, token, {
    httpOnly: false,
    secure: env.authCookieSecure,
    sameSite: env.authCookieSameSite,
    maxAge: env.authSessionTtlDays * 24 * 60 * 60 * 1000,
    path: "/"
  });
}

export function clearSessionCookie(response: Response) {
  response.clearCookie(sessionCookieName, {
    httpOnly: true,
    secure: env.authCookieSecure,
    sameSite: env.authCookieSameSite,
    path: "/"
  });
  response.clearCookie(csrfCookieName, {
    httpOnly: false,
    secure: env.authCookieSecure,
    sameSite: env.authCookieSameSite,
    path: "/"
  });
}
