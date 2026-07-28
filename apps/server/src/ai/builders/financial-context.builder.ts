import type { AiAnalysisType } from "../schemas/ai.schema";
import { buildCategoryContext } from "./category-context.builder";
import { buildInvestmentContext } from "./investment-context.builder";
import { buildPlanningContext } from "./planning-context.builder";

async function buildCompleteContext(year: number, month: number) {
  const [planning, investments] = await Promise.all([
    buildPlanningContext(year, month, undefined, "overview"),
    buildInvestmentContext("overview")
  ]);

  return {
    scope: "complete_snapshot",
    planning,
    investments
  };
}

export async function buildFinancialAnalysisContext(input: {
  year: number;
  month: number;
  analysisType: AiAnalysisType;
  categoryId?: string;
}) {
  if (input.analysisType === "planning") {
    return buildPlanningContext(input.year, input.month, undefined, "overview");
  }

  if (input.analysisType === "category") {
    return buildCategoryContext(input.year, input.month, input.categoryId);
  }

  if (input.analysisType === "investments") {
    return buildInvestmentContext("overview");
  }

  if (input.analysisType === "goals") {
    return buildInvestmentContext("goals");
  }

  if (input.analysisType === "projections") {
    return buildInvestmentContext("projections");
  }

  return buildCompleteContext(input.year, input.month);
}
