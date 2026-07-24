import { Router } from "express";
import { getCdiStatusRecord, refreshCdiRecord } from "../controllers/cdi.controller";

export const cdiRoutes = Router();

cdiRoutes.get("/status", getCdiStatusRecord);
cdiRoutes.post("/refresh", refreshCdiRecord);
