type ProjectionInput = {
  wealth: number;
  monthlyContribution: number;
  expectedReturn: number;
  inflation: number;
  currentAge: number;
  targetAge: number;
  reinvestDividends: boolean;
  monthlyDividendYield?: number;
};

export function calculateProjection(input: ProjectionInput) {
  const years = Math.max(input.targetAge - input.currentAge, 1);
  const monthlyReturn = Math.pow(1 + input.expectedReturn / 100, 1 / 12) - 1;
  const monthlyInflation = Math.pow(1 + input.inflation / 100, 1 / 12) - 1;
  const monthlyDividendRate = (input.monthlyDividendYield ?? 0) / 100;
  const dividendBonus = input.reinvestDividends ? monthlyDividendRate : 0;
  const series = [];
  let wealth = input.wealth;
  let realWealth = input.wealth;

  for (let month = 1; month <= years * 12; month += 1) {
    wealth = wealth * (1 + monthlyReturn + dividendBonus) + input.monthlyContribution;
    realWealth = wealth / Math.pow(1 + monthlyInflation, month);

    if (month % 12 === 0) {
      const age = input.currentAge + month / 12;
      series.push({
        age,
        wealth: Math.round(wealth),
        realWealth: Math.round(realWealth),
        projectedDividends: Math.round((wealth * monthlyDividendRate) / 10) * 10
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
      years,
      months: years * 12
    },
    series
  };
}
