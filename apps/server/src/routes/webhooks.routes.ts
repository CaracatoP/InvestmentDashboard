import { Router } from "express";
import { getWhatsAppWebhook, postWhatsAppWebhook } from "../controllers/webhooks.controller";
import { rateLimit } from "../middlewares/rate-limit";

export const webhooksRoutes = Router();

const webhookLimiter = rateLimit({ keyPrefix: "webhooks", windowMs: 60 * 1000, max: 120 });

webhooksRoutes.get("/whatsapp", webhookLimiter, getWhatsAppWebhook);
webhooksRoutes.post("/whatsapp", webhookLimiter, postWhatsAppWebhook);
