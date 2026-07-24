import { z } from "zod";

export const contributionSchema = z.object({
  date: z.string().min(1),
  value: z.number().positive().optional(),
  amount: z.number().positive().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  category: z.string().optional()
}).transform((input) => ({
  date: input.date,
  value: input.value ?? input.amount ?? 0,
  description: input.description ?? input.notes ?? input.category ?? ""
})).refine((input) => input.value > 0, {
  message: "Contribution value must be positive",
  path: ["value"]
});

export const contributionUpdateSchema = z.object({
  date: z.string().min(1).optional(),
  value: z.number().positive().optional(),
  amount: z.number().positive().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  category: z.string().optional()
}).transform((input) => ({
  date: input.date,
  value: input.value ?? input.amount,
  description: input.description ?? input.notes ?? input.category
}));
