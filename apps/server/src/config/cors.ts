import type { CorsOptions } from "cors";
import { env } from "./env";
import { HttpError } from "../utils/http-error";

const localOrigins = ["http://localhost:5173", "http://localhost:5174"];

export function normalizeOrigin(origin: string) {
  return origin.trim().replace(/\/+$/, "");
}

export function buildAllowedOrigins(frontendUrl = env.frontendUrl, frontendUrls = env.frontendUrls) {
  return Array.from(new Set([...localOrigins, frontendUrl, ...frontendUrls].filter(Boolean).map(normalizeOrigin)));
}

export function isOriginAllowed(origin: string | undefined, allowedOrigins = buildAllowedOrigins()) {
  if (!origin) return true;
  return allowedOrigins.includes(normalizeOrigin(origin));
}

export function createCorsOptions(allowedOrigins = buildAllowedOrigins()): CorsOptions {
  return {
    credentials: true,
    origin(origin, callback) {
      if (isOriginAllowed(origin, allowedOrigins)) {
        callback(null, true);
        return;
      }

      console.warn(`CORS origin rejected: ${origin}`);
      callback(new HttpError(403, `CORS origin not allowed: ${origin}`));
    }
  };
}
