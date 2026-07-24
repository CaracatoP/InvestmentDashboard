import { Schema, model, models, InferSchemaType } from "mongoose";

const assetSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    ticker: { type: String, required: true, uppercase: true, trim: true, unique: true, index: true },
    category: { type: String, enum: ["FII", "ACAO", "ETF", "CRIPTO", "RENDA_FIXA"], required: true, index: true },
    subcategory: { type: String, default: "", trim: true },
    sector: { type: String, default: "", trim: true },
    currency: { type: String, default: "BRL", trim: true },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export type AssetDocument = InferSchemaType<typeof assetSchema>;
export const AssetModel = models.Asset ?? model("Asset", assetSchema);
