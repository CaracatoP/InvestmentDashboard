import { AsyncLocalStorage } from "node:async_hooks";

export type AuthRole = "admin" | "user";
export type AuthChannel = "web" | "whatsapp" | "system" | "admin";

export interface AuthContext {
  userId: string;
  role: AuthRole;
  email?: string;
  channel: AuthChannel;
  sessionId?: string;
}

export const SYSTEM_USER_ID = "__system__";

const authContextStorage = new AsyncLocalStorage<AuthContext>();

export function runWithAuthContext<T>(context: AuthContext, callback: () => T): T {
  return authContextStorage.run(context, callback);
}

export function getAuthContext() {
  return authContextStorage.getStore() ?? null;
}

export function getCurrentUserId(fallback = SYSTEM_USER_ID) {
  return getAuthContext()?.userId ?? fallback;
}

export function getCurrentChannel(fallback: AuthChannel = "system") {
  return getAuthContext()?.channel ?? fallback;
}

export function isCurrentUserAdmin() {
  return getAuthContext()?.role === "admin";
}
