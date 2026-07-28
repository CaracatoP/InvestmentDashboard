import { InferSchemaType, Schema, model, models } from "mongoose";

const aiPendingActionSchema = new Schema(
  {
    sessionId: { type: String, required: true, index: true },
    actionType: { type: String, required: true, index: true },
    toolName: { type: String, required: true, index: true },
    extractedFields: { type: Schema.Types.Mixed, default: {} },
    missingFields: { type: [Schema.Types.Mixed], default: [] },
    preview: { type: Schema.Types.Mixed, default: null },
    status: {
      type: String,
      enum: ["collecting", "awaiting_confirmation", "confirmed", "executed", "cancelled", "expired", "failed"],
      required: true,
      index: true
    },
    riskLevel: { type: String, enum: ["low", "medium", "high"], default: "low" },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, index: true },
    idempotencyKey: { type: String, required: true, unique: true },
    executionResult: { type: Schema.Types.Mixed, default: null }
  },
  { versionKey: false }
);

export type AiPendingActionDocument = InferSchemaType<typeof aiPendingActionSchema>;
export const AiPendingActionModel = models.AiPendingAction ?? model("AiPendingAction", aiPendingActionSchema);
