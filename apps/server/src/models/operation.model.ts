import { Schema, model, models, InferSchemaType } from "mongoose";

const operationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
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
    notes: { type: String, default: "" },
    origin: { type: String, enum: ["manual", "monthly-planning"], default: "manual", index: true },
    planningLink: {
      expenseId: { type: String, default: null, index: true },
      planId: { type: String, default: null },
      integrationId: { type: String, default: null, index: true },
      idempotencyKey: { type: String, default: null }
    }
  },
  { timestamps: true }
);

operationSchema.index({ userId: 1, type: 1, date: -1 });
operationSchema.index({ userId: 1, assetTicker: 1, date: -1 });
operationSchema.index({ userId: 1, assetId: 1, date: -1 });
operationSchema.index({ userId: 1, "planningLink.idempotencyKey": 1 }, { sparse: true });

export type OperationDocument = InferSchemaType<typeof operationSchema>;
export const OperationModel = models.Operation ?? model("Operation", operationSchema);
