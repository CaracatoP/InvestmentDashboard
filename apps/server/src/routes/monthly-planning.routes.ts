import { Router } from "express";
import {
  copyPreviousPlanning,
  createMonthlyPlanningExpense,
  deleteMonthlyPlanningExpense,
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
monthlyPlanningRoutes.put("/expenses/:id", updateMonthlyPlanningExpense);
monthlyPlanningRoutes.delete("/expenses/:id", deleteMonthlyPlanningExpense);
