import { Router } from "express";
import {
  createSettingsRecord,
  deleteSettingsRecord,
  showSettings,
  showSettingsRecord,
  updateAllocationTargets,
  updateCurrentSettings,
  updateSettingsRecordController
} from "../controllers/settings.controller";

export const settingsRoutes = Router();

settingsRoutes.get("/", showSettings);
settingsRoutes.put("/", updateCurrentSettings);
settingsRoutes.put("/allocations", updateAllocationTargets);
settingsRoutes.get("/:id", showSettingsRecord);
settingsRoutes.post("/", createSettingsRecord);
settingsRoutes.put("/:id", updateSettingsRecordController);
settingsRoutes.delete("/:id", deleteSettingsRecord);
