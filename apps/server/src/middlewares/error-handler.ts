import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "../utils/http-error";

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

  const message = error instanceof Error ? error.message : "Unexpected server error";
  response.status(500).json({
    success: false,
    error: {
      message
    }
  });
}
