import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { HttpError } from "../utils/http-error";

function extractSecret(request: Request) {
  const explicitHeader = request.header("x-n8n-integration-secret")?.trim();
  if (explicitHeader) return explicitHeader;

  const authorization = request.header("authorization")?.trim() ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function safeStringEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function requireN8nIntegrationSecret(request: Request, _response: Response, next: NextFunction) {
  try {
    const configuredSecret = env.n8nIntegrationSecret.trim();
    if (!configuredSecret) throw new HttpError(503, "Integracao n8n nao configurada.");

    const receivedSecret = extractSecret(request);
    if (!receivedSecret) throw new HttpError(401, "Segredo da integracao n8n ausente.");
    if (!safeStringEquals(receivedSecret, configuredSecret)) throw new HttpError(401, "Segredo da integracao n8n invalido.");

    next();
  } catch (error) {
    next(error);
  }
}
