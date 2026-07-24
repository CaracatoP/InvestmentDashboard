import dotenv from "dotenv";

dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  mongodbUri: process.env.MONGODB_URI,
  marketDataProvider: process.env.MARKET_DATA_PROVIDER ?? "",
  marketDataApiKey: process.env.MARKET_DATA_API_KEY ?? "",
  marketTimezone: process.env.MARKET_TIMEZONE ?? "America/Sao_Paulo",
  marketRefreshHours: (process.env.MARKET_REFRESH_HOURS ?? "10:00,12:00,14:00,17:00")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  cdiProvider: process.env.CDI_PROVIDER ?? "fallback",
  cdiRateFallback: Number(process.env.CDI_RATE_FALLBACK ?? 10.65),
  cdiTimezone: process.env.CDI_TIMEZONE ?? "America/Sao_Paulo",
  cdiUpdateHour: process.env.CDI_UPDATE_HOUR ?? "18:00"
};
