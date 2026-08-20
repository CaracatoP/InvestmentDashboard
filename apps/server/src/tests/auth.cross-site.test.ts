import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { app } from "../app";
import { createBootstrapAdmin } from "../services/auth.service";

const allowedOrigin = "https://investment-dashboard-client.vercel.app";
const disallowedOrigin = "https://evil.example.com";
const password = "SenhaForte123!";

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

function splitSetCookieHeader(header: string | null) {
  if (!header) return [];
  return header.split(/,(?=\s*invest_hub_)/).map((item) => item.trim());
}

function getSetCookies(response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  return headers.getSetCookie?.() ?? splitSetCookieHeader(response.headers.get("set-cookie"));
}

function buildCookieHeader(response: Response) {
  return getSetCookies(response).map((cookie) => cookie.split(";")[0]).join("; ");
}

test("cross-site auth issues secure cookies, exposes the CSRF token, and keeps the session across private requests", async () => {
  const server = await listenForTest();

  try {
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;
    const email = `cross-site-${randomUUID()}@example.com`;
    await createBootstrapAdmin({ email, password });

    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        Origin: allowedOrigin,
        "content-type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    assert.equal(loginResponse.status, 200);
    assert.equal(loginResponse.headers.get("access-control-allow-origin"), allowedOrigin);
    assert.equal(loginResponse.headers.get("access-control-allow-credentials"), "true");
    assert.match(loginResponse.headers.get("access-control-expose-headers") ?? "", /X-CSRF-Token/i);

    const cookies = getSetCookies(loginResponse);
    const sessionCookie = cookies.find((cookie) => cookie.startsWith("invest_hub_session="));
    const csrfCookie = cookies.find((cookie) => cookie.startsWith("invest_hub_csrf="));
    assert.ok(sessionCookie);
    assert.ok(csrfCookie);
    assert.match(sessionCookie, /HttpOnly/i);
    assert.match(sessionCookie, /Secure/i);
    assert.match(sessionCookie, /SameSite=None/i);
    assert.match(csrfCookie, /Secure/i);
    assert.match(csrfCookie, /SameSite=None/i);

    const cookieHeader = buildCookieHeader(loginResponse);
    const csrfToken = loginResponse.headers.get("x-csrf-token");
    assert.ok(csrfToken);

    const meResponse = await fetch(`${baseUrl}/api/auth/me`, {
      headers: {
        Origin: allowedOrigin,
        Cookie: cookieHeader
      }
    });
    assert.equal(meResponse.status, 200);
    assert.ok(meResponse.headers.get("x-csrf-token"));

    const settingsResponse = await fetch(`${baseUrl}/api/settings`, {
      headers: {
        Origin: allowedOrigin,
        Cookie: cookieHeader
      }
    });
    assert.equal(settingsResponse.status, 200);

    const preflightResponse = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "OPTIONS",
      headers: {
        Origin: allowedOrigin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "x-csrf-token"
      }
    });
    assert.equal(preflightResponse.status, 204);
    assert.equal(preflightResponse.headers.get("access-control-allow-origin"), allowedOrigin);
    assert.equal(preflightResponse.headers.get("access-control-allow-credentials"), "true");

    const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: {
        Origin: allowedOrigin,
        Cookie: cookieHeader,
        "X-CSRF-Token": csrfToken ?? ""
      }
    });
    assert.equal(logoutResponse.status, 200);

    const afterLogoutResponse = await fetch(`${baseUrl}/api/auth/me`, {
      headers: {
        Origin: allowedOrigin,
        Cookie: cookieHeader
      }
    });
    assert.equal(afterLogoutResponse.status, 401);
  } finally {
    await closeServer(server);
  }
});

test("cross-site auth rejects unsafe requests without the CSRF header", async () => {
  const server = await listenForTest();

  try {
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;
    const email = `cross-site-csrf-${randomUUID()}@example.com`;
    await createBootstrapAdmin({ email, password });

    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        Origin: allowedOrigin,
        "content-type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    const cookieHeader = buildCookieHeader(loginResponse);
    const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: {
        Origin: allowedOrigin,
        Cookie: cookieHeader
      }
    });

    assert.equal(logoutResponse.status, 403);
    const payload = await logoutResponse.json() as { error?: { message?: string } };
    assert.equal(payload.error?.message, "CSRF token invalido.");
  } finally {
    await closeServer(server);
  }
});

test("CORS rejects a non-whitelisted origin for auth preflight", async () => {
  const server = await listenForTest();

  try {
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "OPTIONS",
      headers: {
        Origin: disallowedOrigin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type"
      }
    });

    assert.equal(response.status, 403);
    const payload = await response.json() as { error?: { message?: string } };
    assert.equal(payload.error?.message, `CORS origin not allowed: ${disallowedOrigin}`);
  } finally {
    await closeServer(server);
  }
});
