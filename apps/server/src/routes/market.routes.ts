import { Router } from "express";
import { refreshMarket, showCryptoQuote, showMarketStatus } from "../controllers/market.controller";

export const marketRoutes = Router();

marketRoutes.get("/status", showMarketStatus);
marketRoutes.get("/crypto/quote", showCryptoQuote);
marketRoutes.post("/refresh", refreshMarket);
