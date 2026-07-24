import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { app } from "../app";
import { buildAllowedOrigins, isOriginAllowed } from "../config/cors";
import { env, parseBoolean, parsePort } from "../config/env";
import { createAsset } from "../repositories/investment.repository";
import { redactSensitiveText } from "../utils/logging";

async function listenForTest() {
  const server = app.listen(0, "127.0.0.1");

  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  return server;
}

async function closeServer(server: ReturnType<typeof app.listen>) {
  if (!server.listening) return;

  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("parsePort uses configured PORT with local fallback", () => {
  assert.equal(parsePort("4578"), 4578);
  assert.equal(parsePort(undefined), 4000);
  assert.equal(parsePort("invalid"), 4000);
});

test("schedulers can be disabled through environment parsing", () => {
  assert.equal(parseBoolean("false", true), false);
  assert.equal(parseBoolean("true", false), true);
  assert.equal(parseBoolean(undefined, true), true);
});

test("CORS accepts localhost and configured frontend origins", () => {
  const allowedOrigins = buildAllowedOrigins("https://app.vercel.app", ["https://preview.vercel.app"]);

  assert.equal(isOriginAllowed(undefined, allowedOrigins), true);
  assert.equal(isOriginAllowed("http://localhost:5173", allowedOrigins), true);
  assert.equal(isOriginAllowed("http://localhost:5174", allowedOrigins), true);
  assert.equal(isOriginAllowed("https://app.vercel.app", allowedOrigins), true);
  assert.equal(isOriginAllowed("https://preview.vercel.app", allowedOrigins), true);
});

test("CORS rejects unknown origins", () => {
  const allowedOrigins = buildAllowedOrigins("https://app.vercel.app", []);

  assert.equal(isOriginAllowed("https://evil.example", allowedOrigins), false);
});

test("health check is available under /api/health and does not expose secrets", async () => {
  const server = await listenForTest();

  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    const payload = await response.json() as Record<string, unknown>;
    const serialized = JSON.stringify(payload);

    assert.ok([200, 503].includes(response.status));
    assert.ok(["ok", "degraded"].includes(String(payload.status)));
    assert.equal(typeof payload.timestamp, "string");
    assert.ok(["connected", "disconnected"].includes(String(payload.database)));
    assert.equal(serialized.includes("MONGODB_URI"), false);
    assert.equal(serialized.includes("mongodb+srv://"), false);
  } finally {
    await closeServer(server);
  }
});

test("asset price history endpoint returns a standardized response", async () => {
  const previousProvider = env.marketDataProvider;
  const previousKey = env.marketDataApiKey;
  env.marketDataProvider = "";
  env.marketDataApiKey = "";

  const asset = await createAsset({
    name: "Fundo Endpoint",
    ticker: "E2EH11",
    category: "FII",
    currency: "BRL",
    active: true
  });
  const server = await listenForTest();

  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/api/assets/${asset.ticker}/price-history?range=1A`);
    const payload = (await response.json()) as {
      data?: {
        ticker?: string;
        range?: string;
        interval?: string;
        status?: string;
        points?: unknown[];
      };
    };

    assert.equal(response.status, 200);
    assert.equal(payload.data?.ticker, "E2EH11");
    assert.equal(payload.data?.range, "1y");
    assert.equal(payload.data?.interval, "1d");
    assert.equal(payload.data?.status, "unavailable");
    assert.deepEqual(payload.data?.points, []);
  } finally {
    env.marketDataProvider = previousProvider;
    env.marketDataApiKey = previousKey;
    await closeServer(server);
  }
});

test("CORS middleware allows localhost requests and rejects unknown origins", async () => {
  const server = await listenForTest();

  try {
    const { port } = server.address() as AddressInfo;
    const accepted = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { Origin: "http://localhost:5173" }
    });
    const rejected = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { Origin: "https://evil.example" }
    });

    assert.equal(accepted.headers.get("access-control-allow-origin"), "http://localhost:5173");
    assert.equal(rejected.status, 403);
  } finally {
    await closeServer(server);
  }
});

test("redactSensitiveText removes configured secrets from log messages", () => {
  const secret = "mongodb+srv://user:password@example.mongodb.net/app";
  const message = redactSensitiveText(`connection failed for ${secret}`, [secret]);

  assert.equal(message.includes(secret), false);
  assert.equal(message, "connection failed for [redacted]");
});
