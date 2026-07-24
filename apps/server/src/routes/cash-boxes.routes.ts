import { Router } from "express";
import {
  createCashBoxContributionRecord,
  createCashBoxRecord,
  createCashBoxWithdrawalRecord,
  deleteCashBoxRecord,
  listCashBoxMovementRecords,
  listCashBoxRecords,
  listCashBoxYieldRecords,
  recalculateCashBoxRecords,
  showCashBoxRecord,
  updateCashBoxRecord
} from "../controllers/cash-boxes.controller";

export const cashBoxesRoutes = Router();

cashBoxesRoutes.get("/", listCashBoxRecords);
cashBoxesRoutes.post("/recalculate", recalculateCashBoxRecords);
cashBoxesRoutes.get("/:id", showCashBoxRecord);
cashBoxesRoutes.get("/:id/yields", listCashBoxYieldRecords);
cashBoxesRoutes.get("/:id/movements", listCashBoxMovementRecords);
cashBoxesRoutes.post("/:id/contributions", createCashBoxContributionRecord);
cashBoxesRoutes.post("/:id/withdrawals", createCashBoxWithdrawalRecord);
cashBoxesRoutes.post("/", createCashBoxRecord);
cashBoxesRoutes.put("/:id", updateCashBoxRecord);
cashBoxesRoutes.patch("/:id", updateCashBoxRecord);
cashBoxesRoutes.delete("/:id", deleteCashBoxRecord);
