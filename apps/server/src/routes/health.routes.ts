import { Router } from "express";
import { isDatabaseConnected } from "../config/database";
import { env } from "../config/env";

export const healthRoutes = Router();

export function getHealthStatus() {
  const database = isDatabaseConnected() ? "connected" : "disconnected";

  return {
    status: database === "connected" ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    environment: env.nodeEnv,
    database
  };
}

export function getHealthHttpStatus() {
  return isDatabaseConnected() ? 200 : 503;
}

healthRoutes.get("/", (_request, response) => {
  response.status(getHealthHttpStatus()).json(getHealthStatus());
});
