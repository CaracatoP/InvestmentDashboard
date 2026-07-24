import { z } from "zod";

export const goalSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  type: z.enum(["wealth", "dividend", "shares", "invested"]),
  target: z.number().positive().optional(),
  targetValue: z.number().nonnegative().optional(),
  targetQuantity: z.number().nonnegative().optional(),
  current: z.number().nonnegative().optional(),
  category: z.string().optional(),
  assetTicker: z.string().optional(),
  dueDate: z.string().optional(),
  active: z.boolean().default(true),
  completed: z.boolean().default(false)
}).transform((input) => ({
  title: input.title,
  description: input.description ?? input.category ?? "",
  type: input.type,
  targetValue: input.type === "shares" ? (input.targetValue ?? 0) : (input.targetValue ?? input.target ?? 0),
  targetQuantity: input.type === "shares" ? (input.targetQuantity ?? input.target ?? 0) : (input.targetQuantity ?? 0),
  assetTicker: input.assetTicker?.toUpperCase(),
  active: input.active,
  completed: input.completed
})).refine((input) => (input.type === "shares" ? input.targetQuantity > 0 : input.targetValue > 0), {
  message: "Goal target must be positive",
  path: ["target"]
});

export const goalUpdateSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().optional(),
  type: z.enum(["wealth", "dividend", "shares", "invested"]).optional(),
  target: z.number().positive().optional(),
  targetValue: z.number().nonnegative().optional(),
  targetQuantity: z.number().nonnegative().optional(),
  category: z.string().optional(),
  assetTicker: z.string().optional(),
  active: z.boolean().optional(),
  completed: z.boolean().optional()
}).transform((input) => ({
  title: input.title,
  description: input.description ?? input.category,
  type: input.type,
  targetValue: input.type === "shares" ? input.targetValue : input.targetValue ?? input.target,
  targetQuantity: input.type === "shares" ? input.targetQuantity ?? input.target : input.targetQuantity,
  assetTicker: input.assetTicker?.toUpperCase(),
  active: input.active,
  completed: input.completed
}));
