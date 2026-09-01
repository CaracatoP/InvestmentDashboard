import { Router } from "express";
import {
  completeN8nMonthlyPlanningExpense,
  createN8nMonthlyPlanningExpense,
  createN8nMonthlyPlanningIncomeEntry,
  listN8nMonthlyPlanningRecentExpenses,
  receiveN8nMonthlyPlanningIncomeEntry,
  showN8nMonthlyPlanningSummary,
  showN8nUserByPhone,
  verifyN8nWhatsAppIntegrationLink
} from "../controllers/n8n-integration.controller";
import { requireN8nIntegrationSecret } from "../middlewares/n8n-integration-auth.middleware";

export const n8nIntegrationRoutes = Router();

n8nIntegrationRoutes.use(requireN8nIntegrationSecret);
n8nIntegrationRoutes.post("/whatsapp/link/verify", verifyN8nWhatsAppIntegrationLink);
n8nIntegrationRoutes.get("/users/by-phone", showN8nUserByPhone);
n8nIntegrationRoutes.get("/monthly-planning/summary", showN8nMonthlyPlanningSummary);
n8nIntegrationRoutes.get("/monthly-planning/expenses/recent", listN8nMonthlyPlanningRecentExpenses);
n8nIntegrationRoutes.post("/monthly-planning/expenses", createN8nMonthlyPlanningExpense);
n8nIntegrationRoutes.post("/monthly-planning/income-entries", createN8nMonthlyPlanningIncomeEntry);
n8nIntegrationRoutes.patch("/monthly-planning/expenses/:id/complete", completeN8nMonthlyPlanningExpense);
n8nIntegrationRoutes.patch("/monthly-planning/income-entries/:id/receive", receiveN8nMonthlyPlanningIncomeEntry);
n8nIntegrationRoutes.use((request, response) => {
  response.status(404).json({
    success: false,
    error: {
      message: `Rota n8n ${request.method} ${request.originalUrl} nao encontrada.`
    }
  });
});
