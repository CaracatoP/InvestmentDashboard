import {
  BarChart3,
  Bot,
  CalendarDays,
  ClipboardList,
  Landmark,
  History,
  LayoutDashboard,
  ListChecks,
  Settings,
  WalletCards
} from "lucide-react";

export const navigationItems = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Planejamento", path: "/planejamento-mensal", icon: CalendarDays },
  { label: "Investimentos", path: "/investimentos", icon: WalletCards },
  { label: "Ativos", path: "/ativos", icon: ClipboardList },
  { label: "Operações", path: "/operacoes", icon: ListChecks },
  { label: "Caixinhas", path: "/caixinhas", icon: Landmark },
  { label: "Projeções", path: "/projecoes", icon: BarChart3 },
  { label: "Histórico", path: "/historico", icon: History },
  { label: "Assistente IA", path: "/assistente", icon: Bot },
  { label: "Configurações", path: "/configuracoes", icon: Settings }
] as const;
