import { Schema, model, models, InferSchemaType } from "mongoose";

const allocationSchema = new Schema(
  {
    category: { type: String, required: true, trim: true },
    targetPercentage: { type: Number, required: true, min: 0, max: 100 },
    priority: { type: Number, required: true, min: 1 }
  },
  { _id: false }
);

const settingsSchema = new Schema(
  {
    theme: { type: String, enum: ["dark", "light", "system"], default: "dark" },
    profileName: { type: String, default: "Investidor", trim: true },
    currency: { type: String, enum: ["BRL"], default: "BRL", trim: true },
    expectedReturn: { type: Number, default: 0 },
    inflation: { type: Number, default: 0 },
    currentAge: { type: Number, default: 0 },
    targetAge: { type: Number, default: 1 },
    allocations: { type: [allocationSchema], default: [] }
  },
  { timestamps: true }
);

export type SettingsDocument = InferSchemaType<typeof settingsSchema>;
export const SettingsModel = models.Settings ?? model("Settings", settingsSchema);
