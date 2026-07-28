import { Router } from "express";
import { createAssetRecord, deleteAssetRecord, listAssetPortfolio, showAsset, showAssetPriceHistory, updateAssetRecord } from "../controllers/assets.controller";

export const assetsRoutes = Router();

assetsRoutes.get("/", listAssetPortfolio);
assetsRoutes.get("/:id/history", showAssetPriceHistory);
assetsRoutes.get("/:id/price-history", showAssetPriceHistory);
assetsRoutes.get("/:id", showAsset);
assetsRoutes.post("/", createAssetRecord);
assetsRoutes.put("/:id", updateAssetRecord);
assetsRoutes.delete("/:id", deleteAssetRecord);
