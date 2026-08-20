import { Schema, model, models, InferSchemaType } from "mongoose";

const monthlyPlanCategorySchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    icon: { type: String, required: true, trim: true, default: "tag" },
    color: { type: String, required: true, trim: true, default: "#22c55e" },
    budgetType: { type: String, enum: ["percentage", "fixed"], required: true, default: "percentage" },
    percentage: { type: Number, default: 0, min: 0 },
    fixedAmountInCents: { type: Number, default: null, min: 0 }
  },
  { _id: false }
);

const monthlyFinancialGoalSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    targetInCents: { type: Number, required: true, min: 1 },
    savedInCents: { type: Number, default: 0, min: 0 },
    monthlyContributionInCents: { type: Number, default: 0, min: 0 },
    linkedSource: { type: String, enum: ["manual", "portfolio", "cashbox"], default: "manual" },
    linkedSourceId: { type: String, default: "" },
    active: { type: Boolean, default: true }
  },
  { _id: false }
);

const monthlyPlanSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    month: { type: Number, required: true, min: 1, max: 12, index: true },
    year: { type: Number, required: true, min: 1970, max: 2200, index: true },
    incomeInCents: { type: Number, required: true, min: 0, default: 0 },
    categories: { type: [monthlyPlanCategorySchema], default: [] },
    monthlyContributionGoalInCents: { type: Number, default: 0, min: 0 },
    includeDividendsAsIncome: { type: Boolean, default: false },
    investmentSimulationAmountInCents: { type: Number, default: 0, min: 0 },
    goals: { type: [monthlyFinancialGoalSchema], default: [] },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true }
  },
  { versionKey: false }
);

monthlyPlanSchema.index({ userId: 1, year: 1, month: 1 }, { unique: true });

export type MonthlyPlanDocument = InferSchemaType<typeof monthlyPlanSchema>;
export const MonthlyPlanModel = models.MonthlyPlan ?? model("MonthlyPlan", monthlyPlanSchema);
