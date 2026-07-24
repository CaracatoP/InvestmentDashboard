import { z } from "zod";

const settingsSchema = z.object({
  theme: z.string().optional(),
  profileName: z.string().optional(),
  currency: z.string().optional(),
  expectedReturn: z.number().nonnegative().optional(),
  inflation: z.number().nonnegative().optional(),
  currentAge: z.number().int().nonnegative().optional(),
  targetAge: z.number().int().positive().optional()
});

export const settingsUpdateSchema = settingsSchema.refine(
  (input) => !input.currentAge || !input.targetAge || input.targetAge > input.currentAge,
  {
    message: "Target age must be greater than current age",
    path: ["targetAge"]
  }
);
