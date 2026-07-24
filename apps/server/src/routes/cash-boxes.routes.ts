import { Router } from "express";
import { createCashBoxRecord, deleteCashBoxRecord, listCashBoxRecords, showCashBoxRecord, updateCashBoxRecord } from "../controllers/cash-boxes.controller";

export const cashBoxesRoutes = Router();

cashBoxesRoutes.get("/", listCashBoxRecords);
cashBoxesRoutes.get("/:id", showCashBoxRecord);
cashBoxesRoutes.post("/", createCashBoxRecord);
cashBoxesRoutes.put("/:id", updateCashBoxRecord);
cashBoxesRoutes.delete("/:id", deleteCashBoxRecord);
