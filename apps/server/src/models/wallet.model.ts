import { Schema, model, models, InferSchemaType } from "mongoose";

const walletSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    baseCurrency: { type: String, default: "BRL" },
    userId: { type: Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

export type WalletDocument = InferSchemaType<typeof walletSchema>;
export const WalletModel = models.Wallet ?? model("Wallet", walletSchema);
