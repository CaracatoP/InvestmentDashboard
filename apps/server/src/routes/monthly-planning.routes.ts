import { Router } from "express";
import {
  completeMonthlyPlanningExpense,
  copyPreviousPlanning,
  createMonthlyPlanningIncomeEntry,
  createMonthlyPlanningExpense,
  deleteMonthlyPlanningIncomeEntry,
  deleteMonthlyPlanningExpense,
  receiveMonthlyPlanningIncomeEntry,
  updateMonthlyPlanningIncomeEntry,
  showMonthlyPlanning,
  updateMonthlyPlanningExpense,
  updateMonthlyPlanningPlan,
  upsertMonthlyPlanningPlan
} from "../controllers/monthly-planning.controller";

export const monthlyPlanningRoutes = Router();

monthlyPlanningRoutes.get("/", showMonthlyPlanning);
monthlyPlanningRoutes.post("/", upsertMonthlyPlanningPlan);
monthlyPlanningRoutes.put("/:id", updateMonthlyPlanningPlan);
monthlyPlanningRoutes.post("/copy-previous", copyPreviousPlanning);
monthlyPlanningRoutes.post("/:planId/expenses", createMonthlyPlanningExpense);
monthlyPlanningRoutes.post("/:planId/income-entries", createMonthlyPlanningIncomeEntry);
monthlyPlanningRoutes.patch("/expenses/:id/complete", completeMonthlyPlanningExpense);
monthlyPlanningRoutes.patch("/income-entries/:id/receive", receiveMonthlyPlanningIncomeEntry);
monthlyPlanningRoutes.put("/expenses/:id", updateMonthlyPlanningExpense);
monthlyPlanningRoutes.put("/income-entries/:id", updateMonthlyPlanningIncomeEntry);
monthlyPlanningRoutes.delete("/expenses/:id", deleteMonthlyPlanningExpense);
monthlyPlanningRoutes.delete("/income-entries/:id", deleteMonthlyPlanningIncomeEntry);
