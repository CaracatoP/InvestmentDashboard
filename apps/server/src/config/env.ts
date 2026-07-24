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

export function parseList(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parsePort(process.env.PORT),
  frontendUrl: process.env.FRONTEND_URL ?? process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  frontendUrls: parseList(process.env.FRONTEND_URLS),
  mongodbUri: process.env.MONGODB_URI,
  marketDataProvider: process.env.MARKET_DATA_PROVIDER ?? "",
  marketDataApiKey: process.env.MARKET_DATA_API_KEY ?? "",
  marketTimezone: process.env.MARKET_TIMEZONE ?? "America/Sao_Paulo",
  marketRefreshHours: parseList(process.env.MARKET_REFRESH_HOURS ?? "10:00,12:00,14:00,17:00"),
  cdiProvider: process.env.CDI_PROVIDER ?? "fallback",
  cdiRateFallback: Number(process.env.CDI_RATE_FALLBACK ?? 10.65),
  cdiTimezone: process.env.CDI_TIMEZONE ?? "America/Sao_Paulo",
  cdiUpdateHour: process.env.CDI_UPDATE_HOUR ?? "18:00",
  enableSchedulers: parseBoolean(process.env.ENABLE_SCHEDULERS, true)
};
