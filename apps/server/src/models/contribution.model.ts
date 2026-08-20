import { Schema, model, models, InferSchemaType } from "mongoose";

const contributionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: Date, required: true, index: true },
    value: { type: Number, required: true, min: 0 },
    description: { type: String, default: "" }
  },
  { timestamps: true }
);

contributionSchema.index({ userId: 1, date: -1 });
contributionSchema.index({ userId: 1, createdAt: -1 });

export type ContributionDocument = InferSchemaType<typeof contributionSchema>;
export const ContributionModel = models.Contribution ?? model("Contribution", contributionSchema);
