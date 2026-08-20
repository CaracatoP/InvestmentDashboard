import { InferSchemaType, Schema, model, models } from "mongoose";

const aiInsightSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    severity: { type: String, enum: ["info", "success", "warning", "danger"], default: "info" }
  },
  { _id: false }
);

const aiActionItemSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    priority: { type: String, enum: ["low", "medium", "high"], default: "medium" }
  },
  { _id: false }
);

const aiAnalysisResponseSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    summary: { type: String, required: true, trim: true },
    status: { type: String, enum: ["healthy", "attention", "critical", "insufficient_data"], default: "insufficient_data" },
    insights: { type: [aiInsightSchema], default: [] },
    risks: { type: [aiInsightSchema], default: [] },
    opportunities: { type: [aiInsightSchema], default: [] },
    actionItems: { type: [aiActionItemSchema], default: [] },
    disclaimer: { type: String, default: "" }
  },
  { _id: false }
);

const financialAiAnalysisSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    year: { type: Number, required: true, min: 1970, max: 2200, index: true },
    month: { type: Number, required: true, min: 1, max: 12, index: true },
    analysisType: { type: String, required: true, index: true },
    categoryId: { type: String, default: null, index: true },
    provider: { type: String, required: true },
    model: { type: String, required: true },
    contextHash: { type: String, required: true, index: true },
    response: { type: aiAnalysisResponseSchema, required: true },
    generatedAt: { type: Date, required: true },
    durationMs: { type: Number, required: true, min: 0 },
    expiresAt: { type: Date, required: true, index: true }
  },
  { timestamps: true, versionKey: false }
);

financialAiAnalysisSchema.index({ userId: 1, year: 1, month: 1, analysisType: 1, categoryId: 1, contextHash: 1 });

export type FinancialAiAnalysisDocument = InferSchemaType<typeof financialAiAnalysisSchema>;
export const FinancialAiAnalysisModel = models.FinancialAiAnalysis ?? model("FinancialAiAnalysis", financialAiAnalysisSchema);
