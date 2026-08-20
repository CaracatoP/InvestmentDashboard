import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "../utils/http-error";

function redactUrl(url?: string) {
  return (url ?? "")
    .replace(/(\/auth\/approvals\/)[^/]+(\/(?:approve|reject))/g, "$1[redacted]$2")
    .replace(/([?&](?:token|approvalToken|resetToken)=)[^&]+/gi, "$1[redacted]");
}

function logUnexpectedError(error: unknown, request: Request) {
  if (process.env.NODE_ENV !== "development") return;

  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(
    JSON.stringify({
      operation: "request-error",
      method: request.method,
      path: redactUrl(request.originalUrl),
      message
    })
  );
}

export function notFoundHandler(request: Request, response: Response) {
  response.status(404).json({
    success: false,
    error: {
      message: `Route ${request.method} ${redactUrl(request.originalUrl)} not found`
    }
  });
}

export function errorHandler(error: unknown, _request: Request, response: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    response.status(422).json({
      success: false,
      error: {
        message: "Validation error",
        issues: error.flatten()
      }
    });
    return;
  }

  if (error instanceof HttpError) {
    response.status(error.statusCode).json({
      success: false,
      error: {
        message: error.message
      }
    });
    return;
  }

  if ((error as { code?: unknown })?.code === 11000) {
    const duplicateError = error as { keyPattern?: Record<string, unknown> };
    const keyPattern = duplicateError.keyPattern ?? {};
    const isLegacyMonthlyPlanConflict = "year" in keyPattern && "month" in keyPattern && !("userId" in keyPattern);
    const isRecurrenceConflict = "recurrenceId" in keyPattern || "recurrenceOriginalDate" in keyPattern;

    response.status(409).json({
      success: false,
      error: {
        message: isLegacyMonthlyPlanConflict
          ? "Nao foi possivel salvar este planejamento porque existe um conflito de indice legado para este mes."
          : isRecurrenceConflict
            ? "Nao foi possivel salvar este registro porque ja existe um conflito de recorrencia."
            : "Nao foi possivel salvar este registro porque ja existe outro item com a mesma chave."
      }
    });
    return;
  }

  logUnexpectedError(error, _request);
  response.status(500).json({
    success: false,
    error: {
      message: process.env.NODE_ENV === "development" && error instanceof Error ? error.message : "Unexpected server error"
    }
  });
}
