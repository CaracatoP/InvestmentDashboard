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

export function calculateRealValue(value: number, monthlyInflation: number, month: number) {
  return value / Math.pow(1 + monthlyInflation, month);
}

export function calculateProjection(input: ProjectionInput) {
  const years = Math.min(Math.max(input.targetAge - input.currentAge, 1), 100);
  const monthlyReturn = annualRateToMonthlyRate(input.expectedReturn);
  const monthlyInflation = annualRateToMonthlyRate(input.inflation);
  const monthlyDividendRate = annualRateToMonthlyRate(input.annualDividendYield ?? 0);
  const series = [];
  let wealth = input.wealth;
  let realWealth = input.wealth;
  let accumulatedDividends = 0;

  for (let month = 1; month <= years * 12; month += 1) {
    wealth *= 1 + monthlyReturn;
    const monthlyDividend = wealth * monthlyDividendRate;
    wealth += input.monthlyContribution;

    if (input.reinvestDividends) {
      wealth += monthlyDividend;
    } else {
      accumulatedDividends += monthlyDividend;
    }

    realWealth = calculateRealValue(wealth, monthlyInflation, month);

    if (month % 12 === 0) {
      const age = input.currentAge + month / 12;
      series.push({
        age,
        wealth: Math.round(wealth),
        realWealth: Math.round(realWealth),
        projectedDividends: Math.round((wealth * monthlyDividendRate) / 10) * 10,
        accumulatedDividends: Math.round(accumulatedDividends)
      });
    }
  }

  const futureWealth = series.at(-1)?.wealth ?? input.wealth;
  const futureMonthlyDividends = series.at(-1)?.projectedDividends ?? 0;

  return {
    summary: {
      futureWealth,
      realFutureWealth: series.at(-1)?.realWealth ?? input.wealth,
      futureMonthlyDividends,
      accumulatedDividends: Math.round(accumulatedDividends),
      years,
      months: years * 12
    },
    series
  };
}
