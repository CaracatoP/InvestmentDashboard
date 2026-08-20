import { Schema, model, models, InferSchemaType } from "mongoose";

const dividendSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    assetId: { type: Schema.Types.ObjectId, ref: "Asset", index: true },
    assetTicker: { type: String, uppercase: true, trim: true, index: true },
    category: { type: String, default: "", trim: true },
    type: { type: String, default: "dividendo", trim: true, index: true },
    totalValue: { type: Number, required: true, min: 0 },
    valuePerShare: { type: Number, default: 0, min: 0 },
    amountPerShare: { type: Number, default: 0, min: 0 },
    quantityEligible: { type: Number, default: 0, min: 0 },
    grossAmount: { type: Number, default: 0, min: 0 },
    netAmount: { type: Number, default: 0, min: 0 },
    baseDate: { type: Date },
    exDate: { type: Date },
    paymentDate: { type: Date, required: true, index: true },
    receivedAt: { type: Date, default: null, index: true },
    referenceMonth: { type: String, default: "", trim: true, index: true },
    status: { type: String, enum: ["announced", "expected", "received", "cancelled"], default: "received", index: true },
    source: { type: String, default: "manual", trim: true },
    notes: { type: String, default: "" }
  },
  { timestamps: true }
);

dividendSchema.index(
  { userId: 1, assetId: 1, assetTicker: 1, paymentDate: 1, type: 1, amountPerShare: 1, source: 1 },
  { unique: true, partialFilterExpression: { status: { $ne: "cancelled" } } }
);
dividendSchema.index({ userId: 1, status: 1, paymentDate: -1 });
dividendSchema.index({ userId: 1, status: 1, receivedAt: -1 });
dividendSchema.index({ userId: 1, assetTicker: 1, paymentDate: -1 });
dividendSchema.index({ userId: 1, assetId: 1, paymentDate: -1 });

export type DividendDocument = InferSchemaType<typeof dividendSchema>;
export const DividendModel = models.Dividend ?? model("Dividend", dividendSchema);
