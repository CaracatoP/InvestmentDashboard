import { z } from "zod";

export const supportedThemes = ["dark", "light", "system"] as const;
export const supportedCurrencies = ["BRL"] as const;

const profileNameSchema = z
  .string()
  .trim()
  .min(2, "Nome deve ter pelo menos 2 caracteres")
  .max(80, "Nome deve ter no maximo 80 caracteres")
  .regex(/^[\p{L}\p{M}\d\s.'-]+$/u, "Nome contem caracteres invalidos");

const settingsSchema = z.object({
  theme: z.enum(supportedThemes).optional(),
  profileName: profileNameSchema.optional(),
  currency: z.enum(supportedCurrencies, {
    invalid_type_error: "Moeda invalida",
    required_error: "Moeda invalida"
  }).optional(),
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
