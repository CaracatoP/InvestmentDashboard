import { InferSchemaType, Schema, model, models } from "mongoose";

const integrationIdempotencyKeySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    source: { type: String, enum: ["n8n"], required: true, default: "n8n", index: true },
    idempotencyKey: { type: String, required: true, trim: true },
    operation: { type: String, required: true, trim: true, index: true },
    requestHash: { type: String, required: true, trim: true },
    status: { type: String, enum: ["processing", "completed", "failed"], required: true, default: "processing", index: true },
    response: { type: Schema.Types.Mixed, default: null },
    error: {
      statusCode: { type: Number, default: null },
      message: { type: String, default: "" }
    },
    startedAt: { type: Date, required: true, default: Date.now },
    completedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

integrationIdempotencyKeySchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
integrationIdempotencyKeySchema.index({ userId: 1, source: 1, operation: 1, createdAt: -1 });

export type IntegrationIdempotencyKeyDocument = InferSchemaType<typeof integrationIdempotencyKeySchema>;
export const IntegrationIdempotencyKeyModel = models.IntegrationIdempotencyKey ?? model("IntegrationIdempotencyKey", integrationIdempotencyKeySchema);
