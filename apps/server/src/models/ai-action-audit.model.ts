import { InferSchemaType, Schema, model, models } from "mongoose";

const aiActionAuditSchema = new Schema(
  {
    sessionId: { type: String, required: true, index: true },
    messageId: { type: String, default: "" },
    pendingActionId: { type: String, required: true, index: true },
    actionType: { type: String, required: true },
    toolName: { type: String, required: true },
    targetEntity: { type: String, default: "" },
    targetEntityId: { type: String, default: "" },
    sanitizedInput: { type: Schema.Types.Mixed, default: {} },
    previousSnapshot: { type: Schema.Types.Mixed, default: null },
    resultSnapshot: { type: Schema.Types.Mixed, default: null },
    status: { type: String, enum: ["prepared", "confirmed", "executed", "cancelled", "failed"], required: true },
    confirmedAt: { type: Date, default: null },
    executedAt: { type: Date, default: null },
    errorCode: { type: String, default: "" },
    createdAt: { type: Date, required: true }
  },
  { versionKey: false }
);

export type AiActionAuditDocument = InferSchemaType<typeof aiActionAuditSchema>;
export const AiActionAuditModel = models.AiActionAudit ?? model("AiActionAudit", aiActionAuditSchema);
