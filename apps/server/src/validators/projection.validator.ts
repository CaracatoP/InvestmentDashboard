import { z } from "zod";

export const projectionSchema = z.object({
  wealth: z.number().nonnegative(),
  monthlyContribution: z.number().nonnegative(),
  expectedReturn: z.number().min(0).max(100),
  inflation: z.number().min(0).max(100),
  currentAge: z.number().int().min(0).max(120),
  targetAge: z.number().int().min(1).max(130),
  reinvestDividends: z.boolean(),
  monthlyDividendYield: z.number().min(0).max(100).optional()
});
