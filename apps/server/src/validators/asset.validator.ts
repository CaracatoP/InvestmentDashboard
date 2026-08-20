import { z } from "zod";
import { resolveKnownCryptoIdentity } from "../services/ticker.service";

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

function withKnownCryptoIdentity<T extends z.infer<typeof assetBaseSchema>>(input: T): T {
  if (input.category !== "CRIPTO" || input.coingeckoId) return input;
  const known = resolveKnownCryptoIdentity({ ticker: input.ticker, name: input.name });
  return known ? { ...input, coingeckoId: known.coingeckoId } : input;
}

export const assetSchema = assetBaseSchema.transform(withKnownCryptoIdentity).superRefine((input, context) => {
  if (input.category === "CRIPTO" && !input.coingeckoId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["coingeckoId"],
      message: "CoinGecko asset identifier is required for crypto assets"
    });
  }
});

export const assetUpdateSchema = assetBaseSchema.partial().transform((input) => {
  if (input.category !== "CRIPTO" || input.coingeckoId || !input.ticker) return input;
  const known = resolveKnownCryptoIdentity({ ticker: input.ticker, name: input.name });
  return known ? { ...input, coingeckoId: known.coingeckoId } : input;
}).superRefine((input, context) => {
  if (input.category === "CRIPTO" && !input.coingeckoId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["coingeckoId"],
      message: "CoinGecko asset identifier is required for crypto assets"
    });
  }
});
