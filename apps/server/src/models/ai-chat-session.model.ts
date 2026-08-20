import { InferSchemaType, Schema, model, models } from "mongoose";

const aiChatSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    channel: { type: String, enum: ["web", "whatsapp"], default: "web", index: true },
    externalConversationId: { type: String, default: "", index: true },
    title: { type: String, required: true, trim: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true }
  },
  { versionKey: false }
);

aiChatSessionSchema.index({ userId: 1, updatedAt: -1 });
aiChatSessionSchema.index({ userId: 1, channel: 1, externalConversationId: 1 });

export type AiChatSessionDocument = InferSchemaType<typeof aiChatSessionSchema>;
export const AiChatSessionModel = models.AiChatSession ?? model("AiChatSession", aiChatSessionSchema);
