import dns from "node:dns";
import mongoose from "mongoose";
import { env } from "./env";
import { redactSensitiveText } from "../utils/logging";

const forcedDnsServers = ["8.8.8.8", "1.1.1.1"];

export async function connectDatabase(): Promise<boolean> {
  if (!env.mongodbUri) {
    console.info("MongoDB URI not configured. API will use empty in-memory data.");
    return false;
  }

  try {
    dns.setServers(forcedDnsServers);
    await mongoose.connect(env.mongodbUri);
    console.info("MongoDB connected.");
    return true;
  } catch (error) {
    console.warn("MongoDB connection failed. API will use empty in-memory data.");
    const message = error instanceof Error ? error.message : "Unknown MongoDB connection error";
    console.warn(redactSensitiveText(message, [env.mongodbUri]));
    return false;
  }
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
