import { InferSchemaType, Schema, model, models } from "mongoose";

const userApprovalRequestSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    decidedAt: { type: Date, default: null },
    decision: { type: String, enum: ["approved", "rejected", null], default: null, index: true },
    decidedByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

userApprovalRequestSchema.index({ userId: 1, decision: 1, expiresAt: 1 });

export type UserApprovalRequestDocument = InferSchemaType<typeof userApprovalRequestSchema>;
export const UserApprovalRequestModel = models.UserApprovalRequest ?? model("UserApprovalRequest", userApprovalRequestSchema);
