import {
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  Coins,
  Landmark,
  Goal,
  History,
  LayoutDashboard,
  ListChecks,
  Scale,
  Settings,
  WalletCards
} from "lucide-react";

export const navigationItems = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Carteira", path: "/carteira", icon: WalletCards },
  { label: "Alocacao", path: "/alocacao", icon: Scale },
  { label: "Ativos", path: "/ativos", icon: ClipboardList },
  { label: "Operacoes", path: "/operacoes", icon: ListChecks },
  { label: "Dividendos", path: "/dividendos", icon: Coins },
  { label: "Aportes", path: "/aportes", icon: CircleDollarSign },
  { label: "Caixinhas", path: "/caixinhas", icon: Landmark },
  { label: "Metas", path: "/metas", icon: Goal },
  { label: "Projecoes", path: "/projecoes", icon: BarChart3 },
  { label: "Calendario", path: "/calendario", icon: CalendarDays },
  { label: "Historico", path: "/historico", icon: History },
  { label: "Configuracoes", path: "/configuracoes", icon: Settings }
] as const;
