import type { Request, Response } from "express";
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

function readHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function normalizeOrigin(origin: string) {
  return origin.trim().replace(/\/+$/, "");
}

function resolveRequestProtocol(request: Request) {
  return (readHeaderValue(request.headers["x-forwarded-proto"]) || request.protocol || "http")
    .split(",")[0]
    .trim()
    .toLowerCase();
}

function resolveRequestOrigin(request: Request) {
  const protocol = resolveRequestProtocol(request);
  const host = readHeaderValue(request.headers["x-forwarded-host"]) || readHeaderValue(request.headers.host);
  if (!host) return "";
  return normalizeOrigin(`${protocol}://${host}`);
}

function isSecureRequest(request: Request) {
  return resolveRequestProtocol(request) === "https";
}

function shouldUseCrossSiteCookiePolicy(request: Request) {
  const requestOrigin = resolveRequestOrigin(request);
  const browserOrigin = normalizeOrigin(readHeaderValue(request.headers.origin));
  return Boolean(requestOrigin && browserOrigin && requestOrigin !== browserOrigin);
}

function resolveCookiePolicy(request: Request) {
  if (shouldUseCrossSiteCookiePolicy(request)) {
    return {
      secure: true,
      sameSite: "none" as const
    };
  }

  return {
    secure: env.authCookieSecure || isSecureRequest(request),
    sameSite: env.authCookieSameSite
  };
}

export function setSessionCookie(response: Response, request: Request, token: string) {
  const policy = resolveCookiePolicy(request);
  response.cookie(sessionCookieName, token, {
    httpOnly: true,
    secure: policy.secure,
    sameSite: policy.sameSite,
    maxAge: env.authSessionTtlDays * 24 * 60 * 60 * 1000,
    path: "/"
  });
}

export function setCsrfCookie(response: Response, request: Request, token: string) {
  const policy = resolveCookiePolicy(request);
  response.cookie(csrfCookieName, token, {
    httpOnly: false,
    secure: policy.secure,
    sameSite: policy.sameSite,
    maxAge: env.authSessionTtlDays * 24 * 60 * 60 * 1000,
    path: "/"
  });
}

export function setCsrfResponseHeader(response: Response, token: string) {
  response.setHeader("X-CSRF-Token", token);
}

export function clearSessionCookie(response: Response, request: Request) {
  const policy = resolveCookiePolicy(request);
  response.clearCookie(sessionCookieName, {
    httpOnly: true,
    secure: policy.secure,
    sameSite: policy.sameSite,
    path: "/"
  });
  response.clearCookie(csrfCookieName, {
    httpOnly: false,
    secure: policy.secure,
    sameSite: policy.sameSite,
    path: "/"
  });
}
