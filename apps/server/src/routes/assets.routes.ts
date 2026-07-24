import { Router } from "express";
import { createAssetRecord, deleteAssetRecord, listAssetPortfolio, showAsset, updateAssetRecord } from "../controllers/assets.controller";

export const assetsRoutes = Router();

assetsRoutes.get("/", listAssetPortfolio);
assetsRoutes.get("/:id", showAsset);
assetsRoutes.post("/", createAssetRecord);
assetsRoutes.put("/:id", updateAssetRecord);
assetsRoutes.delete("/:id", deleteAssetRecord);
