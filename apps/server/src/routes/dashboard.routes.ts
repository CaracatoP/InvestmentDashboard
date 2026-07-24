import { Router } from "express";
import { showDashboard } from "../controllers/dashboard.controller";

export const dashboardRoutes = Router();

dashboardRoutes.get("/", showDashboard);
