import { z } from "zod";

export const dividendSchema = z.object({
  assetId: z.string().optional(),
  assetTicker: z.string().optional().transform((value) => value?.toUpperCase()),
  category: z.string().optional(),
  type: z.enum(["dividendo", "jcp", "rendimento", "amortizacao", "outro"]).default("dividendo"),
  totalValue: z.number().positive().optional(),
  valuePerShare: z.number().nonnegative().default(0),
  amountPerShare: z.number().nonnegative().optional(),
  quantityEligible: z.number().nonnegative().optional(),
  grossAmount: z.number().nonnegative().optional(),
  netAmount: z.number().nonnegative().optional(),
  baseDate: z.string().optional(),
  exDate: z.string().optional(),
  paymentDate: z.string().min(1),
  referenceMonth: z.string().optional(),
  status: z.enum(["announced", "expected", "received", "cancelled"]).default("received"),
  source: z.string().default("manual"),
  notes: z.string().optional()
}).transform((input) => {
  const amountPerShare = input.amountPerShare ?? input.valuePerShare;
  const grossAmount = input.grossAmount ?? input.totalValue ?? (amountPerShare * (input.quantityEligible ?? 0));
  const netAmount = input.netAmount ?? grossAmount;

  return {
    ...input,
    valuePerShare: amountPerShare,
    amountPerShare,
    quantityEligible: input.quantityEligible ?? (amountPerShare > 0 ? Math.round(netAmount / amountPerShare) : 0),
    grossAmount,
    netAmount,
    totalValue: netAmount,
    referenceMonth: input.referenceMonth ?? input.paymentDate.slice(0, 7)
  };
}).refine((input) => input.totalValue > 0, {
  message: "Dividend amount must be positive",
  path: ["totalValue"]
});

export const dividendUpdateSchema = z.object({
  assetId: z.string().optional(),
  assetTicker: z.string().optional().transform((value) => value?.toUpperCase()),
  category: z.string().optional(),
  type: z.enum(["dividendo", "jcp", "rendimento", "amortizacao", "outro"]).optional(),
  totalValue: z.number().positive().optional(),
  valuePerShare: z.number().nonnegative().optional(),
  amountPerShare: z.number().nonnegative().optional(),
  quantityEligible: z.number().nonnegative().optional(),
  grossAmount: z.number().nonnegative().optional(),
  netAmount: z.number().nonnegative().optional(),
  baseDate: z.string().optional(),
  exDate: z.string().optional(),
  paymentDate: z.string().optional(),
  referenceMonth: z.string().optional(),
  status: z.enum(["announced", "expected", "received", "cancelled"]).optional(),
  source: z.string().optional(),
  notes: z.string().optional()
});
