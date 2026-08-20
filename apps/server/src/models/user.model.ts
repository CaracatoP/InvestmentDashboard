import { Schema, model, models, InferSchemaType } from "mongoose";

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["admin", "user"], default: "user", index: true },
    status: { type: String, enum: ["pending_approval", "active", "rejected", "disabled"], default: "pending_approval", index: true },
    phoneNumber: { type: String, default: "", trim: true },
    phoneNormalized: { type: String, default: "", trim: true },
    whatsappLinkedAt: { type: Date, default: null },
    timezone: { type: String, default: "America/Sao_Paulo", trim: true },
    lastLoginAt: { type: Date, default: null },
    currency: { type: String, default: "BRL" },
    theme: { type: String, enum: ["dark", "light", "system"], default: "dark" }
  },
  { timestamps: true }
);

userSchema.index({ phoneNormalized: 1 }, { unique: true, sparse: true, partialFilterExpression: { phoneNormalized: { $type: "string", $gt: "" } } });

export type UserDocument = InferSchemaType<typeof userSchema>;
export const UserModel = models.User ?? model("User", userSchema);
