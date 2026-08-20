import { InferSchemaType, Schema, model, models } from "mongoose";

const whatsAppLinkSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    phoneNormalized: { type: String, default: "", trim: true, index: true },
    status: { type: String, enum: ["pending", "verified", "revoked"], required: true, default: "pending", index: true },
    verificationCodeHash: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    verifiedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

whatsAppLinkSchema.index({ userId: 1, status: 1, expiresAt: 1 });
whatsAppLinkSchema.index({ phoneNormalized: 1, status: 1 }, { sparse: true });

export type WhatsAppLinkDocument = InferSchemaType<typeof whatsAppLinkSchema>;
export const WhatsAppLinkModel = models.WhatsAppLink ?? model("WhatsAppLink", whatsAppLinkSchema);
