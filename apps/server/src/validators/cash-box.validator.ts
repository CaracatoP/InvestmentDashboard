import { z } from "zod";

const movementSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["DEPOSITO", "RESGATE", "RENDIMENTO", "contribution", "withdrawal", "yield", "adjustment"]),
  value: z.number().nonnegative(),
  date: z.string().min(1),
  description: z.string().optional()
});

export const cashBoxSchema = z.object({
  categoryId: z.string().default("cash"),
  name: z.string().min(2),
  type: z.string().min(2),
  initialBalance: z.number().nonnegative().optional(),
  currentBalance: z.number().nonnegative(),
  totalContributions: z.number().nonnegative().optional(),
  totalWithdrawals: z.number().nonnegative().optional(),
  totalYield: z.number().nonnegative().optional(),
  cdiPercentage: z.number().nonnegative(),
  annualRateOverride: z.number().nonnegative().optional(),
  lastYieldCalculationAt: z.string().optional(),
  createdAt: z.string().min(1),
  active: z.boolean().default(true),
  movements: z.array(movementSchema).default([])
});

export const cashBoxUpdateSchema = cashBoxSchema.partial();

export const cashBoxMovementInputSchema = z.object({
  value: z.number().positive(),
  date: z.string().min(1).default(() => new Date().toISOString().slice(0, 10)),
  description: z.string().optional()
});

export const cashBoxRecalculateSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  cashBoxId: z.string().optional()
});
