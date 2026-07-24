import { Schema, model, models, InferSchemaType } from "mongoose";

const contributionSchema = new Schema(
  {
    date: { type: Date, required: true, index: true },
    value: { type: Number, required: true, min: 0 },
    description: { type: String, default: "" }
  },
  { timestamps: true }
);

export type ContributionDocument = InferSchemaType<typeof contributionSchema>;
export const ContributionModel = models.Contribution ?? model("Contribution", contributionSchema);
