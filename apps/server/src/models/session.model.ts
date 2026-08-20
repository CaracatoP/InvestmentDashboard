import { InferSchemaType, Schema, model, models } from "mongoose";

const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, default: null, index: true },
    lastUsedAt: { type: Date, default: Date.now },
    ipAddress: { type: String, default: "" },
    userAgent: { type: String, default: "" }
  },
  { timestamps: true }
);

sessionSchema.index({ userId: 1, revokedAt: 1, expiresAt: 1 });

export type SessionDocument = InferSchemaType<typeof sessionSchema>;
export const SessionModel = models.Session ?? model("Session", sessionSchema);
