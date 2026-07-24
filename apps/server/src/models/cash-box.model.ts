import { Schema, model, models, InferSchemaType } from "mongoose";

const cashBoxMovementSchema = new Schema(
  {
    type: { type: String, enum: ["DEPOSITO", "RESGATE", "RENDIMENTO"], required: true },
    value: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true },
    description: { type: String, default: "" }
  },
  { _id: true }
);

const cashBoxSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true },
    currentBalance: { type: Number, required: true, min: 0 },
    cdiPercentage: { type: Number, required: true, min: 0 },
    createdAt: { type: Date, required: true, default: Date.now },
    active: { type: Boolean, default: true },
    movements: { type: [cashBoxMovementSchema], default: [] }
  },
  { timestamps: true }
);

export type CashBoxDocument = InferSchemaType<typeof cashBoxSchema>;
export const CashBoxModel = models.CashBox ?? model("CashBox", cashBoxSchema);
