import { InferSchemaType, Schema, model, models } from "mongoose";

const webhookEventSchema = new Schema(
  {
    provider: { type: String, required: true, trim: true, index: true },
    externalMessageId: { type: String, required: true, trim: true },
    channel: { type: String, enum: ["whatsapp"], required: true, default: "whatsapp" },
    status: { type: String, enum: ["received", "ignored", "processed", "failed"], required: true, default: "received", index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    processedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

webhookEventSchema.index({ provider: 1, externalMessageId: 1 }, { unique: true });

export type WebhookEventDocument = InferSchemaType<typeof webhookEventSchema>;
export const WebhookEventModel = models.WebhookEvent ?? model("WebhookEvent", webhookEventSchema);
