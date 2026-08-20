import { z } from "zod";

const assetBaseSchema = z.object({
  name: z.string().min(2),
  ticker: z.string().min(1).transform((value) => value.toUpperCase()),
  category: z.enum(["FII", "ACAO", "ETF", "CRIPTO", "RENDA_FIXA"]),
  coingeckoId: z.string().trim().toLowerCase().optional(),
  subcategory: z.string().optional(),
  sector: z.string().optional(),
  currency: z.string().default("BRL"),
  active: z.boolean().default(true)
});

export const assetSchema = assetBaseSchema.superRefine((input, context) => {
  if (input.category === "CRIPTO" && !input.coingeckoId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["coingeckoId"],
      message: "CoinGecko asset identifier is required for crypto assets"
    });
  }
});

export const assetUpdateSchema = assetBaseSchema.partial().superRefine((input, context) => {
  if (input.category === "CRIPTO" && !input.coingeckoId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["coingeckoId"],
      message: "CoinGecko asset identifier is required for crypto assets"
    });
  }
});
