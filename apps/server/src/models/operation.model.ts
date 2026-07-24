import { Schema, model, models, InferSchemaType } from "mongoose";

const operationSchema = new Schema(
  {
    assetId: { type: Schema.Types.ObjectId, ref: "Asset", index: true },
    assetTicker: { type: String, uppercase: true, trim: true, index: true },
    type: {
      type: String,
      enum: ["COMPRA", "VENDA", "BONIFICACAO", "DESDOBRAMENTO", "GRUPAMENTO"],
      required: true
    },
    date: { type: Date, required: true, index: true },
    quantity: { type: Number, default: 0, min: 0 },
    price: { type: Number, default: 0, min: 0 },
    fees: { type: Number, default: 0, min: 0 },
    totalValue: { type: Number, required: true, min: 0 },
    notes: { type: String, default: "" }
  },
  { timestamps: true }
);

export type OperationDocument = InferSchemaType<typeof operationSchema>;
export const OperationModel = models.Operation ?? model("Operation", operationSchema);
