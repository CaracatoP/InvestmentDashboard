import { InferSchemaType, Schema, model, models } from "mongoose";

const auditLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    actorType: { type: String, enum: ["user", "admin", "system", "whatsapp"], required: true, index: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    channel: { type: String, enum: ["web", "whatsapp", "system", "admin"], required: true, index: true },
    action: { type: String, required: true, index: true },
    entityType: { type: String, default: "", index: true },
    entityId: { type: String, default: "" },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ userId: 1, action: 1, createdAt: -1 });

export type AuditLogDocument = InferSchemaType<typeof auditLogSchema>;
export const AuditLogModel = models.AuditLog ?? model("AuditLog", auditLogSchema);
