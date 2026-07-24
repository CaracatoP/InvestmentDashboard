import { Router } from "express";
import { createGoal, deleteGoalRecord, listGoals, showGoal, updateGoalRecord } from "../controllers/goals.controller";

export const goalsRoutes = Router();

goalsRoutes.get("/", listGoals);
goalsRoutes.get("/:id", showGoal);
goalsRoutes.post("/", createGoal);
goalsRoutes.put("/:id", updateGoalRecord);
goalsRoutes.delete("/:id", deleteGoalRecord);
