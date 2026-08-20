import { Schema, model, models, InferSchemaType } from "mongoose";

const snapshotSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: Date, required: true, index: true },
    investedValue: { type: Number, required: true, min: 0 },
    currentValue: { type: Number, required: true, min: 0 },
    dividends: { type: Number, default: 0, min: 0 },
    contributions: { type: Number, default: 0, min: 0 }
  },
  { timestamps: true }
);

snapshotSchema.index({ userId: 1, date: 1 });

export type SnapshotDocument = InferSchemaType<typeof snapshotSchema>;
export const SnapshotModel = models.Snapshot ?? model("Snapshot", snapshotSchema);
