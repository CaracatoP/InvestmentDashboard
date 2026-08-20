import { InferSchemaType, Schema, model, models } from "mongoose";

const aiChatMessageSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    channel: { type: String, enum: ["web", "whatsapp"], default: "web", index: true },
    externalMessageId: { type: String, default: "", index: true },
    role: { type: String, enum: ["user", "assistant", "system"], required: true },
    content: { type: String, required: true },
    structuredResponse: { type: Schema.Types.Mixed, default: null },
    intent: { type: String, default: "" },
    provider: { type: String, default: "" },
    model: { type: String, default: "" },
    durationMs: { type: Number, default: 0, min: 0 },
    createdAt: { type: Date, required: true, index: true }
  },
  { versionKey: false }
);

aiChatMessageSchema.index({ userId: 1, sessionId: 1, createdAt: 1 });
aiChatMessageSchema.index({ userId: 1, channel: 1, externalMessageId: 1 }, { sparse: true });

export type AiChatMessageDocument = InferSchemaType<typeof aiChatMessageSchema>;
export const AiChatMessageModel = models.AiChatMessage ?? model("AiChatMessage", aiChatMessageSchema);
