import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

function numericHeader(value: number | string | string[] | undefined) {
  if (Array.isArray(value)) return Number(value[0]) || 0;
  return Number(value) || 0;
}

export function performanceLogger(request: Request, response: Response, next: NextFunction) {
  if (!env.performanceLogs) {
    next();
    return;
  }

  const startedAt = process.hrtime.bigint();

  response.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const route = request.originalUrl.split("?")[0];
    const responseBytes = numericHeader(response.getHeader("content-length"));
    const cacheHeader = response.getHeader("x-cache");

    console.info(
      JSON.stringify({
        operation: "http-performance",
        method: request.method,
        route,
        statusCode: response.statusCode,
        durationMs: Math.round(durationMs),
        responseBytes,
        cache: typeof cacheHeader === "string" ? cacheHeader : "unknown"
      })
    );
  });

  next();
}
