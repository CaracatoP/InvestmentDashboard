import { Schema, model, models, InferSchemaType } from "mongoose";

const priceHistorySchema = new Schema(
  {
    ticker: { type: String, required: true, uppercase: true, trim: true, index: true },
    price: { type: Number, required: true, min: 0 },
    capturedAt: { type: Date, required: true, index: true },
    source: { type: String, required: true, trim: true }
  },
  { timestamps: true }
);

priceHistorySchema.index({ ticker: 1, capturedAt: 1, source: 1 }, { unique: true });

export type PriceHistoryDocument = InferSchemaType<typeof priceHistorySchema>;
export const PriceHistoryModel = models.PriceHistory ?? model("PriceHistory", priceHistorySchema);
