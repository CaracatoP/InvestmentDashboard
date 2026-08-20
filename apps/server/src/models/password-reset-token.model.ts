import { InferSchemaType, Schema, model, models } from "mongoose";

const passwordResetTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, default: null, index: true }
  },
  { timestamps: true }
);

passwordResetTokenSchema.index({ userId: 1, usedAt: 1, expiresAt: 1 });

export type PasswordResetTokenDocument = InferSchemaType<typeof passwordResetTokenSchema>;
export const PasswordResetTokenModel = models.PasswordResetToken ?? model("PasswordResetToken", passwordResetTokenSchema);
