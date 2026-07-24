import { Schema, model, models, InferSchemaType } from "mongoose";

const categorySchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    color: { type: String, required: true },
    icon: { type: String, default: "circle" },
    targetPercentage: { type: Number, default: 0, min: 0, max: 100 }
  },
  { timestamps: true }
);

export type CategoryDocument = InferSchemaType<typeof categorySchema>;
export const CategoryModel = models.Category ?? model("Category", categorySchema);
