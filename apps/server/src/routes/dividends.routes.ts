import { Router } from "express";
import { createDividendRecord, deleteDividendRecord, listDividends, receiveDividendRecord, showDividendRecord, updateDividendRecord } from "../controllers/dividends.controller";

export const dividendsRoutes = Router();

dividendsRoutes.get("/", listDividends);
dividendsRoutes.post("/", createDividendRecord);
dividendsRoutes.post("/:id/receive", receiveDividendRecord);
dividendsRoutes.get("/:id", showDividendRecord);
dividendsRoutes.put("/:id", updateDividendRecord);
dividendsRoutes.delete("/:id", deleteDividendRecord);
