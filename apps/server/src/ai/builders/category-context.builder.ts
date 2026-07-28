import { buildPlanningContext } from "./planning-context.builder";

export async function buildCategoryContext(year: number, month: number, categoryId?: string) {
  return buildPlanningContext(year, month, categoryId, "category");
}
