import { z } from "zod";

const dividendTypes = ["dividendo", "jcp", "rendimento", "amortizacao", "outro"] as const;
const dividendStatuses = ["announced", "expected", "received", "cancelled"] as const;

function normalizeDividendType(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (normalized === "dividendos" || normalized === "dividend") return "dividendo";
  if (normalized === "juros sobre capital proprio" || normalized === "juros sobre capital") return "jcp";
  if (normalized === "amortizacao") return "amortizacao";
  if (normalized === "rendimentos") return "rendimento";
  return normalized || "dividendo";
}

function normalizeDividendStatus(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (!normalized) return "received";
  if (normalized === "previsto" || normalized === "prevista" || normalized === "expected") return "expected";
  if (normalized === "anunciado" || normalized === "anunciada" || normalized === "announced") return "announced";
  if (normalized === "recebido" || normalized === "recebida" || normalized === "received") return "received";
  if (normalized === "cancelado" || normalized === "cancelada" || normalized === "cancelled" || normalized === "canceled") return "cancelled";
  return normalized;
}

const dividendTypeSchema = z.preprocess(normalizeDividendType, z.enum(dividendTypes));
const dividendStatusSchema = z.preprocess(normalizeDividendStatus, z.enum(dividendStatuses));

export const dividendSchema = z.object({
  assetId: z.string().optional(),
  assetTicker: z.string().optional().transform((value) => value?.toUpperCase()),
  category: z.string().optional(),
  type: dividendTypeSchema.default("dividendo"),
  totalValue: z.number().positive().optional(),
  valuePerShare: z.number().nonnegative().default(0),
  amountPerShare: z.number().nonnegative().optional(),
  quantityEligible: z.number().nonnegative().optional(),
  grossAmount: z.number().nonnegative().optional(),
  netAmount: z.number().nonnegative().optional(),
  baseDate: z.string().optional(),
  exDate: z.string().optional(),
  paymentDate: z.string().min(1),
  receivedAt: z.string().optional().nullable(),
  referenceMonth: z.string().optional(),
  status: dividendStatusSchema.default("received"),
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
    receivedAt: input.status === "received" ? (input.receivedAt ?? input.paymentDate) : (input.receivedAt ?? null),
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
  type: dividendTypeSchema.optional(),
  totalValue: z.number().positive().optional(),
  valuePerShare: z.number().nonnegative().optional(),
  amountPerShare: z.number().nonnegative().optional(),
  quantityEligible: z.number().nonnegative().optional(),
  grossAmount: z.number().nonnegative().optional(),
  netAmount: z.number().nonnegative().optional(),
  baseDate: z.string().optional(),
  exDate: z.string().optional(),
  paymentDate: z.string().optional(),
  receivedAt: z.string().optional().nullable(),
  referenceMonth: z.string().optional(),
  status: dividendStatusSchema.optional(),
  source: z.string().optional(),
  notes: z.string().optional()
});

export const dividendReceiveSchema = z.object({
  receivedAt: z.string().optional(),
  paymentDate: z.string().optional(),
  totalValue: z.number().positive().optional(),
  amountPerShare: z.number().nonnegative().optional(),
  valuePerShare: z.number().nonnegative().optional(),
  quantityEligible: z.number().nonnegative().optional(),
  grossAmount: z.number().nonnegative().optional(),
  netAmount: z.number().nonnegative().optional(),
  notes: z.string().optional()
});
