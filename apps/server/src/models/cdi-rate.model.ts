import { Schema, model, models, InferSchemaType } from "mongoose";

const cdiRateSchema = new Schema(
  {
    annualCdiRate: { type: Number, required: true, min: 0 },
    dailyCdiRate: { type: Number, required: true, min: 0 },
    referenceDate: { type: String, required: true, trim: true, unique: true },
    source: { type: String, required: true, trim: true },
    fallbackReason: { type: String, default: null },
    fetchedAt: { type: Date, required: true, default: Date.now }
  },
  { timestamps: true }
);

export type CdiRateDocument = InferSchemaType<typeof cdiRateSchema>;
export const CdiRateModel = models.CdiRate ?? model("CdiRate", cdiRateSchema);
