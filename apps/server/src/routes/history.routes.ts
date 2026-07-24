import { Router } from "express";
import { listHistory } from "../controllers/history.controller";

export const historyRoutes = Router();

historyRoutes.get("/", listHistory);
