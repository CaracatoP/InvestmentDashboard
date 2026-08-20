import {
  cancelWhatsAppPendingLink,
  createWhatsAppConnectionCode,
  disconnectWhatsAppIntegration,
  getWhatsAppIntegrationStatus
} from "../services/whatsapp-link.service";
import { ok } from "../utils/api-response";
import { asyncHandler } from "../utils/async-handler";
import { requireCurrentRequestAuth } from "../utils/request-auth";

export const showWhatsAppIntegration = asyncHandler(async (request, response) => {
  const auth = requireCurrentRequestAuth(request);
  ok(response, await getWhatsAppIntegrationStatus(auth.userId));
});

export const createWhatsAppIntegrationLink = asyncHandler(async (request, response) => {
  const auth = requireCurrentRequestAuth(request);
  ok(response, await createWhatsAppConnectionCode(auth.userId));
});

export const cancelWhatsAppIntegrationLink = asyncHandler(async (request, response) => {
  const auth = requireCurrentRequestAuth(request);
  ok(response, await cancelWhatsAppPendingLink(auth.userId));
});

export const disconnectWhatsAppIntegrationLink = asyncHandler(async (request, response) => {
  const auth = requireCurrentRequestAuth(request);
  ok(response, await disconnectWhatsAppIntegration(auth.userId));
});
