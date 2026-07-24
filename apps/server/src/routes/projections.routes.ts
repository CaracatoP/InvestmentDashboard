import { Router } from "express";
import { calculateProjectionController } from "../controllers/projections.controller";

export const projectionsRoutes = Router();

projectionsRoutes.post("/", calculateProjectionController);
