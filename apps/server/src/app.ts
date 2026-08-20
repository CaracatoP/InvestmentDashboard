import cors from "cors";
import express, { type Request } from "express";
import morgan from "morgan";
import { createCorsOptions } from "./config/cors";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middlewares/error-handler";
import { performanceLogger } from "./middlewares/performance-logger";
import { apiRoutes } from "./routes";
import { healthRoutes } from "./routes/health.routes";
import { webhooksRoutes } from "./routes/webhooks.routes";

export const app = express();

function redactUrl(url?: string) {
  return (url ?? "")
    .replace(/(\/auth\/approvals\/)[^/]+(\/(?:approve|reject))/g, "$1[redacted]$2")
    .replace(/([?&](?:token|approvalToken|resetToken)=)[^&]+/gi, "$1[redacted]");
}

morgan.token("safe-url", (request) => {
  const typedRequest = request as typeof request & { originalUrl?: string; url?: string };
  return redactUrl(typedRequest.originalUrl || typedRequest.url);
});

app.use(cors(createCorsOptions()));
app.use(express.json({
  verify: (request: Request, _response, buffer) => {
    request.rawBody = Buffer.from(buffer);
  }
}));
app.use(morgan(env.nodeEnv === "production" ? ":remote-addr - :remote-user [:date[clf]] \":method :safe-url HTTP/:http-version\" :status :res[content-length] \":referrer\" \":user-agent\"" : ":method :safe-url :status :response-time ms - :res[content-length]"));
app.use(performanceLogger);

app.use("/health", healthRoutes);
app.use("/webhooks", webhooksRoutes);

app.use("/api", apiRoutes);
app.use(notFoundHandler);
app.use(errorHandler);
