import { Schema, model, models, InferSchemaType } from "mongoose";

const monthlyIncomeEntrySchema = new Schema(
  {
    planId: { type: String, required: true, index: true },
    description: { type: String, required: true, trim: true },
    amountInCents: { type: Number, required: true, min: 1 },
    category: { type: String, required: true, trim: true, index: true },
    date: { type: String, required: true, index: true },
    time: { type: String, required: true },
    status: { type: String, enum: ["received", "planned", "cancelled"], required: true, index: true },
    incomeType: { type: String, enum: ["single", "recurring"], default: "single" },
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
    receivedAt: { type: String, default: null },
    note: { type: String, default: "" },
    sourceType: { type: String, default: "manual", index: true },
    sourceId: { type: String, default: null, index: true },
    idempotencyKey: { type: String, default: null },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true }
  },
  { versionKey: false }
);

monthlyIncomeEntrySchema.index({ planId: 1, date: -1, time: -1 });
monthlyIncomeEntrySchema.index({ planId: 1, recurrenceId: 1, recurrenceOriginalDate: 1 });
monthlyIncomeEntrySchema.index({ sourceType: 1, sourceId: 1 }, { sparse: true });
monthlyIncomeEntrySchema.index({ idempotencyKey: 1 }, { sparse: true });

export type MonthlyIncomeEntryDocument = InferSchemaType<typeof monthlyIncomeEntrySchema>;
export const MonthlyIncomeEntryModel = models.MonthlyIncomeEntry ?? model("MonthlyIncomeEntry", monthlyIncomeEntrySchema);
