import { z } from "zod";
import {
  monthlyExpenseCompletionSchema,
  monthlyExpenseSchema,
  monthlyIncomeEntryCompletionSchema,
  monthlyIncomeEntrySchema
} from "./monthly-planning.validator";

const phoneNumberSchema = z.string().trim().min(6).max(32);
const monthSchema = z.coerce.number().int().min(1).max(12);
const yearSchema = z.coerce.number().int().min(1970).max(2200);

export const n8nPhoneLookupQuerySchema = z.object({
  phoneNumber: phoneNumberSchema
});

export const n8nWhatsAppLinkVerifySchema = z.object({
  phoneNumber: phoneNumberSchema,
  code: z.string().trim().min(4).max(64)
});

export const n8nMonthlyPlanningSummaryQuerySchema = z.object({
  phoneNumber: phoneNumberSchema,
  month: monthSchema,
  year: yearSchema,
  comparisonRange: z.coerce.number().int().min(1).max(12).default(1)
});

export const n8nRecentExpensesQuerySchema = n8nMonthlyPlanningSummaryQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(50).default(10)
});

export const n8nMonthlyExpenseCreateSchema = z.object({
  phoneNumber: phoneNumberSchema,
  month: monthSchema,
  year: yearSchema,
  expense: monthlyExpenseSchema.omit({ planId: true })
});

export const n8nMonthlyIncomeEntryCreateSchema = z.object({
  phoneNumber: phoneNumberSchema,
  month: monthSchema,
  year: yearSchema,
  incomeEntry: monthlyIncomeEntrySchema.omit({ planId: true })
});

export const n8nMonthlyExpenseCompletionSchema = monthlyExpenseCompletionSchema.extend({
  phoneNumber: phoneNumberSchema
});

export const n8nMonthlyIncomeEntryCompletionSchema = monthlyIncomeEntryCompletionSchema.extend({
  phoneNumber: phoneNumberSchema
});
