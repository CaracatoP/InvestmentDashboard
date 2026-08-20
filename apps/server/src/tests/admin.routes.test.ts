import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { app } from "../app";
import { approveUserByAdmin, createBootstrapAdmin, listUsers, registerUser } from "../services/auth.service";
import { createAuthenticatedRequestContext, loginForTest, testPassword } from "./helpers/authenticated-request";

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

test("admin routes require an authenticated admin role", async () => {
  const server = await listenForTest();

  try {
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;
    const adminAuth = await createAuthenticatedRequestContext(baseUrl, "admin-route-admin");
    const userEmail = `admin-route-user-${randomUUID()}@example.com`;

    await registerUser({ name: "Usuario Comum", email: userEmail, password: testPassword });
    const target = (await listUsers()).find((user) => user.email === userEmail);
    assert.ok(target);
    await approveUserByAdmin(target.id, adminAuth.user.id);

    const userAuth = await loginForTest(baseUrl, userEmail, testPassword);
    const forbiddenResponse = await fetch(`${baseUrl}/api/admin/users`, { headers: { Cookie: userAuth.cookieHeader } });
    const adminResponse = await fetch(`${baseUrl}/api/admin/users`, { headers: { Cookie: adminAuth.cookieHeader } });

    assert.equal(forbiddenResponse.status, 403);
    assert.equal(adminResponse.status, 200);
  } finally {
    await closeServer(server);
  }
});

test("auth me returns the current session user and logout revokes access", async () => {
  const server = await listenForTest();

  try {
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;
    const auth = await createAuthenticatedRequestContext(baseUrl, "auth-me");

    const meResponse = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: auth.cookieHeader } });
    const mePayload = (await meResponse.json()) as { success?: boolean; data?: { user?: { id?: string; email?: string; passwordHash?: string } } };
    assert.equal(meResponse.status, 200);
    assert.equal(mePayload.success, true);
    assert.equal(mePayload.data?.user?.id, auth.user.id);
    assert.equal(mePayload.data?.user?.email, auth.user.email);
    assert.equal(mePayload.data?.user?.passwordHash, undefined);

    const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST", headers: auth.headers });
    assert.equal(logoutResponse.status, 200);

    const afterLogoutResponse = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: auth.cookieHeader } });
    assert.equal(afterLogoutResponse.status, 401);
  } finally {
    await closeServer(server);
  }
});
