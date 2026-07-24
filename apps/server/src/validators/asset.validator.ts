import { z } from "zod";

export const assetSchema = z.object({
  name: z.string().min(2),
  ticker: z.string().min(1).transform((value) => value.toUpperCase()),
  category: z.enum(["FII", "ACAO", "ETF", "CRIPTO", "RENDA_FIXA"]),
  subcategory: z.string().optional(),
  sector: z.string().optional(),
  currency: z.string().default("BRL"),
  active: z.boolean().default(true)
});

export const assetUpdateSchema = assetSchema.partial();
