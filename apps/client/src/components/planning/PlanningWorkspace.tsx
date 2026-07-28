import { AlertTriangle, BarChart3, Bell, CalendarDays, ChevronLeft, ChevronRight, ClipboardCopy, Coins, CreditCard, Download, Plus, Search, Target, TrendingUp, WalletCards } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart } from "../charts/BarChart";
import { LineChart } from "../charts/LineChart";
import { AiAnalysisPanel } from "../ai/AiAnalysisPanel";
import { ConfirmDelete, areaClass, fieldClass, ManagementModal } from "../ui/Management";
import { PageHeader } from "../ui/PageHeader";
import { ProgressBar } from "../ui/ProgressBar";
import { MobileDataCard } from "../ui/Responsive";
import { StatCard } from "../ui/StatCard";
import { MoneyValue } from "../ui/ValueDisplay";
import { monthlyPlanningApi } from "../../services/api";
import type { MonthlyBudgetType, MonthlyExpenseRecord, MonthlyExpenseStatus, MonthlyFinancialGoalRecord, MonthlyPlanCategoryRecord, MonthlyPlanningOverview, MonthlyPlanRecord, MonthlyRecurrenceFrequency } from "../../types/management";
import { exportCsv, formatCents, formatPercentage, parseBrazilianMoneyToCents } from "../../utils/formatters";
import {
  ContributionGoalSummary,
  MissingIncomeState,
  PlanningInvestmentSummary,
  PlanningMonthlyProgress,
  PlanningOverviewSkeleton,
  PlanningPrimarySummary,
  PlanningQuickActions,
  PlanningSmartSummary
} from "./PlanningOverviewBlocks";
import { PlanningSubnav } from "./PlanningSubnav";

type CategoryForm = {
  id?: string;
  name: string;
  icon: string;
  color: string;
  budgetType: MonthlyBudgetType;
  percentage: number;
  fixedAmount: string;
};

type ExpenseForm = {
  description: string;
  amount: string;
  categoryId: string;
  date: string;
  time: string;
  note: string;
  paymentMethod: string;
  expenseType: "single" | "recurring";
  recurring: boolean;
  recurrenceFrequency: MonthlyRecurrenceFrequency;
  recurrenceInterval: number;
  recurrenceDayOfMonth: number;
  recurrenceStartDate: string;
  recurrenceEndDate: string;
  editScope: "single" | "series";
  status: MonthlyExpenseStatus;
  useCurrentMoment: boolean;
};

type GoalForm = {
  id?: string;
  name: string;
  target: string;
  saved: string;
  monthlyContribution: string;
  linkedSource: MonthlyFinancialGoalRecord["linkedSource"];
  linkedSourceId: string;
  active: boolean;
};

type CalendarEvent = MonthlyPlanningOverview["calendarDays"][number]["events"][number];

const categoryIcons = [
  { value: "home", label: "🏠 Moradia" },
  { value: "utensils", label: "🍽️ Alimentacao" },
  { value: "car", label: "🚗 Transporte" },
  { value: "smile", label: "🎮 Lazer" },
  { value: "trending-up", label: "📈 Investimentos" },
  { value: "heart", label: "❤️ Saude" },
  { value: "repeat", label: "🔁 Assinaturas" },
  { value: "book-open", label: "📚 Educacao" },
  { value: "tag", label: "🏷️ Outros" }
];

const categoryColors = ["#22c55e", "#38bdf8", "#a78bfa", "#f59e0b", "#fb7185", "#14b8a6", "#3b82f6", "#8b9491"];

const statusLabels: Record<MonthlyExpenseStatus, string> = {
  completed: "Realizado",
  planned: "Previsto"
};

const recurrenceFrequencyLabels: Record<MonthlyRecurrenceFrequency, string> = {
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
  annual: "Anual",
  custom: "Personalizado"
};

const comparisonRangeOptions = [
  { value: 1, label: "Ultimo mes" },
  { value: 3, label: "Ultimos 3 meses" },
  { value: 6, label: "Ultimos 6 meses" },
  { value: 12, label: "Ultimo ano" }
];

const paymentMethodLabels: Record<string, string> = {
  pix: "Pix",
  debito: "Debito",
  "débito": "Debito",
  credito: "Credito",
  "crédito": "Credito",
  dinheiro: "Dinheiro",
  conta: "Conta bancaria",
  "conta bancaria": "Conta bancaria",
  "conta bancária": "Conta bancaria"
};

const alertToneClass = {
  success: "border-accent/30 bg-accent/10 text-accent",
  warning: "border-amber/30 bg-amber/10 text-amber",
  danger: "border-rose/30 bg-rose/10 text-rose",
  info: "border-aqua/30 bg-aqua/10 text-aqua"
};

const eventToneClass: Record<string, string> = {
  salary: "bg-accent/15 text-accent",
  dividend: "bg-aqua/15 text-aqua",
  contribution: "bg-violet/15 text-violet",
  "recurring-expense": "bg-amber/15 text-amber",
  expense: "bg-rose/15 text-rose"
};

const eventTypeLabels: Record<string, string> = {
  salary: "Salario",
  dividend: "Dividendo",
  contribution: "Aporte",
  "recurring-expense": "Recorrente",
  expense: "Gasto"
};

const planningPageHeaders: Record<PlanningView, { title: string; description: string }> = {
  overview: {
    title: "Organizacao financeira do mes",
    description: "Uma visao limpa do mes, com resumo, alertas, insights e atalhos para as areas detalhadas."
  },
  budget: {
    title: "Orcamento mensal",
    description: "Configure renda, setores, porcentagens, valores fixos e copie o planejamento anterior."
  },
  expenses: {
    title: "Gastos do mes",
    description: "Cadastre, filtre e acompanhe gastos realizados, previstos e recorrentes."
  },
  calendar: {
    title: "Calendario financeiro",
    description: "Veja salario, gastos, recorrencias, aportes e dividendos distribuidos no mes."
  },
  goals: {
    title: "Objetivos financeiros",
    description: "Crie metas, acompanhe progresso e vincule objetivos a investimentos ou caixinhas."
  },
  analytics: {
    title: "Analises do planejamento",
    description: "Compare meses, entenda formas de pagamento e abra dashboards detalhados por setor."
  }
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function getLocalDateTimeFields(date = new Date()) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(absoluteOffset / 60);
  const offsetRemainder = absoluteOffset % 60;

  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    timestamp: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(offsetHours)}:${pad(offsetRemainder)}`
  };
}

function parseLocalDateTime(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function isFutureExpense(date: string, time: string) {
  return parseLocalDateTime(date, time).getTime() > Date.now();
}

function formatLocalDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function formatMonthLabel(year: number, month: number) {
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function shiftMonth(year: number, month: number, delta: number) {
  const date = new Date(year, month - 1 + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function formatMoneyInput(valueInCents: number) {
  return (valueInCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function iconLabel(icon: string) {
  return categoryIcons.find((item) => item.value === icon)?.label.split(" ")[0] ?? "🏷️";
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function categoryFormFromRecord(category?: MonthlyPlanCategoryRecord): CategoryForm {
  return {
    id: category?.id,
    name: category?.name ?? "",
    icon: category?.icon ?? "tag",
    color: category?.color ?? "#22c55e",
    budgetType: category?.budgetType ?? "percentage",
    percentage: category?.percentage ?? 0,
    fixedAmount: formatMoneyInput(category?.fixedAmountInCents ?? 0)
  };
}

function expenseFormFromRecord(expense?: MonthlyExpenseRecord, categoryId = ""): ExpenseForm {
  const now = getLocalDateTimeFields();
  const dayOfMonth = expense?.recurrenceDayOfMonth ?? Number((expense?.date ?? now.date).slice(8, 10));
  return {
    description: expense?.description ?? "",
    amount: formatMoneyInput(expense?.amountInCents ?? 0),
    categoryId: expense?.categoryId ?? categoryId,
    date: expense?.date ?? now.date,
    time: expense?.time ?? now.time,
    note: expense?.note ?? "",
    paymentMethod: expense?.paymentMethod ?? "",
    expenseType: expense?.expenseType ?? "single",
    recurring: expense?.recurring ?? false,
    recurrenceFrequency: expense?.recurrenceFrequency ?? "monthly",
    recurrenceInterval: expense?.recurrenceInterval ?? 1,
    recurrenceDayOfMonth: dayOfMonth,
    recurrenceStartDate: expense?.recurrenceStartDate ?? expense?.date ?? now.date,
    recurrenceEndDate: expense?.recurrenceEndDate ?? "",
    editScope: "single",
    status: expense?.status ?? "completed",
    useCurrentMoment: !expense
  };
}

function goalFormFromRecord(goal?: MonthlyFinancialGoalRecord): GoalForm {
  return {
    id: goal?.id,
    name: goal?.name ?? "",
    target: formatMoneyInput(goal?.targetInCents ?? 0),
    saved: formatMoneyInput(goal?.savedInCents ?? 0),
    monthlyContribution: formatMoneyInput(goal?.monthlyContributionInCents ?? 0),
    linkedSource: goal?.linkedSource ?? "manual",
    linkedSourceId: goal?.linkedSourceId ?? "",
    active: goal?.active ?? true
  };
}

function stateTone(state: string) {
  if (state === "over-limit") return "text-rose";
  if (state === "near-limit") return "text-amber";
  if (state === "attention") return "text-aqua";
  return "text-accent";
}

function centsToChartValue(valueInCents: number) {
  return Math.round(valueInCents) / 100;
}

function formatComparisonValue(value: number, valueType?: "money" | "percent") {
  return valueType === "percent" ? formatPercentage(value) : formatCents(value);
}

function variationTone(value: number) {
  if (value < 0) return "text-accent";
  if (value > 0) return "text-rose";
  return "text-muted";
}

function normalizePaymentMethodLabel(paymentMethod?: string | null) {
  const value = paymentMethod?.trim();
  if (!value) return "Nao informado";
  return paymentMethodLabels[value.toLowerCase()] ?? value;
}

export type PlanningView = "overview" | "budget" | "expenses" | "calendar" | "goals" | "analytics";

type PlanningWorkspaceProps = {
  view: PlanningView;
  categoryId?: string;
};

export function PlanningWorkspace({ view, categoryId }: PlanningWorkspaceProps) {
  const today = getLocalDateTimeFields();
  const [selected, setSelected] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [overview, setOverview] = useState<MonthlyPlanningOverview | null>(null);
  const [incomeInput, setIncomeInput] = useState("0,00");
  const [monthlyContributionGoalInput, setMonthlyContributionGoalInput] = useState("0,00");
  const [investmentSimulationInput, setInvestmentSimulationInput] = useState("0,00");
  const [includeDividendsAsIncome, setIncludeDividendsAsIncome] = useState(false);
  const [comparisonRange, setComparisonRange] = useState(1);
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState("Todos");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [paymentFilter, setPaymentFilter] = useState("Todos");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(categoryFormFromRecord());
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>(expenseFormFromRecord());
  const [goalForm, setGoalForm] = useState<GoalForm>(goalFormFromRecord());
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingExpense, setEditingExpense] = useState<MonthlyExpenseRecord | null>(null);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [deleteCategory, setDeleteCategory] = useState<MonthlyPlanCategoryRecord | null>(null);
  const [deleteExpense, setDeleteExpense] = useState<MonthlyExpenseRecord | null>(null);
  const [deleteExpenseSeries, setDeleteExpenseSeries] = useState<MonthlyExpenseRecord | null>(null);
  const [deleteGoal, setDeleteGoal] = useState<MonthlyFinancialGoalRecord | null>(null);
  const [categoryDetails, setCategoryDetails] = useState<MonthlyPlanningOverview["categories"][number] | null>(null);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadOverview(year = selected.year, month = selected.month) {
    const data = await monthlyPlanningApi.overview(year, month, comparisonRange);
    setOverview(data);
    setIncomeInput(formatMoneyInput(data.plan.incomeInCents));
    setMonthlyContributionGoalInput(formatMoneyInput(data.plan.monthlyContributionGoalInCents ?? 0));
    setInvestmentSimulationInput(formatMoneyInput(data.plan.investmentSimulationAmountInCents ?? 0));
    setIncludeDividendsAsIncome(data.plan.includeDividendsAsIncome ?? false);
    setSelectedCalendarDate((current) => current?.startsWith(`${year}-${pad(month)}`) ? current : data.calendarDays[0]?.date ?? `${year}-${pad(month)}-01`);
  }

  useEffect(() => {
    void loadOverview(selected.year, selected.month).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Falha ao carregar planejamento."));
  }, [comparisonRange, selected.month, selected.year]);

  const categoryById = useMemo(() => new Map(overview?.categories.map((category) => [category.id, category]) ?? []), [overview]);
  useEffect(() => {
    if (!categoryId || !overview) return;
    const category = categoryById.get(categoryId);
    if (category) setCategoryDetails(category);
  }, [categoryById, categoryId, overview]);

  const paymentOptions = useMemo(() => overview?.paymentMethodStats.map((item) => item.paymentMethod) ?? [], [overview?.paymentMethodStats]);
  const filteredExpenses = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (overview?.expenses ?? []).filter((expense) => {
      const category = categoryById.get(expense.categoryId);
      const matchesSearch = [expense.description, expense.note, expense.paymentMethod, category?.name].some((value) => value?.toLowerCase().includes(term));
      const matchesSector = sectorFilter === "Todos" || expense.categoryId === sectorFilter;
      const matchesStatus = statusFilter === "Todos" || expense.status === statusFilter;
      const matchesPayment = paymentFilter === "Todos" || normalizePaymentMethodLabel(expense.paymentMethod) === paymentFilter;
      const matchesFrom = !fromDate || expense.date >= fromDate;
      const matchesTo = !toDate || expense.date <= toDate;
      return matchesSearch && matchesSector && matchesStatus && matchesPayment && matchesFrom && matchesTo;
    });
  }, [categoryById, fromDate, overview?.expenses, paymentFilter, search, sectorFilter, statusFilter, toDate]);

  const selectedCalendarEvents = useMemo<CalendarEvent[]>(() => {
    if (!overview || !selectedCalendarDate) return [];
    return overview.calendarDays.find((day) => day.date === selectedCalendarDate)?.events ?? [];
  }, [overview, selectedCalendarDate]);

  const calendarCells = useMemo(() => {
    const firstDay = new Date(selected.year, selected.month - 1, 1).getDay();
    const totalDays = daysInMonth(selected.year, selected.month);
    return [
      ...Array.from({ length: firstDay }, (_, index) => ({ key: `empty-${index}`, date: "", day: "" })),
      ...Array.from({ length: totalDays }, (_, index) => {
        const day = index + 1;
        const date = `${selected.year}-${pad(selected.month)}-${pad(day)}`;
        return { key: date, date, day: String(day) };
      })
    ];
  }, [selected.month, selected.year]);

  const categoryPaymentChartData = useMemo(() => {
    if (!categoryDetails) return [];
    const totals = new Map<string, number>();
    for (const expense of overview?.expenses ?? []) {
      if (expense.categoryId !== categoryDetails.id) continue;
      const paymentMethod = normalizePaymentMethodLabel(expense.paymentMethod);
      totals.set(paymentMethod, (totals.get(paymentMethod) ?? 0) + expense.amountInCents);
    }
    return Array.from(totals.entries()).map(([paymentMethod, amount]) => ({ paymentMethod, value: centsToChartValue(amount) }));
  }, [categoryDetails, overview?.expenses]);

  const categoryEvolution = useMemo(() => overview?.categoryEvolution.find((item) => item.categoryId === categoryDetails?.id), [categoryDetails?.id, overview?.categoryEvolution]);
  const categoryMonthlyEvolutionChartData = useMemo(
    () => categoryEvolution?.monthly.map((item) => ({ month: item.month.slice(5, 7), value: centsToChartValue(item.amountInCents) })) ?? [],
    [categoryEvolution?.monthly]
  );
  const categoryAnnualEvolutionChartData = useMemo(
    () => categoryEvolution?.annual.map((item) => ({ year: item.year, value: centsToChartValue(item.amountInCents) })) ?? [],
    [categoryEvolution?.annual]
  );

  const categoryComparisonChartData = useMemo(() => {
    if (!categoryDetails) return [];
    const comparison = overview?.comparisons.find((item) => item.label === categoryDetails.name);
    return [
      { month: "Periodo anterior", value: centsToChartValue(comparison?.previousInCents ?? 0) },
      { month: "Mes atual", value: centsToChartValue(categoryDetails.completedInCents) }
    ];
  }, [categoryDetails, overview?.comparisons]);

  async function savePlanChanges(categories = overview?.plan.categories ?? [], overrides: Partial<MonthlyPlanRecord> = {}) {
    if (!overview) return;
    const incomeInCents = parseBrazilianMoneyToCents(incomeInput);
    if (incomeInCents === null) {
      setError("Informe uma renda mensal valida.");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      await monthlyPlanningApi.savePlan({
        ...overview.plan,
        ...overrides,
        incomeInCents,
        categories: overrides.categories ?? categories,
        goals: overrides.goals ?? overview.plan.goals ?? []
      });
      await loadOverview();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Falha ao salvar planejamento.");
    } finally {
      setIsSaving(false);
    }
  }

  function openCreateCategory() {
    setEditingCategoryId(null);
    setCategoryForm(categoryFormFromRecord());
    setIsCategoryModalOpen(true);
    setError("");
  }

  function openEditCategory(category: MonthlyPlanCategoryRecord) {
    setEditingCategoryId(category.id);
    setCategoryForm(categoryFormFromRecord(category));
    setIsCategoryModalOpen(true);
    setError("");
  }

  async function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!overview || isSaving) return;

    const fixedAmountInCents = categoryForm.budgetType === "fixed" ? parseBrazilianMoneyToCents(categoryForm.fixedAmount) : null;
    if (!categoryForm.name.trim()) {
      setError("Informe o nome do setor.");
      return;
    }
    if (categoryForm.budgetType === "fixed" && fixedAmountInCents === null) {
      setError("Informe um valor fixo valido.");
      return;
    }

    const baseId = editingCategoryId ?? (slugify(categoryForm.name) || `setor-${Date.now()}`);
    const category: MonthlyPlanCategoryRecord = {
      id: baseId,
      name: categoryForm.name.trim(),
      icon: categoryForm.icon,
      color: categoryForm.color,
      budgetType: categoryForm.budgetType,
      percentage: categoryForm.budgetType === "percentage" ? categoryForm.percentage : 0,
      fixedAmountInCents
    };
    const duplicate = overview.plan.categories.some((item) => item.id !== editingCategoryId && item.name.trim().toLowerCase() === category.name.toLowerCase());
    if (duplicate) {
      setError("Ja existe um setor com esse nome.");
      return;
    }

    const categories = editingCategoryId ? overview.plan.categories.map((item) => (item.id === editingCategoryId ? category : item)) : [...overview.plan.categories, category];
    await savePlanChanges(categories);
    setIsCategoryModalOpen(false);
    setEditingCategoryId(null);
  }

  async function confirmDeleteCategory() {
    if (!overview || !deleteCategory || isSaving) return;
    const categories = overview.plan.categories.filter((category) => category.id !== deleteCategory.id);
    setDeleteCategory(null);
    await savePlanChanges(categories);
  }

  function openCreateGoal() {
    setEditingGoalId(null);
    setGoalForm(goalFormFromRecord());
    setIsGoalModalOpen(true);
    setError("");
  }

  function openEditGoal(goal: MonthlyFinancialGoalRecord) {
    setEditingGoalId(goal.id);
    setGoalForm(goalFormFromRecord(goal));
    setIsGoalModalOpen(true);
    setError("");
  }

  async function submitGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!overview || isSaving) return;

    const targetInCents = parseBrazilianMoneyToCents(goalForm.target);
    const savedInCents = parseBrazilianMoneyToCents(goalForm.saved);
    const monthlyContributionInCents = parseBrazilianMoneyToCents(goalForm.monthlyContribution);

    if (!goalForm.name.trim()) {
      setError("Informe o nome do objetivo.");
      return;
    }
    if (!targetInCents || targetInCents <= 0 || savedInCents === null || monthlyContributionInCents === null) {
      setError("Informe valores validos para o objetivo.");
      return;
    }

    const goal: MonthlyFinancialGoalRecord = {
      id: editingGoalId ?? `goal-${Date.now()}`,
      name: goalForm.name.trim(),
      targetInCents,
      savedInCents,
      monthlyContributionInCents,
      linkedSource: goalForm.linkedSource,
      linkedSourceId: goalForm.linkedSourceId.trim(),
      active: goalForm.active
    };
    const goals = editingGoalId ? (overview.plan.goals ?? []).map((item) => (item.id === editingGoalId ? goal : item)) : [...(overview.plan.goals ?? []), goal];
    await savePlanChanges(overview.plan.categories, { goals });
    setIsGoalModalOpen(false);
    setEditingGoalId(null);
  }

  async function confirmDeleteGoal() {
    if (!overview || !deleteGoal || isSaving) return;
    const goals = (overview.plan.goals ?? []).filter((goal) => goal.id !== deleteGoal.id);
    setDeleteGoal(null);
    await savePlanChanges(overview.plan.categories, { goals });
  }

  async function submitInvestmentSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!overview || isSaving) return;

    const monthlyContributionGoalInCents = parseBrazilianMoneyToCents(monthlyContributionGoalInput);
    const investmentSimulationAmountInCents = parseBrazilianMoneyToCents(investmentSimulationInput);
    if (monthlyContributionGoalInCents === null || investmentSimulationAmountInCents === null) {
      setError("Informe valores validos para metas de investimento.");
      return;
    }

    await savePlanChanges(overview.plan.categories, {
      monthlyContributionGoalInCents,
      includeDividendsAsIncome,
      investmentSimulationAmountInCents
    });
  }

  function openCreateExpense(categoryId = "") {
    setEditingExpense(null);
    setExpenseForm(expenseFormFromRecord(undefined, categoryId || overview?.categories[0]?.id || ""));
    setIsExpenseModalOpen(true);
    setError("");
  }

  function openEditExpense(expense: MonthlyExpenseRecord) {
    setEditingExpense(expense);
    setExpenseForm(expenseFormFromRecord(expense));
    setIsExpenseModalOpen(true);
    setError("");
  }

  function updateUseCurrentMoment(useCurrentMoment: boolean) {
    const now = getLocalDateTimeFields();
    setExpenseForm((current) => ({
      ...current,
      useCurrentMoment,
      date: useCurrentMoment ? now.date : current.date,
      time: useCurrentMoment ? now.time : current.time,
      status: useCurrentMoment ? "completed" : current.status
    }));
  }

  async function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!overview?.plan.id || isSaving) return;

    const amountInCents = parseBrazilianMoneyToCents(expenseForm.amount);
    if (!expenseForm.description.trim()) {
      setError("Informe a descricao do gasto.");
      return;
    }
    if (!amountInCents || amountInCents <= 0) {
      setError("Informe um valor maior que zero.");
      return;
    }
    if (!expenseForm.categoryId) {
      setError("Selecione um setor.");
      return;
    }
    if (!expenseForm.date || !expenseForm.time) {
      setError("Informe data e horario.");
      return;
    }

    const now = getLocalDateTimeFields();
    const date = expenseForm.useCurrentMoment ? now.date : expenseForm.date;
    const time = expenseForm.useCurrentMoment ? now.time : expenseForm.time;
    const status: MonthlyExpenseStatus = isFutureExpense(date, time) ? "planned" : expenseForm.status;

    setIsSaving(true);
    setError("");
    try {
      const payload = {
        categoryId: expenseForm.categoryId,
        description: expenseForm.description.trim(),
        amountInCents,
        date,
        time,
        note: expenseForm.note.trim(),
        paymentMethod: expenseForm.paymentMethod.trim() || null,
        expenseType: expenseForm.recurring ? "recurring" as const : expenseForm.expenseType,
        recurring: expenseForm.recurring,
        recurrenceFrequency: expenseForm.recurring ? expenseForm.recurrenceFrequency : null,
        recurrenceInterval: expenseForm.recurring ? Math.max(Number(expenseForm.recurrenceInterval) || 1, 1) : null,
        recurrenceDayOfMonth: expenseForm.recurring ? Math.min(Math.max(Number(expenseForm.recurrenceDayOfMonth) || Number(date.slice(8, 10)), 1), 31) : null,
        recurrenceStartDate: expenseForm.recurring ? expenseForm.recurrenceStartDate || date : null,
        recurrenceEndDate: expenseForm.recurring ? expenseForm.recurrenceEndDate || null : null,
        status,
        createdAt: editingExpense?.createdAt ?? now.timestamp,
        updatedAt: now.timestamp
      };

      if (editingExpense?.id) await monthlyPlanningApi.updateExpense(editingExpense.id, payload, expenseForm.editScope);
      else await monthlyPlanningApi.createExpense(overview.plan.id, payload);

      setIsExpenseModalOpen(false);
      setEditingExpense(null);
      await loadOverview();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Falha ao salvar gasto.");
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmDeleteExpense() {
    if (!deleteExpense?.id || isSaving) return;
    setIsSaving(true);
    setError("");
    try {
      await monthlyPlanningApi.removeExpense(deleteExpense.id);
      setDeleteExpense(null);
      await loadOverview();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Falha ao excluir gasto.");
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmDeleteExpenseSeries() {
    if (!deleteExpenseSeries?.id || isSaving) return;
    setIsSaving(true);
    setError("");
    try {
      await monthlyPlanningApi.removeExpense(deleteExpenseSeries.id, "series");
      setDeleteExpenseSeries(null);
      await loadOverview();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Falha ao excluir recorrencia.");
    } finally {
      setIsSaving(false);
    }
  }

  function exportCategoryHistory(category: MonthlyPlanningOverview["categories"][number]) {
    const rows = (overview?.expenses ?? [])
      .filter((expense) => expense.categoryId === category.id)
      .map((expense) => ({
        data: formatLocalDate(expense.date),
        hora: expense.time,
        descricao: expense.description,
        pagamento: normalizePaymentMethodLabel(expense.paymentMethod),
        status: statusLabels[expense.status],
        valor: formatCents(expense.amountInCents)
      }));
    exportCsv(`planejamento-${category.name.toLowerCase()}-${selected.year}-${pad(selected.month)}.csv`, rows);
  }

  async function copyPrevious() {
    if (isSaving) return;
    setIsSaving(true);
    setError("");
    try {
      await monthlyPlanningApi.copyPrevious(selected.year, selected.month);
      await loadOverview();
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "Nao foi possivel copiar o mes anterior.");
    } finally {
      setIsSaving(false);
    }
  }

  const previousMonth = shiftMonth(selected.year, selected.month, -1);
  const nextMonth = shiftMonth(selected.year, selected.month, 1);
  const categoryDetailExpenses = useMemo(() => (overview?.expenses ?? []).filter((expense) => expense.categoryId === categoryDetails?.id), [categoryDetails?.id, overview?.expenses]);
  const categoryDetailAmounts = categoryDetailExpenses.map((expense) => expense.amountInCents);
  const categoryDetailTotal = categoryDetailAmounts.reduce((total, amount) => total + amount, 0);
  const categoryDetailAverage = categoryDetailExpenses.length > 0 ? Math.round(categoryDetailTotal / categoryDetailExpenses.length) : 0;
  const categoryDetailHighest = Math.max(0, ...categoryDetailAmounts);
  const categoryDetailLowest = categoryDetailAmounts.length > 0 ? Math.min(...categoryDetailAmounts) : 0;
  const pageHeader = planningPageHeaders[view];
  const isOverview = view === "overview";
  const isBudget = view === "budget";
  const isExpenses = view === "expenses";
  const isCalendar = view === "calendar";
  const isGoals = view === "goals";
  const isAnalytics = view === "analytics";
  const hasConfiguredIncome = (overview?.summary.incomeInCents ?? 0) > 0;
  const alertItems = isOverview ? (overview?.alerts ?? []).slice(0, 3) : (overview?.alerts ?? []);
  const insightItems = isOverview ? (overview?.insights ?? []).slice(0, 3) : (overview?.insights ?? []);

  return (
    <div>
      <PageHeader
        eyebrow="Planejamento Mensal"
        title={pageHeader.title}
        description={pageHeader.description}
      />
      <PlanningSubnav />

      <section className="mb-4 grid gap-3 rounded-lg border border-line bg-panel p-3 shadow-soft sm:p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button type="button" onClick={() => setSelected(previousMonth)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:text-ink">
            <ChevronLeft size={16} />
            {formatMonthLabel(previousMonth.year, previousMonth.month)}
          </button>
          <div className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent/10 px-4 text-sm font-semibold text-accent">
            <CalendarDays size={16} />
            {formatMonthLabel(selected.year, selected.month)}
          </div>
          <button type="button" onClick={() => setSelected(nextMonth)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:text-ink">
            {formatMonthLabel(nextMonth.year, nextMonth.month)}
            <ChevronRight size={16} />
          </button>
        </div>
        {isBudget ? (
          <button type="button" onClick={() => void copyPrevious()} disabled={isSaving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-4 text-sm text-muted transition hover:border-accent/60 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60">
            <ClipboardCopy size={16} />
            Copiar mes anterior
          </button>
        ) : null}
      </section>

      {error ? <p className="mb-4 rounded-lg border border-amber/30 bg-amber/10 px-3 py-2 text-sm text-amber">{error}</p> : null}

      {isBudget ? (
        <section className="mb-4 grid gap-3 rounded-lg border border-line bg-panel p-3 shadow-soft sm:p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <label className="grid gap-1 text-sm text-muted">
            Renda mensal disponivel
            <input value={incomeInput} onChange={(event) => setIncomeInput(event.target.value)} className={fieldClass} placeholder="Ex.: 3.500,00" inputMode="decimal" />
          </label>
          <button type="button" onClick={() => void savePlanChanges()} disabled={isSaving || !overview} className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-lg bg-accent px-4 text-sm font-medium text-black transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60">
            <WalletCards size={16} />
            Salvar renda
          </button>
        </section>
      ) : null}

      {overview ? (
        <>
          {isOverview ? (
            <>
              <PlanningPrimarySummary overview={overview} hasConfiguredIncome={hasConfiguredIncome} />
              {!hasConfiguredIncome ? <MissingIncomeState /> : null}
              <section className="mb-4 grid gap-4 lg:grid-cols-2">
                <PlanningMonthlyProgress overview={overview} hasConfiguredIncome={hasConfiguredIncome} />
                <ContributionGoalSummary overview={overview} hasConfiguredIncome={hasConfiguredIncome} />
              </section>
              <PlanningSmartSummary alerts={alertItems} insights={insightItems} hasConfiguredIncome={hasConfiguredIncome} />
              <AiAnalysisPanel year={selected.year} month={selected.month} analysisType="complete" compact />
              <PlanningQuickActions onAddExpense={() => openCreateExpense()} />
              <PlanningInvestmentSummary overview={overview} />
            </>
          ) : null}

          {isBudget ? (
          <section className="stat-card-grid stat-card-grid--wide mb-4">
            <StatCard label="Renda mensal" value={formatCents(overview.summary.incomeInCents)} icon={<Coins size={18} />} />
            <StatCard label="Total planejado" value={formatCents(overview.summary.totalPlannedInCents)} icon={<WalletCards size={18} />} tone="blue" />
            <StatCard label="Gasto realizado" value={formatCents(overview.summary.completedInCents)} icon={<Coins size={18} />} tone="amber" />
            <StatCard label="Gastos previstos" value={formatCents(overview.summary.plannedExpensesInCents)} icon={<CalendarDays size={18} />} tone="violet" />
            <StatCard label="Restante atual" value={formatCents(overview.summary.remainingIncomeInCents)} detail="Restante da renda apos gastos realizados" icon={<Coins size={18} />} tone={overview.summary.remainingIncomeInCents < 0 ? "rose" : "green"} />
            <StatCard label="Restante do orcamento" value={formatCents(overview.summary.remainingBudgetInCents)} detail="Total planejado menos gastos realizados" icon={<WalletCards size={18} />} tone={overview.summary.remainingBudgetInCents < 0 ? "rose" : "blue"} />
            <StatCard label="Restante apos previstos" value={formatCents(overview.summary.remainingIncomeAfterPlannedInCents)} detail="Saldo disponivel apos gastos previstos" icon={<CalendarDays size={18} />} tone={overview.summary.remainingIncomeAfterPlannedInCents < 0 ? "rose" : "blue"} />
            <StatCard label="Renda utilizada" value={formatPercentage(overview.summary.usedIncomePercent)} detail="Percentual da renda gasto ate agora" icon={<AlertTriangle size={18} />} tone={overview.summary.usedIncomePercent > 100 ? "rose" : "amber"} />
          </section>
          ) : null}

          {isAnalytics ? (
          <>
            <AiAnalysisPanel year={selected.year} month={selected.month} analysisType="planning" showTypeSelector title="Analises com IA" description="Escolha o tipo de analise e gere uma leitura contextual do seu planejamento." />
            <section className="mb-4 grid gap-4 lg:grid-cols-2">
              <article className="rounded-lg border border-line bg-panel p-4 shadow-soft">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-ink">Central de alertas</h2>
                    <p className="mt-1 text-sm text-muted">Avisos gerados automaticamente pelos dados do mes.</p>
                  </div>
                  <Bell size={18} className="text-accent" />
                </div>
                <div className="mt-3 grid gap-2">
                  {alertItems.length > 0 ? alertItems.map((alert) => (
                    <p key={alert.id} className={`rounded-lg border px-3 py-2 text-sm ${alertToneClass[alert.type]}`}>{alert.message}</p>
                  )) : <p className="rounded-lg bg-elevated px-3 py-3 text-sm text-muted">Nenhum alerta para este mes.</p>}
                </div>
              </article>
              <article className="rounded-lg border border-line bg-panel p-4 shadow-soft">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-ink">Resumo Inteligente</h2>
                    <p className="mt-1 text-sm text-muted">Insights calculados a partir dos gastos, aportes e dividendos.</p>
                  </div>
                  <BarChart3 size={18} className="text-aqua" />
                </div>
                <div className="mt-3 grid gap-2">
                  {insightItems.length > 0 ? insightItems.map((insight) => (
                    <p key={insight} className="rounded-lg bg-elevated px-3 py-2 text-sm text-muted">{insight}</p>
                  )) : <p className="rounded-lg bg-elevated px-3 py-3 text-sm text-muted">Lance gastos e metas para gerar insights automaticos.</p>}
                </div>
              </article>
            </section>
          </>
          ) : null}

          {isGoals ? (
          <form onSubmit={submitInvestmentSettings} className="mb-4 grid gap-3 rounded-lg border border-line bg-panel p-3 shadow-soft sm:p-4 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
            <label className="grid gap-1 text-sm text-muted">
              Meta mensal de aporte
              <input value={monthlyContributionGoalInput} onChange={(event) => setMonthlyContributionGoalInput(event.target.value)} className={fieldClass} placeholder="Ex.: 1.500,00" inputMode="decimal" />
            </label>
            <label className="grid gap-1 text-sm text-muted">
              Simular aporte extra
              <input value={investmentSimulationInput} onChange={(event) => setInvestmentSimulationInput(event.target.value)} className={fieldClass} placeholder="Ex.: 500,00" inputMode="decimal" />
            </label>
            <label className="flex min-h-11 items-center gap-2 self-end rounded-lg border border-line bg-elevated px-3 text-sm text-muted">
              <input type="checkbox" checked={includeDividendsAsIncome} onChange={(event) => setIncludeDividendsAsIncome(event.target.checked)} className="h-4 w-4 accent-accent" />
              Dividendos como renda
            </label>
            <div className="grid gap-1 text-sm text-muted">
              Carteira
              <p className="rounded-lg bg-elevated px-3 py-2 text-ink"><MoneyValue value={formatCents(overview.investmentSummary.totalWealthInCents)} /></p>
            </div>
            <button type="submit" disabled={isSaving} className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-lg bg-accent px-4 text-sm font-medium text-black transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60">
              <TrendingUp size={16} />
              Salvar
            </button>
          </form>
          ) : null}

          {isGoals ? (
          <section className="stat-card-grid stat-card-grid--wide mb-4">
            <StatCard label="Patrimonio" value={formatCents(overview.investmentSummary.totalWealthInCents)} icon={<TrendingUp size={18} />} tone="green" />
            <StatCard label="Rentabilidade" value={formatPercentage(overview.investmentSummary.profitabilityPercent)} icon={<TrendingUp size={18} />} tone="blue" />
            <StatCard label="Dividend Yield mensal" value={formatPercentage(overview.investmentSummary.monthlyDividendYieldPercent)} icon={<Coins size={18} />} tone="violet" />
            <StatCard label="Aportes do mes" value={formatCents(overview.investmentSummary.contributionsThisMonthInCents)} icon={<Target size={18} />} tone="amber" />
            <StatCard label="Dividendos do mes" value={formatCents(overview.investmentSummary.dividendsThisMonthInCents)} icon={<Coins size={18} />} tone="green" />
            <StatCard label="Com aporte extra" value={formatCents(overview.investmentSummary.simulatedContributionTotalInCents)} detail={`${formatPercentage(overview.investmentSummary.simulatedContributionGoalPercent)} da meta`} icon={<TrendingUp size={18} />} tone="blue" />
          </section>
          ) : null}

          {isBudget ? (
          <section className="mb-4 rounded-lg border border-line bg-panel p-3 shadow-soft sm:p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-base font-semibold text-ink">Controle das porcentagens</h2>
                <p className="mt-1 text-sm text-muted">
                  Total distribuido: {formatPercentage(overview.summary.allocatedPercentage)} · Ainda disponivel: {formatPercentage(overview.summary.unallocatedPercentage)}
                </p>
              </div>
              <button type="button" onClick={openCreateCategory} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-black transition hover:bg-accent/90">
                <Plus size={16} />
                Novo setor
              </button>
            </div>
            {overview.warnings.length > 0 ? (
              <div className="mt-3 grid gap-2">
                {overview.warnings.map((warning) => (
                  <p key={warning} className="inline-flex items-center gap-2 rounded-lg bg-amber/10 px-3 py-2 text-sm text-amber">
                    <AlertTriangle size={16} />
                    {warning}
                  </p>
                ))}
              </div>
            ) : null}
          </section>
          ) : null}

          {(isBudget || isAnalytics) ? (
          <section className="mb-5 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {overview.categories.map((category) => (
              <article key={category.id} className="min-w-0 rounded-lg border border-line bg-panel p-4 shadow-soft">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-lg" style={{ background: `${category.color}22`, color: category.color }}>
                      {iconLabel(category.icon)}
                    </div>
                    <div className="min-w-0">
                      <button type="button" onClick={() => setCategoryDetails(category)} className="truncate text-left font-semibold text-ink outline-none transition hover:text-accent focus-visible:text-accent" aria-label={`Abrir dashboard do setor ${category.name}`}>{category.name}</button>
                      <p className={`mt-1 text-xs ${stateTone(category.state)}`}>{category.stateLabel}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-elevated px-2 py-1 text-xs text-muted">{category.budgetType === "percentage" ? `${category.percentage}%` : "Fixo"}</span>
                </div>
                <div className="mt-4 grid gap-2 text-sm text-muted">
                  <p className="flex justify-between gap-3"><span>Planejado</span><span className="text-ink"><MoneyValue value={formatCents(category.limitInCents)} /></span></p>
                  {category.budgetType === "fixed" ? <p className="flex justify-between gap-3"><span>% da renda</span><span className="text-ink">{formatPercentage(category.plannedPercentOfIncome)}</span></p> : null}
                  <p className="flex justify-between gap-3"><span>Gasto realizado</span><span className="text-ink"><MoneyValue value={formatCents(category.completedInCents)} /></span></p>
                  <p className="flex justify-between gap-3"><span>Gasto previsto</span><span className="text-ink"><MoneyValue value={formatCents(category.plannedInCents)} /></span></p>
                  <p className="flex justify-between gap-3"><span>Restante atual</span><span className={category.remainingInCents < 0 ? "text-rose" : "text-accent"}><MoneyValue value={formatCents(category.remainingInCents)} /></span></p>
                  <p className="flex justify-between gap-3"><span>Restante apos previstos</span><span className={category.remainingAfterPlannedInCents < 0 ? "text-rose" : "text-ink"}><MoneyValue value={formatCents(category.remainingAfterPlannedInCents)} /></span></p>
                </div>
                <div className="mt-4">
                  <ProgressBar value={Math.min(category.usedPercent, 100)} tone={category.state === "over-limit" || category.state === "near-limit" ? "amber" : category.state === "ok" ? "green" : "blue"} />
                  <p className="mt-2 text-xs text-muted">Utilizado: {formatPercentage(category.usedPercent)}</p>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {isOverview ? (
                    <>
                      <Link to="/planejamento-mensal/gastos" onClick={() => setSectorFilter(category.id)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-accent/50 hover:text-ink">
                        <Search size={15} />
                        Ver gastos
                      </Link>
                      <Link to={`/planejamento-mensal/analises/categoria/${category.id}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-accent/50 hover:text-ink">
                        <BarChart3 size={15} />
                        Analises
                      </Link>
                    </>
                  ) : null}
                  {isBudget ? (
                    <>
                      <button type="button" onClick={() => openEditCategory(category)} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-accent/50 hover:text-ink">
                        Editar
                      </button>
                      <button type="button" onClick={() => setDeleteCategory(category)} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-rose/50 hover:text-rose">
                        Excluir
                      </button>
                    </>
                  ) : null}
                  {isAnalytics ? (
                    <button type="button" onClick={() => setCategoryDetails(category)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-accent/50 hover:text-ink sm:col-span-2">
                      <BarChart3 size={15} />
                      Dashboard detalhado
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </section>
          ) : null}

          {isAnalytics ? (
          <section className="mb-4 grid gap-4 lg:grid-cols-2">
            <article className="rounded-lg border border-line bg-panel p-4 shadow-soft">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-ink">Comparacao com meses anteriores</h2>
                  <p className="mt-1 text-sm text-muted">Totais, economia, renda, aportes e setores.</p>
                </div>
                <select value={comparisonRange} onChange={(event) => setComparisonRange(Number(event.target.value))} className={fieldClass}>
                  {comparisonRangeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="mt-4 grid gap-2">
                {overview.comparisons.length > 0 ? overview.comparisons.map((comparison) => (
                  <div key={comparison.label} className="grid gap-2 rounded-lg bg-elevated px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                    <span className="font-medium text-ink">{comparison.label}</span>
                    <span className="text-muted">{formatComparisonValue(comparison.previousInCents, comparison.valueType)} → {formatComparisonValue(comparison.currentInCents, comparison.valueType)}</span>
                    <span className={variationTone(comparison.variationPercent)}>{comparison.variationPercent > 0 ? "▲" : comparison.variationPercent < 0 ? "▼" : "•"} {formatPercentage(Math.abs(comparison.variationPercent))}</span>
                  </div>
                )) : <p className="rounded-lg bg-elevated px-3 py-3 text-sm text-muted">Sem mes anterior configurado para comparar.</p>}
              </div>
            </article>

            <article className="rounded-lg border border-line bg-panel p-4 shadow-soft">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-ink">Formas de pagamento</h2>
                  <p className="mt-1 text-sm text-muted">Estatisticas automaticas e filtro do historico.</p>
                </div>
                <CreditCard size={18} className="text-aqua" />
              </div>
              <div className="mt-4 grid gap-2">
                {overview.paymentMethodStats.length > 0 ? overview.paymentMethodStats.map((item) => (
                  <button key={item.paymentMethod} type="button" onClick={() => setPaymentFilter(item.paymentMethod)} className="grid min-h-11 gap-2 rounded-lg bg-elevated px-3 py-2 text-left text-sm transition hover:text-ink sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                    <span className="font-medium text-ink">{item.paymentMethod}</span>
                    <span className="text-muted">{item.count} lanc.</span>
                    <span className="font-medium text-ink"><MoneyValue value={formatCents(item.amountInCents)} /></span>
                  </button>
                )) : <p className="rounded-lg bg-elevated px-3 py-3 text-sm text-muted">Nenhuma forma de pagamento registrada.</p>}
              </div>
            </article>
          </section>
          ) : null}

          {isCalendar ? (
          <section className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
            <article className="rounded-lg border border-line bg-panel p-4 shadow-soft">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-ink">Calendario financeiro</h2>
                  <p className="mt-1 text-sm text-muted">Gastos, salario, dividendos, aportes e contas recorrentes.</p>
                </div>
                <CalendarDays size={18} className="text-accent" />
              </div>
              <div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs text-muted">
                {["D", "S", "T", "Q", "Q", "S", "S"].map((weekday, index) => <span key={`${weekday}-${index}`}>{weekday}</span>)}
                {calendarCells.map((cell) => {
                  const events = cell.date ? overview.calendarDays.find((day) => day.date === cell.date)?.events ?? [] : [];
                  return (
                    <button key={cell.key} type="button" disabled={!cell.date} onClick={() => setSelectedCalendarDate(cell.date)} className={`min-h-16 rounded-lg border border-line bg-elevated px-2 py-2 text-left transition disabled:opacity-0 ${selectedCalendarDate === cell.date ? "border-accent text-accent" : "text-muted hover:text-ink"}`}>
                      <span className="text-sm font-medium">{cell.day}</span>
                      <span className="mt-2 flex flex-wrap gap-1">
                        {events.slice(0, 4).map((event) => <span key={event.id} className={`h-2 w-2 rounded-full ${eventToneClass[event.type] ?? "bg-muted"}`} title={event.label} />)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </article>

            <article className="rounded-lg border border-line bg-panel p-4 shadow-soft">
              <h2 className="text-base font-semibold text-ink">{selectedCalendarDate ? `Eventos de ${formatLocalDate(selectedCalendarDate)}` : "Eventos do dia"}</h2>
              <div className="mt-4 grid gap-2">
                {selectedCalendarEvents.length > 0 ? selectedCalendarEvents.map((event) => (
                  <div key={`${event.type}-${event.id}`} className="rounded-lg bg-elevated px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className={`rounded-full px-2 py-1 text-xs ${eventToneClass[event.type] ?? "bg-line text-muted"}`}>{eventTypeLabels[event.type] ?? event.type}</span>
                      <span className="font-medium text-ink"><MoneyValue value={formatCents(event.amountInCents)} /></span>
                    </div>
                    <p className="mt-2 text-muted">{event.label}</p>
                    {event.status ? <p className="mt-1 text-xs text-muted">{event.status === "planned" ? "Previsto" : "Realizado"}</p> : null}
                  </div>
                )) : <p className="rounded-lg bg-elevated px-3 py-3 text-sm text-muted">Nenhum evento neste dia.</p>}
              </div>
            </article>
          </section>
          ) : null}

          {isGoals ? (
          <section className="mb-4 rounded-lg border border-line bg-panel p-4 shadow-soft">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-ink">Objetivos</h2>
                <p className="mt-1 text-sm text-muted">Metas financeiras vinculadas ao planejamento, carteira ou caixinhas.</p>
              </div>
              <button type="button" onClick={openCreateGoal} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-black transition hover:bg-accent/90">
                <Plus size={16} />
                Novo objetivo
              </button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {(overview.plan.goals ?? []).length > 0 ? (overview.plan.goals ?? []).map((goal) => {
                const progress = goal.targetInCents > 0 ? Math.min((goal.savedInCents / goal.targetInCents) * 100, 100) : 0;
                return (
                  <article key={goal.id} className="rounded-lg border border-line bg-elevated p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-ink">{goal.name}</h3>
                        <p className="mt-1 text-xs text-muted">{goal.linkedSource === "portfolio" ? "Vinculado a carteira" : goal.linkedSource === "cashbox" ? "Vinculado a caixinha" : "Manual"}</p>
                      </div>
                      <span className="rounded-full bg-panel px-2 py-1 text-xs text-muted">{goal.active ? "Ativo" : "Pausado"}</span>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-muted">
                      <p className="flex justify-between gap-3"><span>Meta</span><span className="text-ink"><MoneyValue value={formatCents(goal.targetInCents)} /></span></p>
                      <p className="flex justify-between gap-3"><span>Guardado</span><span className="text-ink"><MoneyValue value={formatCents(goal.savedInCents)} /></span></p>
                      <p className="flex justify-between gap-3"><span>Aporte vinculado</span><span className="text-ink"><MoneyValue value={formatCents(goal.monthlyContributionInCents ?? 0)} /></span></p>
                    </div>
                    <div className="mt-3">
                      <ProgressBar value={progress} tone={progress >= 100 ? "green" : "blue"} />
                      <p className="mt-2 text-xs text-muted">{formatPercentage(progress)} concluido</p>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <button type="button" onClick={() => openEditGoal(goal)} className="min-h-11 rounded-lg border border-line bg-panel px-3 text-sm text-muted transition hover:text-ink">Editar</button>
                      <button type="button" onClick={() => setDeleteGoal(goal)} className="min-h-11 rounded-lg border border-line bg-panel px-3 text-sm text-muted transition hover:text-rose">Excluir</button>
                    </div>
                  </article>
                );
              }) : <p className="rounded-lg bg-elevated px-3 py-4 text-sm text-muted md:col-span-2 xl:col-span-3">Nenhum objetivo cadastrado.</p>}
            </div>
          </section>
          ) : null}

          {isExpenses ? (
          <>
          <section className="mb-4 flex flex-col gap-3 rounded-lg border border-line bg-panel p-3 shadow-soft sm:p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-base font-semibold text-ink">Historico de gastos</h2>
                <p className="mt-1 text-sm text-muted">Edite, filtre e acompanhe todos os gastos deste planejamento mensal.</p>
              </div>
              <button type="button" onClick={() => openCreateExpense()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-black transition hover:bg-accent/90">
                <Plus size={16} />
                Adicionar gasto
              </button>
            </div>
            <div className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_minmax(10rem,0.35fr)_minmax(9rem,0.25fr)_minmax(9rem,0.25fr)_minmax(9rem,0.25fr)_minmax(9rem,0.25fr)]">
              <label className="relative min-w-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 w-full rounded-lg border border-line bg-elevated pl-9 pr-3 text-base text-ink outline-none transition focus:border-accent sm:text-sm" placeholder="Pesquisar descricao, setor ou observacao" />
              </label>
              <select value={sectorFilter} onChange={(event) => setSectorFilter(event.target.value)} className={fieldClass}>
                <option>Todos</option>
                {overview.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={fieldClass}>
                <option>Todos</option>
                <option value="completed">Realizado</option>
                <option value="planned">Previsto</option>
              </select>
              <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)} className={fieldClass}>
                <option>Todos</option>
                {paymentOptions.map((paymentMethod) => <option key={paymentMethod} value={paymentMethod}>{paymentMethod}</option>)}
              </select>
              <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className={fieldClass} aria-label="Data inicial" />
              <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className={fieldClass} aria-label="Data final" />
            </div>
          </section>

          <section className="rounded-lg border border-line bg-panel p-3 shadow-soft sm:p-4">
            <div className="space-y-3 md:hidden">
              {filteredExpenses.map((expense) => {
                const category = categoryById.get(expense.categoryId);
                return (
                  <MobileDataCard key={expense.id ?? `${expense.date}-${expense.time}-${expense.description}`} title={<MoneyValue value={formatCents(expense.amountInCents)} size="card" />} subtitle={`${formatLocalDate(expense.date)} as ${expense.time}`} badge={statusLabels[expense.status]}>
                    <div className="grid gap-2 text-sm text-muted">
                      <p className="font-medium text-ink">{expense.description}</p>
                      <p>Setor: {category?.name ?? "Setor removido"}</p>
                      <p>Pagamento: {expense.paymentMethod || "Nao informado"}</p>
                      {expense.recurring ? <p>Recorrencia: {recurrenceFrequencyLabels[expense.recurrenceFrequency ?? "monthly"]}</p> : null}
                      {expense.note ? <p>Observacao: {expense.note}</p> : null}
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <button type="button" onClick={() => openEditExpense(expense)} className="min-h-11 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:text-ink">Editar</button>
                      <button type="button" onClick={() => setDeleteExpense(expense)} className="min-h-11 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:text-rose">Excluir</button>
                      {expense.recurring ? <button type="button" onClick={() => setDeleteExpenseSeries(expense)} className="min-h-11 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:text-rose sm:col-span-2">Excluir recorrencia</button> : null}
                    </div>
                  </MobileDataCard>
                );
              })}
            </div>
            <div className="scrollbar-thin hidden overflow-x-auto md:block">
              <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.14em] text-muted">
                  <tr className="border-b border-line">
                    <th className="py-3 font-medium">Data</th>
                    <th className="py-3 font-medium">Hora</th>
                    <th className="py-3 font-medium">Descricao</th>
                    <th className="py-3 font-medium">Setor</th>
                    <th className="py-3 font-medium">Pagamento</th>
                    <th className="py-3 font-medium">Status</th>
                    <th className="py-3 text-right font-medium">Valor</th>
                    <th className="py-3 text-right font-medium">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.map((expense) => {
                    const category = categoryById.get(expense.categoryId);
                    return (
                      <tr key={expense.id ?? `${expense.date}-${expense.time}-${expense.description}`} className="border-b border-line/70 text-muted">
                        <td className="py-3">{formatLocalDate(expense.date)}</td>
                        <td className="py-3">{expense.time}</td>
                        <td className="max-w-64 py-3">
                          <p className="truncate font-medium text-ink">{expense.description}</p>
                          <p className="truncate text-xs">{expense.recurring ? `Recorrente · ${recurrenceFrequencyLabels[expense.recurrenceFrequency ?? "monthly"]}` : expense.note || "Unico"}</p>
                          {expense.note && expense.recurring ? <p className="truncate text-xs">{expense.note}</p> : null}
                        </td>
                        <td className="py-3">{category?.name ?? "Setor removido"}</td>
                        <td className="py-3">{expense.paymentMethod || "Nao informado"}</td>
                        <td className="py-3">{statusLabels[expense.status]}</td>
                        <td className="py-3 text-right font-medium text-ink"><MoneyValue value={formatCents(expense.amountInCents)} size="table" /></td>
                        <td className="py-3">
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => openEditExpense(expense)} className="min-h-11 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:text-ink">Editar</button>
                            <button type="button" onClick={() => setDeleteExpense(expense)} className="min-h-11 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:text-rose">Excluir</button>
                            {expense.recurring ? <button type="button" onClick={() => setDeleteExpenseSeries(expense)} className="min-h-11 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:text-rose">Serie</button> : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredExpenses.length === 0 ? <p className="rounded-lg bg-elevated px-3 py-4 text-sm text-muted">Nenhum gasto encontrado para os filtros atuais.</p> : null}
            </div>
          </section>
          </>
          ) : null}
        </>
      ) : (
        isOverview ? <PlanningOverviewSkeleton /> : <p className="rounded-lg border border-line bg-panel p-4 text-sm text-muted">Carregando planejamento mensal...</p>
      )}

      <ManagementModal title={editingCategoryId ? "Editar setor" : "Novo setor"} isOpen={isCategoryModalOpen} onClose={() => setIsCategoryModalOpen(false)} onSubmit={submitCategory} submitDisabled={isSaving} submitLabel={isSaving ? "Salvando..." : "Salvar"}>
        <input required value={categoryForm.name} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} className={fieldClass} placeholder="Nome do setor" />
        <div className="grid gap-3 sm:grid-cols-2">
          <select value={categoryForm.icon} onChange={(event) => setCategoryForm((current) => ({ ...current, icon: event.target.value }))} className={fieldClass}>
            {categoryIcons.map((icon) => <option key={icon.value} value={icon.value}>{icon.label}</option>)}
          </select>
          <select value={categoryForm.color} onChange={(event) => setCategoryForm((current) => ({ ...current, color: event.target.value }))} className={fieldClass}>
            {categoryColors.map((color) => <option key={color} value={color}>{color}</option>)}
          </select>
        </div>
        <select value={categoryForm.budgetType} onChange={(event) => setCategoryForm((current) => ({ ...current, budgetType: event.target.value as MonthlyBudgetType }))} className={fieldClass}>
          <option value="percentage">Por porcentagem</option>
          <option value="fixed">Por valor fixo</option>
        </select>
        {categoryForm.budgetType === "percentage" ? (
          <input type="number" min="0" step="0.01" value={categoryForm.percentage} onChange={(event) => setCategoryForm((current) => ({ ...current, percentage: Number(event.target.value) }))} className={fieldClass} placeholder="Porcentagem planejada" />
        ) : (
          <input value={categoryForm.fixedAmount} onChange={(event) => setCategoryForm((current) => ({ ...current, fixedAmount: event.target.value }))} className={fieldClass} placeholder="Valor fixo em reais" inputMode="decimal" />
        )}
      </ManagementModal>

      <ManagementModal title={editingExpense ? "Editar gasto" : "Adicionar gasto"} isOpen={isExpenseModalOpen} onClose={() => setIsExpenseModalOpen(false)} onSubmit={submitExpense} submitDisabled={isSaving} submitLabel={isSaving ? "Salvando..." : "Salvar"}>
        <input required value={expenseForm.description} onChange={(event) => setExpenseForm((current) => ({ ...current, description: event.target.value }))} className={fieldClass} placeholder="Descricao" />
        <input required value={expenseForm.amount} onChange={(event) => setExpenseForm((current) => ({ ...current, amount: event.target.value }))} className={fieldClass} placeholder="Valor" inputMode="decimal" />
        <select required value={expenseForm.categoryId} onChange={(event) => setExpenseForm((current) => ({ ...current, categoryId: event.target.value }))} className={fieldClass}>
          <option value="">Selecione o setor</option>
          {overview?.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
        <fieldset className="rounded-lg border border-line bg-elevated px-3 py-3 text-sm text-muted">
          <legend className="px-1 text-xs uppercase tracking-[0.14em]">Momento do gasto</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2">
              <input type="radio" checked={expenseForm.useCurrentMoment} onChange={() => updateUseCurrentMoment(true)} className="h-4 w-4 accent-accent" />
              Agora
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={!expenseForm.useCurrentMoment} onChange={() => updateUseCurrentMoment(false)} className="h-4 w-4 accent-accent" />
              Escolher data e horario
            </label>
          </div>
        </fieldset>
        {!expenseForm.useCurrentMoment ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <input type="date" required value={expenseForm.date} onChange={(event) => setExpenseForm((current) => ({ ...current, date: event.target.value, status: isFutureExpense(event.target.value, current.time) ? "planned" : current.status }))} className={fieldClass} />
            <input type="time" required value={expenseForm.time} onChange={(event) => setExpenseForm((current) => ({ ...current, time: event.target.value, status: isFutureExpense(current.date, event.target.value) ? "planned" : current.status }))} className={fieldClass} />
          </div>
        ) : (
          <p className="rounded-lg bg-elevated px-3 py-2 text-sm text-muted">Sera registrado com a data e horario atuais: {formatLocalDate(today.date)} as {today.time}.</p>
        )}
        <select value={expenseForm.status} onChange={(event) => setExpenseForm((current) => ({ ...current, status: event.target.value as MonthlyExpenseStatus }))} className={fieldClass}>
          <option value="completed">Realizado</option>
          <option value="planned">Previsto</option>
        </select>
        {isFutureExpense(expenseForm.date, expenseForm.time) ? <p className="rounded-lg bg-amber/10 px-3 py-2 text-sm text-amber">Datas futuras serao salvas automaticamente como gasto previsto.</p> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={expenseForm.paymentMethod} onChange={(event) => setExpenseForm((current) => ({ ...current, paymentMethod: event.target.value }))} className={fieldClass} placeholder="Forma de pagamento opcional" />
          <select value={expenseForm.expenseType} onChange={(event) => setExpenseForm((current) => ({ ...current, expenseType: event.target.value as "single" | "recurring", recurring: event.target.value === "recurring" }))} className={fieldClass}>
            <option value="single">Unico</option>
            <option value="recurring">Recorrente</option>
          </select>
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-line bg-elevated px-3 py-3 text-sm text-muted">
          <input type="checkbox" checked={expenseForm.recurring} onChange={(event) => setExpenseForm((current) => ({ ...current, recurring: event.target.checked, expenseType: event.target.checked ? "recurring" : "single" }))} className="h-4 w-4 accent-accent" />
          Marcar como recorrente
        </label>
        {expenseForm.recurring ? (
          <fieldset className="grid gap-3 rounded-lg border border-line bg-elevated px-3 py-3 text-sm text-muted">
            <legend className="px-1 text-xs uppercase tracking-[0.14em]">Recorrencia</legend>
            {editingExpense?.recurrenceId ? (
              <select value={expenseForm.editScope} onChange={(event) => setExpenseForm((current) => ({ ...current, editScope: event.target.value as "single" | "series" }))} className={fieldClass}>
                <option value="single">Editar somente este lancamento</option>
                <option value="series">Editar toda recorrencia</option>
              </select>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <select value={expenseForm.recurrenceFrequency} onChange={(event) => setExpenseForm((current) => ({ ...current, recurrenceFrequency: event.target.value as MonthlyRecurrenceFrequency }))} className={fieldClass}>
                {Object.entries(recurrenceFrequencyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <input type="number" min="1" max="60" value={expenseForm.recurrenceInterval} onChange={(event) => setExpenseForm((current) => ({ ...current, recurrenceInterval: Number(event.target.value) }))} className={fieldClass} placeholder="Intervalo" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <input type="number" min="1" max="31" value={expenseForm.recurrenceDayOfMonth} onChange={(event) => setExpenseForm((current) => ({ ...current, recurrenceDayOfMonth: Number(event.target.value) }))} className={fieldClass} placeholder="Dia do mes" />
              <input type="date" value={expenseForm.recurrenceStartDate} onChange={(event) => setExpenseForm((current) => ({ ...current, recurrenceStartDate: event.target.value }))} className={fieldClass} aria-label="Data inicial da recorrencia" />
              <input type="date" value={expenseForm.recurrenceEndDate} onChange={(event) => setExpenseForm((current) => ({ ...current, recurrenceEndDate: event.target.value }))} className={fieldClass} aria-label="Data final da recorrencia" />
            </div>
            <p className="text-xs text-muted">Lancamentos futuros serao gerados como previstos, sem duplicar a recorrencia original.</p>
          </fieldset>
        ) : null}
        <textarea value={expenseForm.note} onChange={(event) => setExpenseForm((current) => ({ ...current, note: event.target.value }))} className={areaClass} placeholder="Observacao" />
      </ManagementModal>

      <ManagementModal title={editingGoalId ? "Editar objetivo" : "Novo objetivo"} isOpen={isGoalModalOpen} onClose={() => setIsGoalModalOpen(false)} onSubmit={submitGoal} submitDisabled={isSaving} submitLabel={isSaving ? "Salvando..." : "Salvar"}>
        <input required value={goalForm.name} onChange={(event) => setGoalForm((current) => ({ ...current, name: event.target.value }))} className={fieldClass} placeholder="Nome do objetivo" />
        <div className="grid gap-3 sm:grid-cols-3">
          <input required value={goalForm.target} onChange={(event) => setGoalForm((current) => ({ ...current, target: event.target.value }))} className={fieldClass} placeholder="Meta" inputMode="decimal" />
          <input value={goalForm.saved} onChange={(event) => setGoalForm((current) => ({ ...current, saved: event.target.value }))} className={fieldClass} placeholder="Guardado" inputMode="decimal" />
          <input value={goalForm.monthlyContribution} onChange={(event) => setGoalForm((current) => ({ ...current, monthlyContribution: event.target.value }))} className={fieldClass} placeholder="Aporte mensal" inputMode="decimal" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <select value={goalForm.linkedSource} onChange={(event) => setGoalForm((current) => ({ ...current, linkedSource: event.target.value as MonthlyFinancialGoalRecord["linkedSource"] }))} className={fieldClass}>
            <option value="manual">Manual</option>
            <option value="portfolio">Carteira</option>
            <option value="cashbox">Caixinha</option>
          </select>
          <input value={goalForm.linkedSourceId} onChange={(event) => setGoalForm((current) => ({ ...current, linkedSourceId: event.target.value }))} className={fieldClass} placeholder="ID ou nome vinculado opcional" />
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-line bg-elevated px-3 py-3 text-sm text-muted">
          <input type="checkbox" checked={goalForm.active} onChange={(event) => setGoalForm((current) => ({ ...current, active: event.target.checked }))} className="h-4 w-4 accent-accent" />
          Objetivo ativo
        </label>
      </ManagementModal>

      <ManagementModal title={categoryDetails ? `Dashboard do setor ${categoryDetails.name}` : "Dashboard do setor"} isOpen={categoryDetails !== null} onClose={() => setCategoryDetails(null)} onSubmit={(event) => { event.preventDefault(); setCategoryDetails(null); }} submitLabel="Fechar">
        {categoryDetails ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-elevated px-3 py-3 text-sm text-muted">
                <p>Gasto total</p>
                <p className="mt-1 font-semibold text-ink"><MoneyValue value={formatCents(categoryDetailTotal)} /></p>
              </div>
              <div className="rounded-lg bg-elevated px-3 py-3 text-sm text-muted">
                <p>Gasto medio</p>
                <p className="mt-1 font-semibold text-ink"><MoneyValue value={formatCents(categoryDetailAverage)} /></p>
              </div>
              <div className="rounded-lg bg-elevated px-3 py-3 text-sm text-muted">
                <p>Maior gasto</p>
                <p className="mt-1 font-semibold text-ink"><MoneyValue value={formatCents(categoryDetailHighest)} /></p>
              </div>
              <div className="rounded-lg bg-elevated px-3 py-3 text-sm text-muted">
                <p>Menor gasto</p>
                <p className="mt-1 font-semibold text-ink"><MoneyValue value={formatCents(categoryDetailLowest)} /></p>
              </div>
              <div className="rounded-lg bg-elevated px-3 py-3 text-sm text-muted">
                <p>Quantidade</p>
                <p className="mt-1 font-semibold text-ink">{categoryDetailExpenses.length}</p>
              </div>
              <div className="rounded-lg bg-elevated px-3 py-3 text-sm text-muted">
                <p>Utilizado</p>
                <p className="mt-1 font-semibold text-ink">{formatPercentage(categoryDetails.usedPercent)}</p>
              </div>
            </section>
            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-line bg-elevated p-3">
                <h3 className="text-sm font-semibold text-ink">Evolucao mensal</h3>
                <LineChart data={categoryMonthlyEvolutionChartData} xAxisKey="month" height={180} series={[{ dataKey: "value", name: "Gastos", color: categoryDetails.color }]} />
              </div>
              <div className="rounded-lg border border-line bg-elevated p-3">
                <h3 className="text-sm font-semibold text-ink">Evolucao anual</h3>
                <BarChart data={categoryAnnualEvolutionChartData} xAxisKey="year" name="Gastos" color={categoryDetails.color} height={180} />
              </div>
              <div className="rounded-lg border border-line bg-elevated p-3">
                <h3 className="text-sm font-semibold text-ink">Comparacao entre meses</h3>
                <BarChart data={categoryComparisonChartData} name="Gastos" color={categoryDetails.color} height={180} />
              </div>
              <div className="rounded-lg border border-line bg-elevated p-3">
                <h3 className="text-sm font-semibold text-ink">Gastos por forma de pagamento</h3>
                <BarChart data={categoryPaymentChartData} xAxisKey="paymentMethod" name="Gastos" color="#38bdf8" height={180} />
              </div>
            </section>
            <section className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-ink">Historico completo</h3>
                <button type="button" onClick={() => exportCategoryHistory(categoryDetails)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:text-ink">
                  <Download size={15} />
                  Exportar CSV
                </button>
              </div>
              <div className="grid max-h-64 gap-2 overflow-y-auto">
                {categoryDetailExpenses.length > 0 ? categoryDetailExpenses.map((expense) => (
                  <div key={expense.id ?? `${expense.date}-${expense.time}-${expense.description}`} className="grid gap-2 rounded-lg bg-elevated px-3 py-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
                    <span className="text-muted">{formatLocalDate(expense.date)}</span>
                    <span className="text-ink">{expense.description}</span>
                    <span className="font-medium text-ink"><MoneyValue value={formatCents(expense.amountInCents)} /></span>
                  </div>
                )) : <p className="rounded-lg bg-elevated px-3 py-3 text-sm text-muted">Nenhum lancamento neste setor.</p>}
              </div>
            </section>
          </>
        ) : null}
      </ManagementModal>

      <ConfirmDelete isOpen={deleteCategory !== null} title={`Excluir o setor ${deleteCategory?.name}? Os gastos ja lancados permanecerao no historico como setor removido.`} onCancel={() => setDeleteCategory(null)} onConfirm={() => void confirmDeleteCategory()} />
      <ConfirmDelete isOpen={deleteExpense !== null} title={`Excluir o gasto ${deleteExpense?.description}?${deleteExpense?.recurring ? " Isso cancela apenas este lancamento da recorrencia." : ""}`} onCancel={() => setDeleteExpense(null)} onConfirm={() => void confirmDeleteExpense()} />
      <ConfirmDelete isOpen={deleteExpenseSeries !== null} title={`Excluir toda recorrencia de ${deleteExpenseSeries?.description}?`} onCancel={() => setDeleteExpenseSeries(null)} onConfirm={() => void confirmDeleteExpenseSeries()} />
      <ConfirmDelete isOpen={deleteGoal !== null} title={`Excluir o objetivo ${deleteGoal?.name}?`} onCancel={() => setDeleteGoal(null)} onConfirm={() => void confirmDeleteGoal()} />
    </div>
  );
}
