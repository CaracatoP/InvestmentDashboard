import { Schema, model, models, InferSchemaType } from "mongoose";

const marketQuoteSchema = new Schema(
  {
    assetKey: { type: String, required: true, trim: true, unique: true, index: true },
    ticker: { type: String, required: true, uppercase: true, trim: true, index: true },
    price: { type: Number, min: 0, default: null },
    quotedAt: { type: Date, required: true, index: true },
    source: { type: String, required: true, trim: true },
    currency: { type: String, default: "BRL", trim: true },
    status: { type: String, enum: ["success", "failed", "updated", "stale", "unavailable", "unsupported", "error"], required: true },
    errorMessage: { type: String, default: "" },
    providerSymbol: { type: String, default: "", trim: true },
    market: { type: String, default: "", trim: true },
    assetKind: { type: String, default: "", trim: true },
    change24h: { type: Number, default: undefined },
    marketCap: { type: Number, min: 0, default: undefined },
    volume24h: { type: Number, min: 0, default: undefined },
    displayName: { type: String, default: "", trim: true }
  },
  { timestamps: true }
);

export type MarketQuoteDocument = InferSchemaType<typeof marketQuoteSchema>;
export const MarketQuoteModel = models.MarketQuote ?? model("MarketQuote", marketQuoteSchema);
