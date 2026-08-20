import { Schema, model, models, InferSchemaType } from "mongoose";

const goalSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
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

goalSchema.index({ userId: 1, active: 1, createdAt: -1 });

export type GoalDocument = InferSchemaType<typeof goalSchema>;
export const GoalModel = models.Goal ?? model("Goal", goalSchema);
