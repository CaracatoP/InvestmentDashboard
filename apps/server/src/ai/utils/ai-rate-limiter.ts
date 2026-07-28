import { env } from "../../config/env";

const requests = new Map<string, number[]>();

export function checkAiRateLimit(scope = "global") {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const current = (requests.get(scope) ?? []).filter((timestamp) => now - timestamp < windowMs);

  if (current.length >= env.aiMaxRequestsPerHour) {
    const retryAt = new Date(Math.min(...current) + windowMs).toISOString();
    return {
      allowed: false,
      retryAt,
      remaining: 0
    };
  }

  current.push(now);
  requests.set(scope, current);
  return {
    allowed: true,
    retryAt: null,
    remaining: Math.max(env.aiMaxRequestsPerHour - current.length, 0)
  };
}
