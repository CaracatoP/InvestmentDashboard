export type AuthRole = "admin" | "user";
export type UserStatus = "pending_approval" | "active" | "rejected" | "disabled";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: AuthRole;
  status: UserStatus;
  phoneNumber?: string;
  phoneNormalized?: string;
  whatsappLinkedAt?: string | null;
  timezone?: string;
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthMeResponse {
  user: AuthUser | null;
}

export interface AuthLoginInput {
  email: string;
  password: string;
}

export interface AuthRegisterInput {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface AuthMessageResponse {
  message: string;
  status?: string;
}

export interface WhatsAppIntegrationStatus {
  enabled: boolean;
  configured: boolean;
  officialNumber: string;
  connected: boolean;
  link: {
    id: string;
    status: "pending" | "verified" | "revoked";
    phoneNormalized: string;
    expiresAt: string;
    verifiedAt?: string | null;
    revokedAt?: string | null;
    createdAt?: string;
    updatedAt?: string;
  } | null;
}

export interface WhatsAppLinkCreated {
  code: string;
  expiresAt: string;
  link: NonNullable<WhatsAppIntegrationStatus["link"]>;
}
