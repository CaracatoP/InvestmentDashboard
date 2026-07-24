import {
  findCashBoxById,
  listCashBoxes,
  listCashBoxYields,
  updateCashBox
} from "../repositories/investment.repository";
import type { CashBoxMovementRecord, CashBoxRecord } from "../types/investment";
import { badRequest, notFound } from "../utils/http-error";

export function isCashBoxContribution(type: string) {
  return type === "DEPOSITO" || type === "contribution";
}

export function isCashBoxWithdrawal(type: string) {
  return type === "RESGATE" || type === "withdrawal";
}

export function isCashBoxYield(type: string) {
  return type === "RENDIMENTO" || type === "yield";
}

export function isCashBoxPositiveMovement(type: string) {
  return isCashBoxContribution(type) || isCashBoxYield(type) || type === "adjustment";
}

export function toCashBoxContributionType(type: string) {
  if (type === "DEPOSITO") return "contribution";
  if (type === "RESGATE") return "withdrawal";
  if (type === "RENDIMENTO") return "yield";
  return type;
}

export function getCashBoxMovementLabel(type: string) {
  const labels: Record<string, string> = {
    DEPOSITO: "Aporte",
    contribution: "Aporte",
    RESGATE: "Resgate",
    withdrawal: "Resgate",
    RENDIMENTO: "Rendimento",
    yield: "Rendimento",
    adjustment: "Ajuste"
  };

  return labels[type] ?? "Movimentacao";
}

export function calculateCashBoxTotals(cashBox: CashBoxRecord) {
  const movements = cashBox.movements ?? [];
  const movementContributions = movements.filter((movement) => isCashBoxContribution(movement.type)).reduce((total, movement) => total + movement.value, 0);
  const movementWithdrawals = movements.filter((movement) => isCashBoxWithdrawal(movement.type)).reduce((total, movement) => total + movement.value, 0);
  const movementYield = movements.filter((movement) => isCashBoxYield(movement.type)).reduce((total, movement) => total + movement.value, 0);
  const adjustments = movements.filter((movement) => movement.type === "adjustment").reduce((total, movement) => total + movement.value, 0);
  const initialBalance = cashBox.initialBalance ?? Math.max((cashBox.currentBalance ?? 0) - movementContributions + movementWithdrawals - movementYield - adjustments, 0);
  const totalContributions = cashBox.totalContributions ?? initialBalance + movementContributions;
  const totalWithdrawals = cashBox.totalWithdrawals ?? movementWithdrawals;
  const totalYield = cashBox.totalYield ?? movementYield;
  const currentBalance = cashBox.currentBalance ?? Math.max(initialBalance + movementContributions - movementWithdrawals + movementYield + adjustments, 0);

  return {
    initialBalance,
    currentBalance,
    totalContributions,
    totalWithdrawals,
    totalYield,
    profitability: totalContributions > 0 ? (totalYield / totalContributions) * 100 : 0
  };
}

export function normalizeCashBoxForPersistence(input: Omit<CashBoxRecord, "id"> | Partial<CashBoxRecord>) {
  const initialBalance = input.initialBalance ?? input.currentBalance ?? 0;
  const movements = input.movements ?? [];
  const base = {
    ...input,
    categoryId: input.categoryId ?? "cash",
    initialBalance,
    movements
  } as CashBoxRecord;
  const totals = calculateCashBoxTotals(base);

  return {
    ...input,
    categoryId: "cash",
    initialBalance: totals.initialBalance,
    currentBalance: totals.currentBalance,
    totalContributions: totals.totalContributions,
    totalWithdrawals: totals.totalWithdrawals,
    totalYield: totals.totalYield,
    lastYieldCalculationAt: input.lastYieldCalculationAt ?? input.createdAt
  };
}

export async function getCashBoxesOverview() {
  const cashBoxes = await listCashBoxes();
  const totals = cashBoxes.reduce(
    (summary, cashBox) => {
      const cashBoxTotals = calculateCashBoxTotals(cashBox);
      return {
        currentBalance: summary.currentBalance + cashBoxTotals.currentBalance,
        deposited: summary.deposited + cashBoxTotals.totalContributions,
        withdrawn: summary.withdrawn + cashBoxTotals.totalWithdrawals,
        yield: summary.yield + cashBoxTotals.totalYield
      };
    },
    { currentBalance: 0, deposited: 0, withdrawn: 0, yield: 0 }
  );
  const movements = cashBoxes
    .flatMap((cashBox) =>
      (cashBox.movements ?? []).map((movement) => ({
        ...movement,
        type: toCashBoxContributionType(movement.type),
        cashBoxId: cashBox.id,
        cashBoxName: cashBox.name
      }))
    )
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());

  return {
    totals: {
      ...totals,
      profitability: totals.deposited > 0 ? (totals.yield / totals.deposited) * 100 : 0
    },
    cashBoxes,
    history: movements,
    evolution: buildCashBoxEvolution(cashBoxes)
  };
}

export function buildCashBoxEvolution(cashBoxes: CashBoxRecord[]) {
  const movements = cashBoxes
    .flatMap((cashBox) =>
      (cashBox.movements ?? []).map((movement) => ({
        ...movement,
        cashBoxCreatedAt: cashBox.createdAt,
        initialBalance: cashBox.initialBalance ?? 0
      }))
    )
    .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
  let balance = cashBoxes.reduce((total, cashBox) => total + (cashBox.initialBalance ?? 0), 0);

  if (movements.length === 0 && balance > 0) {
    return [{ month: new Date().toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }), value: balance }];
  }

  return movements.map((movement) => {
    const type = toCashBoxContributionType(movement.type);
    if (type === "contribution" || type === "yield" || type === "adjustment") balance += movement.value;
    if (type === "withdrawal") balance -= movement.value;

    return {
      month: new Date(movement.date).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
      value: Math.max(balance, 0)
    };
  });
}

export async function addCashBoxMovement(cashBoxId: string, movement: CashBoxMovementRecord) {
  const cashBox = await findCashBoxById(cashBoxId);
  if (!cashBox) throw notFound("Cash box not found");
  if (movement.value <= 0) throw badRequest("Movement value must be greater than zero");

  const type = toCashBoxContributionType(movement.type);
  const totals = calculateCashBoxTotals(cashBox);

  if (type === "withdrawal" && movement.value > totals.currentBalance) {
    throw badRequest("Withdrawal cannot be greater than the current balance");
  }

  const nextMovements = [...(cashBox.movements ?? []), { ...movement, type } as CashBoxMovementRecord];
  const balanceDelta = type === "withdrawal" ? -movement.value : movement.value;
  const updated = await updateCashBox(cashBoxId, {
    movements: nextMovements,
    currentBalance: Math.max(totals.currentBalance + balanceDelta, 0),
    totalContributions: isCashBoxContribution(type) ? totals.totalContributions + movement.value : totals.totalContributions,
    totalWithdrawals: isCashBoxWithdrawal(type) ? totals.totalWithdrawals + movement.value : totals.totalWithdrawals,
    totalYield: isCashBoxYield(type) ? totals.totalYield + movement.value : totals.totalYield
  });

  if (!updated) throw notFound("Cash box not found");
  return updated;
}

export async function listCashBoxMovements(cashBoxId: string) {
  const cashBox = await findCashBoxById(cashBoxId);
  if (!cashBox) throw notFound("Cash box not found");

  return (cashBox.movements ?? [])
    .map((movement) => ({ ...movement, type: toCashBoxContributionType(movement.type), cashBoxId: cashBox.id, cashBoxName: cashBox.name }))
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
}

export async function listCashBoxYieldHistory(cashBoxId: string) {
  const cashBox = await findCashBoxById(cashBoxId);
  if (!cashBox) throw notFound("Cash box not found");
  return listCashBoxYields(cashBoxId);
}
