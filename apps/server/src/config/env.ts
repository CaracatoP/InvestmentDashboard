import dotenv from "dotenv";

dotenv.config();

export function parsePort(value: string | undefined, fallback = 4000) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 ? port : fallback;
}

export function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function parseNumber(value: string | undefined, fallback: number) {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseList(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseSameSite(value: string | undefined): "strict" | "lax" | "none" {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "strict" || normalized === "lax" || normalized === "none") return normalized;
  return "lax";
}

export function parseHour(value: string | undefined, fallback: number) {
  if (value === undefined || value.trim() === "") return fallback;

  const normalized = value.trim();
  const direct = Number(normalized);
  if (Number.isInteger(direct) && direct >= 0 && direct <= 23) return direct;

  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return fallback;

  const hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;

  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return fallback;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return fallback;

  return hour;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parsePort(process.env.PORT),
  frontendUrl: process.env.FRONTEND_URL ?? process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  frontendUrls: parseList(process.env.FRONTEND_URLS),
  mongodbUri: process.env.MONGODB_URI,
  marketDataProvider: process.env.MARKET_DATA_PROVIDER ?? "",
  marketDataApiKey: process.env.MARKET_DATA_API_KEY ?? "",
  coingeckoApiKey: process.env.COINGECKO_API_KEY ?? "",
  coingeckoApiBaseUrl: process.env.COINGECKO_API_BASE_URL ?? "https://api.coingecko.com/api/v3",
  coingeckoPriceCacheTtlSeconds: parseNumber(process.env.COINGECKO_PRICE_CACHE_TTL_SECONDS, 60),
  marketTimezone: process.env.MARKET_TIMEZONE ?? "America/Sao_Paulo",
  marketRefreshHours: parseList(process.env.MARKET_REFRESH_HOURS ?? "10:00,12:00,14:00,17:00"),
  marketHistoryCacheTtlMinutes: parseNumber(process.env.MARKET_HISTORY_CACHE_TTL_MINUTES, -1),
  cdiProvider: (process.env.CDI_PROVIDER ?? "bcb").trim().toLowerCase(),
  cdiRateFallback: parseNumber(process.env.CDI_RATE_FALLBACK, 10.65),
  cdiTimezone: process.env.CDI_TIMEZONE ?? "America/Sao_Paulo",
  cdiUpdateHour: parseHour(process.env.CDI_UPDATE_HOUR, 8),
  enableSchedulers: parseBoolean(process.env.ENABLE_SCHEDULERS, true),
  aiEnabled: parseBoolean(process.env.AI_ENABLED, true),
  aiProvider: (process.env.AI_PROVIDER ?? "disabled").trim().toLowerCase(),
  groqApiKey: process.env.GROQ_API_KEY ?? "",
  groqModel: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
  groqTimeoutMs: parseNumber(process.env.GROQ_TIMEOUT_MS, 120000),
  aiAnalysisCacheMinutes: parseNumber(process.env.AI_ANALYSIS_CACHE_MINUTES, 30),
  aiMaxRequestsPerHour: parseNumber(process.env.AI_MAX_REQUESTS_PER_HOUR, 20),
  aiChatMaxMessages: parseNumber(process.env.AI_CHAT_MAX_MESSAGES, 20),
  aiChatMaxContextTokens: parseNumber(process.env.AI_CHAT_MAX_CONTEXT_TOKENS, 12000),
  performanceLogs: parseBoolean(process.env.PERFORMANCE_LOGS, false),
  authSessionTtlDays: parseNumber(process.env.AUTH_SESSION_TTL_DAYS, 7),
  authPasswordSaltRounds: parseNumber(process.env.AUTH_PASSWORD_SALT_ROUNDS, 12),
  authCookieSecure: parseBoolean(process.env.AUTH_COOKIE_SECURE, (process.env.NODE_ENV ?? "development") === "production"),
  authCookieSameSite: parseSameSite(process.env.AUTH_COOKIE_SAMESITE),
  authApprovalTtlHours: parseNumber(process.env.AUTH_APPROVAL_TTL_HOURS, 72),
  authPasswordResetTtlMinutes: parseNumber(process.env.AUTH_PASSWORD_RESET_TTL_MINUTES, 30),
  bootstrapAdminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL ?? "",
  bootstrapAdminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "",
  adminApprovalEmail: process.env.ADMIN_APPROVAL_EMAIL ?? process.env.BOOTSTRAP_ADMIN_EMAIL ?? "",
  appPublicUrl: process.env.APP_PUBLIC_URL ?? process.env.FRONTEND_URL ?? "http://localhost:5173",
  apiPublicUrl: process.env.API_PUBLIC_URL ?? process.env.BACKEND_URL ?? `http://localhost:${parsePort(process.env.PORT)}`,
  emailProvider: (process.env.EMAIL_PROVIDER ?? "console").trim().toLowerCase(),
  emailFrom: process.env.EMAIL_FROM ?? "Invest Hub <no-reply@investhub.local>",
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: parsePort(process.env.SMTP_PORT, 587),
  smtpSecure: parseBoolean(process.env.SMTP_SECURE, false),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPassword: process.env.SMTP_PASSWORD ?? "",
  whatsappEnabled: parseBoolean(process.env.WHATSAPP_ENABLED, false),
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
  whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? "",
  whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? "",
  whatsappGraphApiVersion: process.env.WHATSAPP_GRAPH_API_VERSION ?? "v23.0",
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "",
  whatsappAppSecret: process.env.WHATSAPP_APP_SECRET ?? "",
  whatsappOfficialNumber: process.env.WHATSAPP_OFFICIAL_NUMBER ?? "",
  whatsappLinkTtlMinutes: parseNumber(process.env.WHATSAPP_LINK_TTL_MINUTES, 10)
};
