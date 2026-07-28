import { z } from "zod";

const operationBaseSchema = z.object({
  assetId: z.string().optional(),
  assetTicker: z.string().optional().transform((value) => value?.toUpperCase()),
  type: z.enum(["COMPRA", "VENDA", "BONIFICACAO", "DESDOBRAMENTO", "GRUPAMENTO"]),
  quantity: z.number().nonnegative().default(0),
  price: z.number().nonnegative().default(0),
  fees: z.number().nonnegative().default(0),
  totalValue: z.number().nonnegative().default(0),
  date: z.string().min(1),
  notes: z.string().optional()
});

export const operationSchema = operationBaseSchema.refine((input) => Boolean(input.assetId || input.assetTicker), {
  message: "Operation asset is required",
  path: ["assetTicker"]
}).refine((input) => input.quantity > 0, {
  message: "Operation quantity must be greater than zero",
  path: ["quantity"]
}).refine((input) => (["BONIFICACAO", "DESDOBRAMENTO", "GRUPAMENTO"].includes(input.type) ? true : input.price > 0), {
  message: "Operation price must be greater than zero",
  path: ["price"]
});

export const operationUpdateSchema = operationBaseSchema.partial();
