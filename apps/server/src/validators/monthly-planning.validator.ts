import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD");
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must use HH:mm");
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must use #RRGGBB");
const recurrenceFrequencySchema = z.enum(["weekly", "biweekly", "monthly", "annual", "custom"]);
const timestampSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/, "Timestamp must use ISO 8601 with timezone");
const expenseIntegrationSchema = z.object({
  destination: z.enum(["asset", "cashbox"]),
  linkedEntityType: z.enum(["operation", "cashBoxMovement"]).nullable().optional(),
  linkedEntityId: z.string().trim().nullable().optional(),
  assetId: z.string().trim().nullable().optional(),
  assetTicker: z.string().trim().nullable().optional().transform((value) => value?.toUpperCase() ?? value),
  cashBoxId: z.string().trim().nullable().optional(),
  operationType: z.enum(["COMPRA", "VENDA", "BONIFICACAO", "DESDOBRAMENTO", "GRUPAMENTO"]).nullable().optional(),
  quantity: z.number().positive().nullable().optional(),
  price: z.number().positive().nullable().optional(),
  fees: z.number().nonnegative().nullable().optional(),
  integrationId: z.string().trim().nullable().optional(),
  idempotencyKey: z.string().trim().min(8).nullable().optional()
});

const monthlyFinancialGoalSchema = z.object({
  id: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1),
  targetInCents: z.number().int().positive(),
  savedInCents: z.number().int().nonnegative().default(0),
  monthlyContributionInCents: z.number().int().nonnegative().default(0),
  linkedSource: z.enum(["manual", "portfolio", "cashbox"]).default("manual"),
  linkedSourceId: z.string().trim().optional(),
  active: z.boolean().default(true)
});

export const monthlyPlanCategorySchema = z.object({
  id: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1),
  icon: z.string().trim().min(1).default("tag"),
  color: colorSchema.default("#22c55e"),
  budgetType: z.enum(["percentage", "fixed"]).default("percentage"),
  percentage: z.number().min(0).max(1000).default(0),
  fixedAmountInCents: z.number().int().nonnegative().nullable().optional()
}).transform((input) => ({
  ...input,
  percentage: input.budgetType === "percentage" ? input.percentage : 0,
  fixedAmountInCents: input.budgetType === "fixed" ? input.fixedAmountInCents ?? 0 : null
}));

function hasUniqueCategoryNames(categories: Array<{ name: string }>) {
  const names = categories.map((category) => category.name.trim().toLowerCase());
  return new Set(names).size === names.length;
}

export const monthlyPlanSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(1970).max(2200),
  incomeInCents: z.number().int().nonnegative().default(0),
  categories: z.array(monthlyPlanCategorySchema).default([]),
  monthlyContributionGoalInCents: z.number().int().nonnegative().default(0),
  includeDividendsAsIncome: z.boolean().default(false),
  investmentSimulationAmountInCents: z.number().int().nonnegative().default(0),
  goals: z.array(monthlyFinancialGoalSchema).default([]),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
}).refine((input) => hasUniqueCategoryNames(input.categories), {
  message: "Category names must be unique",
  path: ["categories"]
});

export const monthlyPlanUpdateSchema = z.object({
  month: z.number().int().min(1).max(12).optional(),
  year: z.number().int().min(1970).max(2200).optional(),
  incomeInCents: z.number().int().nonnegative().optional(),
  categories: z.array(monthlyPlanCategorySchema).optional(),
  monthlyContributionGoalInCents: z.number().int().nonnegative().optional(),
  includeDividendsAsIncome: z.boolean().optional(),
  investmentSimulationAmountInCents: z.number().int().nonnegative().optional(),
  goals: z.array(monthlyFinancialGoalSchema).optional(),
  updatedAt: z.string().optional()
}).refine((input) => !input.categories || hasUniqueCategoryNames(input.categories), {
  message: "Category names must be unique",
  path: ["categories"]
});

export const monthlyPlanningQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(1970).max(2200),
  comparisonRange: z.coerce.number().int().min(1).max(12).default(1)
});

export const monthlyPlanningCopySchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(1970).max(2200)
});

export const monthlyExpenseSchema = z.object({
  planId: z.string().trim().min(1).optional(),
  categoryId: z.string().trim().min(1),
  description: z.string().trim().min(1),
  amountInCents: z.number().int().positive(),
  date: dateSchema,
  time: timeSchema,
  note: z.string().trim().optional(),
  paymentMethod: z.string().trim().nullable().optional(),
  expenseType: z.enum(["single", "recurring"]).default("single"),
  recurring: z.boolean().default(false),
  recurrenceId: z.string().trim().nullable().optional(),
  recurrenceSourceId: z.string().trim().nullable().optional(),
  recurrenceFrequency: recurrenceFrequencySchema.nullable().optional(),
  recurrenceInterval: z.number().int().min(1).max(60).nullable().optional(),
  recurrenceDayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  recurrenceStartDate: dateSchema.nullable().optional(),
  recurrenceEndDate: dateSchema.nullable().optional(),
  recurrenceOriginalDate: dateSchema.nullable().optional(),
  recurrenceCancelled: z.boolean().optional(),
  status: z.enum(["completed", "planned"]).optional(),
  integration: expenseIntegrationSchema.nullable().optional(),
  completedAt: timestampSchema.nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});

export const monthlyExpenseUpdateSchema = z.object({
  planId: z.string().trim().min(1).optional(),
  categoryId: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  amountInCents: z.number().int().positive().optional(),
  date: dateSchema.optional(),
  time: timeSchema.optional(),
  note: z.string().trim().optional(),
  paymentMethod: z.string().trim().nullable().optional(),
  expenseType: z.enum(["single", "recurring"]).optional(),
  recurring: z.boolean().optional(),
  recurrenceId: z.string().trim().nullable().optional(),
  recurrenceSourceId: z.string().trim().nullable().optional(),
  recurrenceFrequency: recurrenceFrequencySchema.nullable().optional(),
  recurrenceInterval: z.number().int().min(1).max(60).nullable().optional(),
  recurrenceDayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  recurrenceStartDate: dateSchema.nullable().optional(),
  recurrenceEndDate: dateSchema.nullable().optional(),
  recurrenceOriginalDate: dateSchema.nullable().optional(),
  recurrenceCancelled: z.boolean().optional(),
  status: z.enum(["completed", "planned"]).optional(),
  integration: expenseIntegrationSchema.nullable().optional(),
  completedAt: timestampSchema.nullable().optional(),
  updatedAt: z.string().optional()
});

export const monthlyIncomeEntrySchema = z.object({
  planId: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1),
  amountInCents: z.number().int().positive(),
  category: z.string().trim().min(1).default("Outros"),
  date: dateSchema,
  time: timeSchema,
  status: z.enum(["received", "planned", "cancelled"]).optional(),
  incomeType: z.enum(["single", "recurring"]).default("single"),
  recurring: z.boolean().default(false),
  recurrenceId: z.string().trim().nullable().optional(),
  recurrenceSourceId: z.string().trim().nullable().optional(),
  recurrenceFrequency: recurrenceFrequencySchema.nullable().optional(),
  recurrenceInterval: z.number().int().min(1).max(60).nullable().optional(),
  recurrenceDayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  recurrenceStartDate: dateSchema.nullable().optional(),
  recurrenceEndDate: dateSchema.nullable().optional(),
  recurrenceOriginalDate: dateSchema.nullable().optional(),
  recurrenceCancelled: z.boolean().optional(),
  receivedAt: timestampSchema.nullable().optional(),
  note: z.string().trim().optional(),
  sourceType: z.string().trim().nullable().optional(),
  sourceId: z.string().trim().nullable().optional(),
  idempotencyKey: z.string().trim().min(8).nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});

export const monthlyIncomeEntryUpdateSchema = z.object({
  planId: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  amountInCents: z.number().int().positive().optional(),
  category: z.string().trim().min(1).optional(),
  date: dateSchema.optional(),
  time: timeSchema.optional(),
  status: z.enum(["received", "planned", "cancelled"]).optional(),
  incomeType: z.enum(["single", "recurring"]).optional(),
  recurring: z.boolean().optional(),
  recurrenceId: z.string().trim().nullable().optional(),
  recurrenceSourceId: z.string().trim().nullable().optional(),
  recurrenceFrequency: recurrenceFrequencySchema.nullable().optional(),
  recurrenceInterval: z.number().int().min(1).max(60).nullable().optional(),
  recurrenceDayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  recurrenceStartDate: dateSchema.nullable().optional(),
  recurrenceEndDate: dateSchema.nullable().optional(),
  recurrenceOriginalDate: dateSchema.nullable().optional(),
  recurrenceCancelled: z.boolean().optional(),
  receivedAt: timestampSchema.nullable().optional(),
  note: z.string().trim().optional(),
  sourceType: z.string().trim().nullable().optional(),
  sourceId: z.string().trim().nullable().optional(),
  idempotencyKey: z.string().trim().min(8).nullable().optional(),
  updatedAt: z.string().optional()
});

export const monthlyExpenseMutationQuerySchema = z.object({
  scope: z.enum(["single", "series"]).default("single")
});

export const monthlyExpenseCompletionSchema = z.object({
  completedAt: timestampSchema.optional()
});

export const monthlyIncomeEntryCompletionSchema = z.object({
  receivedAt: timestampSchema.optional()
});

export const monthlyExpenseCompletionQuerySchema = z.object({
  comparisonRange: z.coerce.number().int().min(1).max(12).default(1)
});
