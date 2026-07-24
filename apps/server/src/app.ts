import cors from "cors";
import express from "express";
import morgan from "morgan";
import { createCorsOptions } from "./config/cors";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middlewares/error-handler";
import { apiRoutes } from "./routes";
import { healthRoutes } from "./routes/health.routes";

export const app = express();

app.use(cors(createCorsOptions()));
app.use(express.json());
app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

app.use("/health", healthRoutes);

app.use("/api", apiRoutes);
app.use(notFoundHandler);
app.use(errorHandler);
