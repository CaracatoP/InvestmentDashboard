import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { afterEach, test } from "node:test";
import { app } from "../app";

const originalFetch = global.fetch;

function jsonResponse(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) }
  });
}

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

afterEach(() => {
  global.fetch = originalFetch;
});

test("CDI status and manual refresh endpoints return the current source reference date and update timestamp", async () => {
  global.fetch = (async (input, init) => {
    const url = String(input);
    if (url.startsWith("https://api.bcb.gov.br/")) {
      return jsonResponse([{ data: "24/07/2026", valor: "0.052531" }]);
    }

    if (!originalFetch) throw new Error("Original fetch is not available");
    return originalFetch(input, init);
  }) as typeof fetch;

  const server = await listenForTest();

  try {
    const { port } = server.address() as AddressInfo;
    const refreshResponse = await fetch(`http://127.0.0.1:${port}/api/cdi/refresh`, { method: "POST" });
    const refreshPayload = (await refreshResponse.json()) as {
      success?: boolean;
      data?: {
        rate?: {
          rate?: number;
          referenceDate?: string;
          source?: string;
          updatedAt?: string;
        };
        recalculation?: {
          applied?: number;
        };
      };
    };

    const statusResponse = await fetch(`http://127.0.0.1:${port}/api/cdi/status`);
    const statusPayload = (await statusResponse.json()) as {
      success?: boolean;
      data?: {
        rate?: number;
        referenceDate?: string;
        source?: string;
        updatedAt?: string;
        history?: unknown[];
      };
    };

    assert.equal(refreshResponse.status, 200);
    assert.equal(refreshPayload.success, true);
    assert.equal(refreshPayload.data?.rate?.source, "bcb");
    assert.equal(refreshPayload.data?.rate?.referenceDate, "2026-07-24");
    assert.equal(typeof refreshPayload.data?.rate?.updatedAt, "string");
    assert.equal(refreshPayload.data?.recalculation?.applied, 0);

    assert.equal(statusResponse.status, 200);
    assert.equal(statusPayload.success, true);
    assert.equal(statusPayload.data?.source, "bcb");
    assert.equal(statusPayload.data?.referenceDate, "2026-07-24");
    assert.equal(typeof statusPayload.data?.rate, "number");
    assert.equal(typeof statusPayload.data?.updatedAt, "string");
    assert.ok(Array.isArray(statusPayload.data?.history));
  } finally {
    await closeServer(server);
  }
});

test("manual CDI refresh endpoint coalesces simultaneous requests", async () => {
  let bcbCalls = 0;
  let resolveBcbResponse: (response: Response) => void = () => undefined;

  global.fetch = (((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("https://api.bcb.gov.br/")) {
      bcbCalls += 1;
      return new Promise<Response>((resolve) => {
        resolveBcbResponse = resolve;
      });
    }

    if (!originalFetch) throw new Error("Original fetch is not available");
    return originalFetch(input, init);
  }) as unknown) as typeof fetch;

  const server = await listenForTest();

  try {
    const { port } = server.address() as AddressInfo;
    const endpoint = `http://127.0.0.1:${port}/api/cdi/refresh`;
    const first = fetch(endpoint, { method: "POST" });
    const second = fetch(endpoint, { method: "POST" });

    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(bcbCalls, 1);

    resolveBcbResponse(jsonResponse([{ data: "24/07/2026", valor: "0.052531" }]));

    const [firstResponse, secondResponse] = await Promise.all([first, second]);
    const firstPayload = (await firstResponse.json()) as { success?: boolean; data?: { rate?: { source?: string } } };
    const secondPayload = (await secondResponse.json()) as { success?: boolean; data?: { rate?: { source?: string } } };

    assert.equal(firstResponse.status, 200);
    assert.equal(secondResponse.status, 200);
    assert.equal(firstPayload.success, true);
    assert.equal(secondPayload.success, true);
    assert.equal(firstPayload.data?.rate?.source, "bcb");
    assert.equal(secondPayload.data?.rate?.source, "bcb");
    assert.equal(bcbCalls, 1);
  } finally {
    await closeServer(server);
  }
});
