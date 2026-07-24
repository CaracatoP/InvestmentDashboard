import { Router } from "express";
import { createOperationRecord, deleteOperationRecord, listOperationRecords, showOperationRecord, updateOperationRecord } from "../controllers/operations.controller";

export const operationsRoutes = Router();

operationsRoutes.get("/", listOperationRecords);
operationsRoutes.get("/:id", showOperationRecord);
operationsRoutes.post("/", createOperationRecord);
operationsRoutes.put("/:id", updateOperationRecord);
operationsRoutes.delete("/:id", deleteOperationRecord);
