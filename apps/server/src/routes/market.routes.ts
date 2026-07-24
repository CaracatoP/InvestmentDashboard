import { Router } from "express";
import { refreshMarket, showMarketStatus } from "../controllers/market.controller";

export const marketRoutes = Router();

marketRoutes.get("/status", showMarketStatus);
marketRoutes.post("/refresh", refreshMarket);
