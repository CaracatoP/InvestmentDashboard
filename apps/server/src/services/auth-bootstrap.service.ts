import { isDatabaseConnected } from "../config/database";
import { env } from "../config/env";
import { createBootstrapAdmin, type SafeUser } from "./auth.service";

export async function bootstrapAuthenticationFoundation(): Promise<SafeUser | null> {
  if (!env.bootstrapAdminEmail || !env.bootstrapAdminPassword) {
    console.info("Bootstrap admin skipped. Configure BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD to create the initial admin.");
    return null;
  }

  const result = await createBootstrapAdmin({
    email: env.bootstrapAdminEmail,
    password: env.bootstrapAdminPassword
  });

  if (result.created) {
    console.info(`Bootstrap admin created for ${result.user.email}.`);
  } else {
    console.info(`Bootstrap admin already exists for ${result.user.email}. Password unchanged.`);
  }

  if (result.user.role !== "admin" || result.user.status !== "active") {
    console.warn("Bootstrap admin email exists but is not an active admin.");
    return null;
  }

  return result.user;
}
