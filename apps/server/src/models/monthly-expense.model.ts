import { Schema, model, models, InferSchemaType } from "mongoose";

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
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true }
  },
  { versionKey: false }
);

monthlyExpenseSchema.index({ planId: 1, date: -1, time: -1 });

export type MonthlyExpenseDocument = InferSchemaType<typeof monthlyExpenseSchema>;
export const MonthlyExpenseModel = models.MonthlyExpense ?? model("MonthlyExpense", monthlyExpenseSchema);
