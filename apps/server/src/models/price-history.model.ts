import { Schema, model, models, InferSchemaType } from "mongoose";

const priceHistorySchema = new Schema(
  {
    ticker: { type: String, required: true, uppercase: true, trim: true, index: true },
    price: { type: Number, required: true, min: 0 },
    capturedAt: { type: Date, required: true, index: true },
    source: { type: String, required: true, trim: true },
    open: { type: Number, min: 0, default: undefined },
    high: { type: Number, min: 0, default: undefined },
    low: { type: Number, min: 0, default: undefined },
    close: { type: Number, min: 0, default: undefined },
    volume: { type: Number, min: 0, default: undefined },
    currency: { type: String, default: "BRL", trim: true },
    providerSymbol: { type: String, default: "", trim: true },
    market: { type: String, default: "", trim: true },
    assetKind: { type: String, default: "", trim: true },
    type: { type: String, enum: ["market_history", "intraday_snapshot"], default: "intraday_snapshot", index: true },
    interval: { type: String, default: "snapshot", trim: true, index: true },
    granularity: { type: String, default: "snapshot", trim: true }
  },
  { timestamps: true }
);

priceHistorySchema.index({ ticker: 1, capturedAt: 1, source: 1 }, { unique: true });
priceHistorySchema.index({ ticker: 1, type: 1, interval: 1, capturedAt: 1 });

export type PriceHistoryDocument = InferSchemaType<typeof priceHistorySchema>;
export const PriceHistoryModel = models.PriceHistory ?? model("PriceHistory", priceHistorySchema);
