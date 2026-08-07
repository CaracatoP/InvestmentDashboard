import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "../utils/http-error";

function logUnexpectedError(error: unknown, request: Request) {
  if (process.env.NODE_ENV !== "development") return;

  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(
    JSON.stringify({
      operation: "request-error",
      method: request.method,
      path: request.originalUrl,
      message
    })
  );
}

export function notFoundHandler(request: Request, response: Response) {
  response.status(404).json({
    success: false,
    error: {
      message: `Route ${request.method} ${request.originalUrl} not found`
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
    response.status(409).json({
      success: false,
      error: {
        message: "Nao foi possivel salvar este registro porque ja existe um conflito de recorrencia."
      }
    });
    return;
  }

  const message = error instanceof Error ? error.message : "Unexpected server error";
  logUnexpectedError(error, _request);
  response.status(500).json({
    success: false,
    error: {
      message
    }
  });
}
