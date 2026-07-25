type ProjectionInput = {
  wealth: number;
  monthlyContribution: number;
  expectedReturn: number;
  inflation: number;
  currentAge: number;
  targetAge: number;
  reinvestDividends: boolean;
  annualDividendYield?: number;
};

export function annualRateToMonthlyRate(rate: number) {
  return Math.pow(1 + rate / 100, 1 / 12) - 1;
}

function annualDividendYieldToMonthlyIncomeRate(rate: number) {
  return rate / 100 / 12;
}

export function calculateRealValue(value: number, monthlyInflation: number, month: number) {
  return value / Math.pow(1 + monthlyInflation, month);
}

export function calculateProjection(input: ProjectionInput) {
  const years = Math.min(Math.max(input.targetAge - input.currentAge, 1), 100);
  const monthlyReturn = annualRateToMonthlyRate(input.expectedReturn);
  const monthlyInflation = annualRateToMonthlyRate(input.inflation);
  const monthlyDividendIncomeRate = annualDividendYieldToMonthlyIncomeRate(input.annualDividendYield ?? 0);
  const series = [];
  let wealth = input.wealth;
  let realWealth = input.wealth;
  let accumulatedEstimatedDividends = 0;

  for (let month = 1; month <= years * 12; month += 1) {
    wealth = wealth * (1 + monthlyReturn) + input.monthlyContribution;
    const monthlyPassiveIncome = wealth * monthlyDividendIncomeRate;
    accumulatedEstimatedDividends += monthlyPassiveIncome;
    realWealth = calculateRealValue(wealth, monthlyInflation, month);

    if (month % 12 === 0) {
      const age = input.currentAge + month / 12;
      series.push({
        age,
        wealth: Math.round(wealth),
        realWealth: Math.round(realWealth),
        projectedDividends: Math.round(monthlyPassiveIncome),
        accumulatedDividends: Math.round(accumulatedEstimatedDividends)
      });
    }
  }

  const futureWealth = series.at(-1)?.wealth ?? input.wealth;
  const futureMonthlyDividends = series.at(-1)?.projectedDividends ?? 0;
  const futureAnnualDividends = Math.round(wealth * monthlyDividendIncomeRate * 12);

  return {
    summary: {
      futureWealth,
      realFutureWealth: series.at(-1)?.realWealth ?? input.wealth,
      futureMonthlyDividends,
      futureAnnualDividends,
      accumulatedDividends: Math.round(accumulatedEstimatedDividends),
      years,
      months: years * 12
    },
    series
  };
}
