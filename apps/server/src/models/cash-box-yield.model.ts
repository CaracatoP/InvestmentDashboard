import { Schema, model, models, InferSchemaType } from "mongoose";

const cashBoxYieldSchema = new Schema(
  {
    cashBoxId: { type: Schema.Types.ObjectId, ref: "CashBox", required: true },
    referenceDate: { type: String, required: true, trim: true },
    openingBalance: { type: Number, required: true, min: 0 },
    yieldValue: { type: Number, required: true, min: 0 },
    closingBalance: { type: Number, required: true, min: 0 },
    annualCdiRate: { type: Number, required: true, min: 0 },
    dailyCdiRate: { type: Number, required: true, min: 0 },
    cdiPercentage: { type: Number, required: true, min: 0 },
    source: { type: String, required: true, trim: true },
    calculatedAt: { type: Date, required: true, default: Date.now }
  },
  { timestamps: true }
);

cashBoxYieldSchema.index({ cashBoxId: 1, referenceDate: 1 }, { unique: true });

export type CashBoxYieldDocument = InferSchemaType<typeof cashBoxYieldSchema>;
export const CashBoxYieldModel = models.CashBoxYield ?? model("CashBoxYield", cashBoxYieldSchema);
