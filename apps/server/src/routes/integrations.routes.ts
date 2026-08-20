import { Router } from "express";
import {
  cancelWhatsAppIntegrationLink,
  createWhatsAppIntegrationLink,
  disconnectWhatsAppIntegrationLink,
  showWhatsAppIntegration
} from "../controllers/integrations.controller";

export const integrationsRoutes = Router();

integrationsRoutes.get("/whatsapp", showWhatsAppIntegration);
integrationsRoutes.post("/whatsapp/link", createWhatsAppIntegrationLink);
integrationsRoutes.delete("/whatsapp/link", cancelWhatsAppIntegrationLink);
integrationsRoutes.delete("/whatsapp", disconnectWhatsAppIntegrationLink);
