import { Schema, model, models, InferSchemaType } from "mongoose";

const snapshotSchema = new Schema(
  {
    date: { type: Date, required: true, index: true },
    investedValue: { type: Number, required: true, min: 0 },
    currentValue: { type: Number, required: true, min: 0 },
    dividends: { type: Number, default: 0, min: 0 },
    contributions: { type: Number, default: 0, min: 0 }
  },
  { timestamps: true }
);

export type SnapshotDocument = InferSchemaType<typeof snapshotSchema>;
export const SnapshotModel = models.Snapshot ?? model("Snapshot", snapshotSchema);
