import { Schema, model, models, InferSchemaType } from "mongoose";

const allocationSchema = new Schema(
  {
    category: { type: String, required: true, trim: true, index: true },
    targetPercentage: { type: Number, required: true, min: 0, max: 100 },
    priority: { type: Number, default: 1, min: 1 }
  },
  { timestamps: true }
);

export type AllocationDocument = InferSchemaType<typeof allocationSchema>;
export const AllocationModel = models.Allocation ?? model("Allocation", allocationSchema);
