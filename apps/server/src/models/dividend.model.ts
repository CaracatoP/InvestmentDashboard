import { Schema, model, models, InferSchemaType } from "mongoose";

const dividendSchema = new Schema(
  {
    assetId: { type: Schema.Types.ObjectId, ref: "Asset", index: true },
    assetTicker: { type: String, uppercase: true, trim: true, index: true },
    totalValue: { type: Number, required: true, min: 0 },
    valuePerShare: { type: Number, default: 0, min: 0 },
    baseDate: { type: Date },
    paymentDate: { type: Date, required: true, index: true }
  },
  { timestamps: true }
);

export type DividendDocument = InferSchemaType<typeof dividendSchema>;
export const DividendModel = models.Dividend ?? model("Dividend", dividendSchema);
