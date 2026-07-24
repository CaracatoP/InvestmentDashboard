import { Schema, model, models, InferSchemaType } from "mongoose";

const goalSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    type: { type: String, enum: ["wealth", "dividend", "shares", "invested"], required: true },
    targetValue: { type: Number, default: 0, min: 0 },
    assetTicker: { type: String, default: "" },
    targetQuantity: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true },
    completed: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export type GoalDocument = InferSchemaType<typeof goalSchema>;
export const GoalModel = models.Goal ?? model("Goal", goalSchema);
