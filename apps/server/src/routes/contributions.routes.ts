import { Router } from "express";
import { createContribution, deleteContributionRecord, listContributions, showContribution, updateContributionRecord } from "../controllers/contributions.controller";

export const contributionsRoutes = Router();

contributionsRoutes.get("/", listContributions);
contributionsRoutes.get("/:id", showContribution);
contributionsRoutes.post("/", createContribution);
contributionsRoutes.put("/:id", updateContributionRecord);
contributionsRoutes.delete("/:id", deleteContributionRecord);
