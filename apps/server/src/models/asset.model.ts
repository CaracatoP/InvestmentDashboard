import { Schema, model, models, InferSchemaType } from "mongoose";

const assetSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    ticker: { type: String, required: true, uppercase: true, trim: true, index: true },
    category: { type: String, enum: ["FII", "ACAO", "ETF", "CRIPTO", "RENDA_FIXA"], required: true, index: true },
    coingeckoId: { type: String, default: "", trim: true, lowercase: true },
    subcategory: { type: String, default: "", trim: true },
    sector: { type: String, default: "", trim: true },
    currency: { type: String, default: "BRL", trim: true },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

assetSchema.index({ userId: 1, ticker: 1 }, { unique: true });
assetSchema.index({ userId: 1, active: 1, ticker: 1 });

export type AssetDocument = InferSchemaType<typeof assetSchema>;
export const AssetModel = models.Asset ?? model("Asset", assetSchema);
