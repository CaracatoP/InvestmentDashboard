import { createCashBox, deleteCashBox, findCashBoxById, listCashBoxes, updateCashBox } from "../repositories/investment.repository";
import { created, noContent, ok } from "../utils/api-response";
import { asyncHandler } from "../utils/async-handler";
import { notFound } from "../utils/http-error";
import { cashBoxSchema, cashBoxUpdateSchema } from "../validators/cash-box.validator";

export const listCashBoxRecords = asyncHandler(async (_request, response) => {
  const cashBoxes = await listCashBoxes();
  if (_request.query.mode === "records") {
    ok(response, cashBoxes);
    return;
  }

  const totalBalance = cashBoxes.reduce((total, cashBox) => total + cashBox.currentBalance, 0);
  const movements = cashBoxes
    .flatMap((cashBox) =>
      (cashBox.movements ?? []).map((movement) => ({
        ...movement,
        cashBoxId: cashBox.id,
        cashBoxName: cashBox.name
      }))
    )
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  const deposited = movements.filter((movement) => movement.type === "DEPOSITO").reduce((total, movement) => total + movement.value, 0);
  const withdrawn = movements.filter((movement) => movement.type === "RESGATE").reduce((total, movement) => total + movement.value, 0);
  const explicitYield = movements.filter((movement) => movement.type === "RENDIMENTO").reduce((total, movement) => total + movement.value, 0);
  const calculatedYield = totalBalance + withdrawn - deposited;
  const yieldValue = explicitYield > 0 ? explicitYield : calculatedYield;
  const evolution = buildCashBoxEvolution(cashBoxes);

  ok(response, {
    totals: {
      currentBalance: totalBalance,
      deposited,
      withdrawn,
      yield: yieldValue,
      profitability: deposited > 0 ? (yieldValue / deposited) * 100 : 0
    },
    cashBoxes,
    history: movements,
    evolution
  });
});

function buildCashBoxEvolution(cashBoxes: Awaited<ReturnType<typeof listCashBoxes>>) {
  const movements = cashBoxes
    .flatMap((cashBox) => cashBox.movements ?? [])
    .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
  let balance = 0;

  return movements.map((movement) => {
    if (movement.type === "DEPOSITO" || movement.type === "RENDIMENTO") balance += movement.value;
    if (movement.type === "RESGATE") balance -= movement.value;

    return {
      month: new Date(movement.date).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
      value: Math.max(balance, 0)
    };
  });
}

export const showCashBoxRecord = asyncHandler(async (request, response) => {
  const cashBox = await findCashBoxById(String(request.params.id));
  if (!cashBox) throw notFound("Cash box not found");
  ok(response, cashBox);
});

export const createCashBoxRecord = asyncHandler(async (request, response) => {
  const input = cashBoxSchema.parse(request.body);
  created(response, await createCashBox(input));
});

export const updateCashBoxRecord = asyncHandler(async (request, response) => {
  const input = cashBoxUpdateSchema.parse(request.body);
  const cashBox = await updateCashBox(String(request.params.id), input);

  if (!cashBox) throw notFound("Cash box not found");

  ok(response, cashBox);
});

export const deleteCashBoxRecord = asyncHandler(async (request, response) => {
  const deleted = await deleteCashBox(String(request.params.id));
  if (!deleted) throw notFound("Cash box not found");
  noContent(response);
});
