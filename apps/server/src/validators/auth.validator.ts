import { z } from "zod";

export const userStatuses = ["pending_approval", "active", "rejected", "disabled"] as const;
export const userRoles = ["admin", "user"] as const;

const emailSchema = z.string().trim().email("E-mail invalido").max(254).transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(8, "Senha deve ter pelo menos 8 caracteres")
  .max(128, "Senha deve ter no maximo 128 caracteres")
  .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), "Senha deve conter letras e numeros");

export const authRegisterSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Nome deve ter pelo menos 2 caracteres")
      .max(80, "Nome deve ter no maximo 80 caracteres")
      .regex(/^[\p{L}\p{M}\d\s.'-]+$/u, "Nome contem caracteres invalidos"),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string()
  })
  .refine((input) => input.password === input.confirmPassword, {
    message: "As senhas nao conferem",
    path: ["confirmPassword"]
  });

export const authLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Senha obrigatoria")
});

export const forgotPasswordSchema = z.object({
  email: emailSchema
});

export const resetPasswordSchema = z.object({
  token: z.string().min(16, "Token invalido"),
  password: passwordSchema,
  confirmPassword: z.string()
}).refine((input) => input.password === input.confirmPassword, {
  message: "As senhas nao conferem",
  path: ["confirmPassword"]
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Senha atual obrigatoria"),
  password: passwordSchema,
  confirmPassword: z.string()
}).refine((input) => input.password === input.confirmPassword, {
  message: "As senhas nao conferem",
  path: ["confirmPassword"]
});
