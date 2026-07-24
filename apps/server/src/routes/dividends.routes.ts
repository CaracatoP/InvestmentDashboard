import { Router } from "express";
import { createDividendRecord, deleteDividendRecord, listDividends, showDividendRecord, updateDividendRecord } from "../controllers/dividends.controller";

export const dividendsRoutes = Router();

dividendsRoutes.get("/", listDividends);
dividendsRoutes.get("/:id", showDividendRecord);
dividendsRoutes.post("/", createDividendRecord);
dividendsRoutes.put("/:id", updateDividendRecord);
dividendsRoutes.delete("/:id", deleteDividendRecord);
