import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createBootstrapAdmin } from "../../services/auth.service";

const password = "SenhaForte123!";

function splitSetCookieHeader(header: string | null) {
  if (!header) return [];
  return header.split(/,(?=\s*invest_hub_)/).map((item) => item.trim());
}

function getSetCookies(response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  return headers.getSetCookie?.() ?? splitSetCookieHeader(response.headers.get("set-cookie"));
}

export async function loginForTest(baseUrl: string, email: string, inputPassword = password) {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: inputPassword })
  });

  assert.equal(loginResponse.status, 200);

  const cookieHeader = getSetCookies(loginResponse).map((cookie) => cookie.split(";")[0]).join("; ");
  assert.match(cookieHeader, /invest_hub_session=/);
  assert.match(cookieHeader, /invest_hub_csrf=/);

  const csrfToken = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith("invest_hub_csrf="))?.split("=")[1];
  assert.ok(csrfToken);

  return {
    cookieHeader,
    csrfToken,
    headers: {
      Cookie: cookieHeader,
      "X-CSRF-Token": csrfToken
    } satisfies HeadersInit
  };
}

export async function createAuthenticatedRequestContext(baseUrl: string, prefix = "http-test") {
  const email = `${prefix}-${randomUUID()}@example.com`;
  const bootstrap = await createBootstrapAdmin({ email, password });
  const auth = await loginForTest(baseUrl, email, password);

  return {
    user: bootstrap.user,
    ...auth
  };
}

export const testPassword = password;
