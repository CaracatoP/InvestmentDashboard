import type { RequestHandler } from "express";
import { HttpError } from "../utils/http-error";

interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyPrefix: string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitEntry>();

function getClientIp(request: Parameters<RequestHandler>[0]) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  return request.ip || request.socket.remoteAddress || "unknown";
}

export function rateLimit({ windowMs, max, keyPrefix }: RateLimitOptions): RequestHandler {
  return (request, _response, next) => {
    const now = Date.now();
    const key = `${keyPrefix}:${getClientIp(request)}`;
    const entry = buckets.get(key);

    if (!entry || now > entry.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (entry.count >= max) {
      next(new HttpError(429, "Muitas tentativas. Tente novamente em alguns minutos."));
      return;
    }

    entry.count += 1;
    next();
  };
}
