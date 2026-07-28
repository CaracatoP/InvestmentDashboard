import { InferSchemaType, Schema, model, models } from "mongoose";

const aiChatSessionSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true }
  },
  { versionKey: false }
);

export type AiChatSessionDocument = InferSchemaType<typeof aiChatSessionSchema>;
export const AiChatSessionModel = models.AiChatSession ?? model("AiChatSession", aiChatSessionSchema);
