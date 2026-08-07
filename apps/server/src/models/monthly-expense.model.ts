import { Schema, model, models, InferSchemaType } from "mongoose";

const monthlyExpenseIntegrationSchema = new Schema(
  {
    destination: { type: String, enum: ["asset", "cashbox"], required: true },
    linkedEntityType: { type: String, enum: ["operation", "cashBoxMovement", null], default: null },
    linkedEntityId: { type: String, default: null },
    assetId: { type: Schema.Types.ObjectId, ref: "Asset", default: null, index: true },
    assetTicker: { type: String, uppercase: true, trim: true, default: null, index: true },
    cashBoxId: { type: Schema.Types.ObjectId, ref: "CashBox", default: null, index: true },
    operationType: { type: String, enum: ["COMPRA", "VENDA", "BONIFICACAO", "DESDOBRAMENTO", "GRUPAMENTO", null], default: null },
    quantity: { type: Number, default: null, min: 0 },
    price: { type: Number, default: null, min: 0 },
    fees: { type: Number, default: null, min: 0 },
    integrationId: { type: String, default: null },
    idempotencyKey: { type: String, default: null }
  },
  { _id: false }
);

const monthlyExpenseSchema = new Schema(
  {
    planId: { type: String, required: true, index: true },
    categoryId: { type: String, required: true, index: true },
    description: { type: String, required: true, trim: true },
    amountInCents: { type: Number, required: true, min: 1 },
    date: { type: String, required: true, index: true },
    time: { type: String, required: true },
    note: { type: String, default: "" },
    paymentMethod: { type: String, default: null },
    expenseType: { type: String, enum: ["single", "recurring"], default: "single" },
    recurring: { type: Boolean, default: false },
    recurrenceId: { type: String, default: null, index: true },
    recurrenceSourceId: { type: String, default: null, index: true },
    recurrenceFrequency: { type: String, enum: ["weekly", "biweekly", "monthly", "annual", "custom", null], default: null },
    recurrenceInterval: { type: Number, default: null, min: 1 },
    recurrenceDayOfMonth: { type: Number, default: null, min: 1, max: 31 },
    recurrenceStartDate: { type: String, default: null },
    recurrenceEndDate: { type: String, default: null },
    recurrenceOriginalDate: { type: String, default: null },
    recurrenceCancelled: { type: Boolean, default: false },
    status: { type: String, enum: ["completed", "planned"], required: true, index: true },
    allocationKind: { type: String, enum: ["expense", "investment_contribution", "cash_box_contribution"], default: "expense", index: true },
    integration: { type: monthlyExpenseIntegrationSchema, default: null },
    completedAt: { type: String, default: null },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true }
  },
  { versionKey: false }
);

monthlyExpenseSchema.index({ planId: 1, date: -1, time: -1 });
monthlyExpenseSchema.index({ planId: 1, recurrenceId: 1, recurrenceOriginalDate: 1 });
monthlyExpenseSchema.index({ "integration.idempotencyKey": 1 }, { sparse: true });
monthlyExpenseSchema.index({ "integration.integrationId": 1 }, { sparse: true });
monthlyExpenseSchema.index({ "integration.linkedEntityType": 1, "integration.linkedEntityId": 1 }, { sparse: true });

export type MonthlyExpenseDocument = InferSchemaType<typeof monthlyExpenseSchema>;
export const MonthlyExpenseModel = models.MonthlyExpense ?? model("MonthlyExpense", monthlyExpenseSchema);
