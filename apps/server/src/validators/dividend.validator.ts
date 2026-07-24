import { z } from "zod";

export const dividendSchema = z.object({
  assetId: z.string().optional(),
  assetTicker: z.string().optional().transform((value) => value?.toUpperCase()),
  totalValue: z.number().positive(),
  valuePerShare: z.number().nonnegative().default(0),
  baseDate: z.string().optional(),
  paymentDate: z.string().min(1)
});

export const dividendUpdateSchema = dividendSchema.partial();
