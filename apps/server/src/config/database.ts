import mongoose from "mongoose";
import { env } from "./env";

export async function connectDatabase(): Promise<boolean> {
  if (!env.mongodbUri) {
    console.info("MongoDB URI not configured. API will use empty in-memory data.");
    return false;
  }

  try {
    await mongoose.connect(env.mongodbUri);
    console.info("MongoDB connected.");
    return true;
  } catch (error) {
    console.warn("MongoDB connection failed. API will use empty in-memory data.");
    console.warn(error);
    return false;
  }
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
