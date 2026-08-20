import { Schema, model, models, InferSchemaType } from "mongoose";

const cashBoxMovementSchema = new Schema(
  {
    id: { type: String, default: null, index: true },
    type: {
      type: String,
      enum: ["DEPOSITO", "RESGATE", "RENDIMENTO", "contribution", "withdrawal", "yield", "adjustment"],
      required: true
    },
    value: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true },
    description: { type: String, default: "" },
    origin: { type: String, enum: ["manual", "monthly-planning"], default: "manual" },
    planningLink: {
      expenseId: { type: String, default: null },
      planId: { type: String, default: null },
      integrationId: { type: String, default: null },
      idempotencyKey: { type: String, default: null }
    }
  },
  { _id: true }
);

const cashBoxSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    categoryId: { type: String, default: "cash", trim: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true },
    initialBalance: { type: Number, default: 0, min: 0 },
    currentBalance: { type: Number, required: true, min: 0 },
    totalContributions: { type: Number, default: 0, min: 0 },
    totalWithdrawals: { type: Number, default: 0, min: 0 },
    totalYield: { type: Number, default: 0, min: 0 },
    cdiPercentage: { type: Number, required: true, min: 0 },
    annualRateOverride: { type: Number, min: 0 },
    lastYieldCalculationAt: { type: Date },
    createdAt: { type: Date, required: true, default: Date.now },
    active: { type: Boolean, default: true },
    movements: { type: [cashBoxMovementSchema], default: [] }
  },
  { timestamps: true }
);

cashBoxSchema.index({ userId: 1, active: 1, name: 1 });

export type CashBoxDocument = InferSchemaType<typeof cashBoxSchema>;
export const CashBoxModel = models.CashBox ?? model("CashBox", cashBoxSchema);
