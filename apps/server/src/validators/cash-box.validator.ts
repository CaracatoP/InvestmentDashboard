import { z } from "zod";

const movementSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["DEPOSITO", "RESGATE", "RENDIMENTO"]),
  value: z.number().nonnegative(),
  date: z.string().min(1),
  description: z.string().optional()
});

export const cashBoxSchema = z.object({
  name: z.string().min(2),
  type: z.string().min(2),
  currentBalance: z.number().nonnegative(),
  cdiPercentage: z.number().nonnegative(),
  createdAt: z.string().min(1),
  active: z.boolean().default(true),
  movements: z.array(movementSchema).default([])
});

export const cashBoxUpdateSchema = cashBoxSchema.partial();
