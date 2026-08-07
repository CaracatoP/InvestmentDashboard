import type { MonthlyExpenseRecord } from "../../types/management";

export type ExpenseStatusFilter = "all" | "pending" | "paid" | "future";
export type ExpenseDueStateKey = "paid" | "overdue" | "today" | "soon" | "future";

export interface ExpenseDueState {
  key: ExpenseDueStateKey;
  label: string;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function parseLocalDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function parseLocalDateTime(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

export function formatLocalDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

export function formatCompletedAt(value?: string | null) {
  if (!value) return "Pago";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return "Pago";
  return `Pago em ${match[3]}/${match[2]}/${match[1]} as ${match[4]}:${match[5]}`;
}

export function canMarkExpenseAsPaid(expense: MonthlyExpenseRecord) {
  return expense.status === "planned" && !expense.recurrenceCancelled;
}

export function matchesExpenseStatusFilter(expense: MonthlyExpenseRecord, filter: ExpenseStatusFilter, now = new Date()) {
  if (filter === "all") return true;
  if (filter === "paid") return expense.status === "completed";
  if (expense.status !== "planned") return false;

  const dueAt = parseLocalDateTime(expense.date, expense.time);
  return filter === "future" ? dueAt.getTime() > now.getTime() : dueAt.getTime() <= now.getTime();
}

export function getExpenseDueState(expense: MonthlyExpenseRecord, now = new Date()): ExpenseDueState {
  if (expense.status === "completed") {
    return { key: "paid", label: formatCompletedAt(expense.completedAt) };
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const dueDate = parseLocalDate(expense.date);
  const diffInDays = Math.round((dueDate.getTime() - today.getTime()) / 86_400_000);

  if (diffInDays < 0) {
    const days = Math.abs(diffInDays);
    return { key: "overdue", label: `Vencido ha ${days} ${days === 1 ? "dia" : "dias"}` };
  }
  if (diffInDays === 0) return { key: "today", label: "Vence hoje" };
  if (diffInDays === 1) return { key: "soon", label: "Vence amanha" };
  if (diffInDays <= 3) return { key: "soon", label: `Vence em ${diffInDays} dias` };
  return { key: "future", label: "Futuro" };
}

export function buildLocalTimestampFromDateTime(date: string, time: string) {
  const value = parseLocalDateTime(date, time);
  const offsetMinutes = -value.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const hours = Math.floor(absoluteOffset / 60);
  const minutes = absoluteOffset % 60;

  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}${sign}${pad(hours)}:${pad(minutes)}`;
}
