import { InferSchemaType, Schema, model, models } from "mongoose";

const aiChatMessageSchema = new Schema(
  {
    sessionId: { type: String, required: true, index: true },
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

export type AiChatMessageDocument = InferSchemaType<typeof aiChatMessageSchema>;
export const AiChatMessageModel = models.AiChatMessage ?? model("AiChatMessage", aiChatMessageSchema);
