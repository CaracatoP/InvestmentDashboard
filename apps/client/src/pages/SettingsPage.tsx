import { Bot, Check, Download, FileDown, Lock, LogOut, RefreshCw, Save, SlidersHorizontal, Smartphone, Users, XCircle } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { PageHeader } from "../components/ui/PageHeader";
import { ProgressBar } from "../components/ui/ProgressBar";
import { useWorkspaceInvalidation } from "../hooks/useWorkspaceInvalidation";
import { adminUsersApi, fetchAiHealth, integrationsApi, updateAllocations, updateSettingsProfile } from "../services/api";
import { useInvestmentStore } from "../stores/useInvestmentStore";
import { applyThemePreference, normalizeThemePreference } from "../theme/app-theme";
import type { AiHealth } from "../types/ai";
import type { AuthUser, WhatsAppIntegrationStatus, WhatsAppLinkCreated } from "../types/auth";
import type { SettingsResponse } from "../types/investments";
import { setCurrencyPreference } from "../utils/formatters";
import { exportCsv, exportJson, formatPercentage } from "../utils/formatters";

type ProfileForm = {
  name: string;
  theme: SettingsResponse["profile"]["theme"];
  currency: SettingsResponse["profile"]["currency"];
};

const defaultProfileForm: ProfileForm = {
  name: "Investidor",
  theme: "dark",
  currency: "BRL"
};

const fieldClass = "w-full rounded-lg border border-line bg-elevated px-3 py-2 text-sm text-ink outline-none transition focus:border-accent";

const userStatusGroups: Array<{ status: AuthUser["status"]; label: string }> = [
  { status: "pending_approval", label: "Pendentes" },
  { status: "active", label: "Ativos" },
  { status: "rejected", label: "Rejeitados" },
  { status: "disabled", label: "Desativados" }
];

const userStatusLabels: Record<AuthUser["status"], string> = {
  pending_approval: "Pendente",
  active: "Ativo",
  rejected: "Rejeitado",
  disabled: "Desativado"
};

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function SettingsPage() {
  const navigate = useNavigate();
  const settings = useInvestmentStore((state) => state.settings);
  const portfolio = useInvestmentStore((state) => state.portfolio);
  const setSettings = useInvestmentStore((state) => state.setSettings);
  const { user, changePassword, logout } = useAuth();
  const [allocations, setAllocations] = useState<SettingsResponse["allocations"]>([]);
  const [profileForm, setProfileForm] = useState<ProfileForm>(defaultProfileForm);
  const [profileFeedback, setProfileFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [aiHealth, setAiHealth] = useState<AiHealth | null>(null);
  const [isCheckingAi, setIsCheckingAi] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", password: "", confirmPassword: "" });
  const [passwordFeedback, setPasswordFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [adminUsers, setAdminUsers] = useState<AuthUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [usersFeedback, setUsersFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [whatsAppStatus, setWhatsAppStatus] = useState<WhatsAppIntegrationStatus | null>(null);
  const [whatsAppLink, setWhatsAppLink] = useState<WhatsAppLinkCreated | null>(null);
  const [isLoadingWhatsApp, setIsLoadingWhatsApp] = useState(false);
  const [whatsAppFeedback, setWhatsAppFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    setAllocations(settings?.allocations ?? []);
  }, [settings?.allocations]);

  useEffect(() => {
    if (!settings?.profile) return;
    setProfileForm({
      name: settings.profile.name || defaultProfileForm.name,
      theme: normalizeThemePreference(settings.profile.theme),
      currency: settings.profile.currency || defaultProfileForm.currency
    });
  }, [settings?.profile]);

  async function loadAiHealth() {
    setIsCheckingAi(true);
    try {
      setAiHealth(await fetchAiHealth());
    } finally {
      setIsCheckingAi(false);
    }
  }

  useEffect(() => {
    void loadAiHealth();
  }, []);

  useWorkspaceInvalidation(["ai"], () => loadAiHealth());

  async function loadAdminUsers() {
    if (user?.role !== "admin") return;
    setIsLoadingUsers(true);
    try {
      setAdminUsers(await adminUsersApi.list());
    } finally {
      setIsLoadingUsers(false);
    }
  }

  useEffect(() => {
    void loadAdminUsers();
  }, [user?.role]);

  async function loadWhatsAppStatus() {
    setIsLoadingWhatsApp(true);
    try {
      setWhatsAppStatus(await integrationsApi.whatsappStatus());
    } finally {
      setIsLoadingWhatsApp(false);
    }
  }

  useEffect(() => {
    void loadWhatsAppStatus();
  }, []);

  const allocationTotal = useMemo(() => allocations.reduce((total, item) => total + item.targetPercentage, 0), [allocations]);
  const isProfileDirty = useMemo(() => {
    const profile = settings?.profile;
    if (!profile) return false;
    return profileForm.name.trim() !== profile.name || profileForm.theme !== profile.theme || profileForm.currency !== profile.currency;
  }, [profileForm, settings?.profile]);
  const groupedAdminUsers = useMemo(
    () => userStatusGroups.map((group) => ({ ...group, users: adminUsers.filter((adminUser) => adminUser.status === group.status) })),
    [adminUsers]
  );
  const pendingWhatsAppLink = whatsAppLink?.link ?? (whatsAppStatus?.link?.status === "pending" ? whatsAppStatus.link : null);
  const isWhatsAppConnected = Boolean(whatsAppStatus?.connected && whatsAppStatus.link?.status === "verified");
  const whatsappStatusLabel = !whatsAppStatus?.configured
    ? "Configuração pendente"
    : isWhatsAppConnected
      ? "Conectado"
      : pendingWhatsAppLink
        ? "Código pendente"
        : "Pronto para conectar";

  useEffect(() => {
    if (!pendingWhatsAppLink || isWhatsAppConnected) return undefined;
    const interval = window.setInterval(() => {
      void loadWhatsAppStatus();
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [isWhatsAppConnected, pendingWhatsAppLink?.id]);

  function updateProfileForm(input: Partial<ProfileForm>) {
    setProfileFeedback(null);
    setProfileForm((current) => {
      const next = { ...current, ...input };
      if (input.theme) applyThemePreference(input.theme, { persist: true });
      if (input.currency) setCurrencyPreference(input.currency);
      return next;
    });
  }

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const profileName = profileForm.name.trim();
    if (profileName.length < 2) {
      setProfileFeedback({ type: "error", message: "Informe um nome com pelo menos 2 caracteres." });
      return;
    }

    setIsSavingProfile(true);
    setProfileFeedback(null);

    try {
      const updatedSettings = await updateSettingsProfile({
        profileName,
        theme: profileForm.theme,
        currency: profileForm.currency
      });
      setSettings(updatedSettings);
      applyThemePreference(updatedSettings.profile.theme, { persist: true });
      setCurrencyPreference(updatedSettings.profile.currency);
      setProfileFeedback({ type: "success", message: "Perfil salvo com sucesso." });
    } catch (error) {
      setProfileFeedback({ type: "error", message: error instanceof Error ? error.message : "Nao foi possivel salvar o perfil." });
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsChangingPassword(true);
    setPasswordFeedback(null);

    try {
      const result = await changePassword(passwordForm);
      setPasswordFeedback({ type: "success", message: result.message });
      setPasswordForm({ currentPassword: "", password: "", confirmPassword: "" });
    } catch (error) {
      setPasswordFeedback({ type: "error", message: error instanceof Error ? error.message : "Nao foi possivel alterar a senha." });
    } finally {
      setIsChangingPassword(false);
    }
  }

  async function handleLogoutFromSettings() {
    await logout();
    navigate("/login", { replace: true });
  }

  async function handleStartWhatsAppLink() {
    setWhatsAppFeedback(null);
    setIsLoadingWhatsApp(true);
    try {
      const result = await integrationsApi.createWhatsAppLink();
      setWhatsAppLink(result);
      await loadWhatsAppStatus();
      setWhatsAppFeedback({ type: "success", message: "Codigo temporario gerado." });
    } catch (error) {
      setWhatsAppFeedback({ type: "error", message: error instanceof Error ? error.message : "Nao foi possivel iniciar o vinculo." });
    } finally {
      setIsLoadingWhatsApp(false);
    }
  }

  async function handleCancelWhatsAppLink() {
    setWhatsAppFeedback(null);
    setIsLoadingWhatsApp(true);
    try {
      await integrationsApi.cancelWhatsAppLink();
      setWhatsAppLink(null);
      await loadWhatsAppStatus();
      setWhatsAppFeedback({ type: "success", message: "Vinculo pendente cancelado." });
    } catch (error) {
      setWhatsAppFeedback({ type: "error", message: error instanceof Error ? error.message : "Nao foi possivel cancelar o vinculo." });
    } finally {
      setIsLoadingWhatsApp(false);
    }
  }

  async function handleDisconnectWhatsApp() {
    setWhatsAppFeedback(null);
    setIsLoadingWhatsApp(true);
    try {
      await integrationsApi.disconnectWhatsApp();
      setWhatsAppLink(null);
      await loadWhatsAppStatus();
      setWhatsAppFeedback({ type: "success", message: "WhatsApp desconectado." });
    } catch (error) {
      setWhatsAppFeedback({ type: "error", message: error instanceof Error ? error.message : "Nao foi possivel desconectar o WhatsApp." });
    } finally {
      setIsLoadingWhatsApp(false);
    }
  }

  async function handleUserAction(action: "approve" | "reject" | "disable" | "reactivate", userId: string) {
    setUsersFeedback(null);
    try {
      if (action === "approve") await adminUsersApi.approve(userId);
      if (action === "reject") await adminUsersApi.reject(userId);
      if (action === "disable") await adminUsersApi.disable(userId);
      if (action === "reactivate") await adminUsersApi.reactivate(userId);
      setUsersFeedback({ type: "success", message: "Usuario atualizado." });
      await loadAdminUsers();
    } catch (error) {
      setUsersFeedback({ type: "error", message: error instanceof Error ? error.message : "Nao foi possivel atualizar usuario." });
    }
  }

  async function handleSave() {
    await updateAllocations(allocations);
  }

  function updateAllocation(category: string, value: number) {
    setAllocations((current) =>
      current.map((item) => (item.category === category ? { ...item, targetPercentage: value } : item))
    );
  }

  function exportPortfolioCsv() {
    exportCsv(
      "carteira.csv",
      (portfolio?.assets ?? []).map((asset) => ({
        ticker: asset.ticker,
        nome: asset.name,
        categoria: asset.category,
        quantidade: asset.quantity,
        precoMedio: asset.averagePrice,
        precoAtual: asset.currentPrice,
        valorInvestido: asset.investedValue,
        valorAtual: asset.currentValue,
        lucro: asset.profit,
        peso: asset.portfolioWeight
      }))
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Configuracoes"
        title="Preferencias, alocacao e portabilidade"
        description="Tema, moeda, carteira ideal, backup local e exportacoes para analise externa."
      />

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
        <aside className="min-w-0 space-y-4">
          <article className="min-w-0 rounded-lg border border-line bg-panel p-4 shadow-soft">
            <h2 className="text-base font-semibold text-ink">Perfil</h2>
            <form onSubmit={(event) => void handleSaveProfile(event)} className="mt-4 space-y-3 text-sm">
              <label className="block">
                <span className="text-muted">Nome</span>
                <input
                  required
                  minLength={2}
                  maxLength={80}
                  value={profileForm.name}
                  onChange={(event) => updateProfileForm({ name: event.target.value })}
                  className={`${fieldClass} mt-1`}
                  placeholder="Seu nome"
                />
              </label>

              <label className="block">
                <span className="text-muted">Tema</span>
                <select
                  value={profileForm.theme}
                  onChange={(event) => updateProfileForm({ theme: normalizeThemePreference(event.target.value) })}
                  className={`${fieldClass} mt-1`}
                >
                  <option value="dark">Escuro</option>
                  <option value="light">Claro</option>
                  <option value="system">Sistema</option>
                </select>
              </label>

              <label className="block">
                <span className="text-muted">Moeda</span>
                <select
                  value={profileForm.currency}
                  onChange={(event) => updateProfileForm({ currency: event.target.value as ProfileForm["currency"] })}
                  className={`${fieldClass} mt-1`}
                >
                  <option value="BRL">BRL — Real brasileiro</option>
                  <option value="USD" disabled>USD — Dolar americano indisponivel</option>
                  <option value="EUR" disabled>EUR — Euro indisponivel</option>
                </select>
                <span className="mt-1 block text-xs text-muted">USD/EUR ficam bloqueados ate existir conversao cambial confiavel.</span>
              </label>

              {profileFeedback ? (
                <p className={`rounded-lg px-3 py-2 text-sm ${profileFeedback.type === "success" ? "bg-accent/10 text-accent" : "bg-rose/10 text-rose"}`}>
                  {profileFeedback.message}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isSavingProfile || !isProfileDirty}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-black transition hover:bg-accent/90 disabled:opacity-50"
              >
                <Save size={16} />
                {isSavingProfile ? "Salvando..." : "Salvar alteracoes"}
              </button>
            </form>
          </article>

          <article className="min-w-0 rounded-lg border border-line bg-panel p-4 shadow-soft">
            <h2 className="text-base font-semibold text-ink">Backup e exportacao</h2>
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={() => exportJson("backup-investimentos.json", { settings, portfolio })}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-accent/50 hover:text-ink"
              >
                <Download size={16} />
                Backup JSON
              </button>
              <button
                type="button"
                onClick={exportPortfolioCsv}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-accent/50 hover:text-ink"
              >
                <FileDown size={16} />
                Exportar Excel
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-accent/50 hover:text-ink"
              >
                <FileDown size={16} />
                Exportar PDF
              </button>
            </div>
          </article>

          <article className="min-w-0 rounded-lg border border-line bg-panel p-4 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-ink">Seguranca</h2>
                <p className="mt-1 text-sm text-muted">Altere sua senha mantendo sessoes antigas revogadas.</p>
              </div>
              <Lock size={18} className="text-accent" />
            </div>
            <div className="mt-4 space-y-2 text-sm">
              {[
                ["Nome", user?.name ?? settings?.profile.name ?? "-"],
                ["E-mail", user?.email ?? "-"],
                ["Perfil", user?.role === "admin" ? "Administrador" : "Usuario"],
                ["Sessao atual", "Ativa neste navegador"],
                ["Ultimo acesso", formatDateTime(user?.lastLoginAt)]
              ].map(([label, value]) => (
                <div key={label} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-elevated px-3 py-2">
                  <span className="text-muted">{label}</span>
                  <span className="break-words text-right font-medium text-ink">{value}</span>
                </div>
              ))}
              <button
                type="button"
                onClick={() => void handleLogoutFromSettings()}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-rose/50 hover:text-rose"
              >
                <LogOut size={15} />
                Sair desta sessao
              </button>
            </div>
            <form onSubmit={(event) => void handleChangePassword(event)} className="mt-4 space-y-3 text-sm">
              <input className={fieldClass} type="password" autoComplete="current-password" placeholder="Senha atual" required value={passwordForm.currentPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))} />
              <input className={fieldClass} type="password" autoComplete="new-password" placeholder="Nova senha" required minLength={8} value={passwordForm.password} onChange={(event) => setPasswordForm((current) => ({ ...current, password: event.target.value }))} />
              <input className={fieldClass} type="password" autoComplete="new-password" placeholder="Confirmar nova senha" required minLength={8} value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))} />
              {passwordFeedback ? (
                <p className={`rounded-lg px-3 py-2 text-sm ${passwordFeedback.type === "success" ? "bg-accent/10 text-accent" : "bg-rose/10 text-rose"}`}>{passwordFeedback.message}</p>
              ) : null}
              <button type="submit" disabled={isChangingPassword} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-black transition hover:bg-accent/90 disabled:opacity-50">
                <Save size={16} />
                {isChangingPassword ? "Salvando..." : "Alterar senha"}
              </button>
            </form>
          </article>

          <article className="min-w-0 rounded-lg border border-line bg-panel p-4 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-ink">Inteligencia artificial</h2>
                <p className="mt-1 text-sm text-muted">Status do provider configurado no backend.</p>
              </div>
              <Bot size={18} className="text-accent" />
            </div>
            <div className="mt-4 space-y-3 text-sm">
              {[
                ["Provider", aiHealth?.provider ?? "-"],
                ["Modelo", aiHealth?.model ?? "-"],
                ["Status", aiHealth?.status ?? "-"],
                ["Ultimo teste", aiHealth?.checkedAt ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(aiHealth.checkedAt)) : "-"],
                ["Latencia", aiHealth?.latencyMs !== null && aiHealth?.latencyMs !== undefined ? `${aiHealth.latencyMs}ms` : "-"],
                ["Limite/hora", aiHealth?.limits.maxRequestsPerHour ?? "-"],
                ["Contexto efetivo", aiHealth?.limits.effectiveContextTokens ? `${aiHealth.limits.effectiveContextTokens} tokens` : "-"]
              ].map(([label, value]) => (
                <div key={label} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-elevated px-3 py-2">
                  <span className="text-muted">{label}</span>
                  <span className="break-words text-right font-medium text-ink">{value}</span>
                </div>
              ))}
              {aiHealth?.message ? <p className="rounded-lg bg-amber/10 px-3 py-2 text-sm text-amber">{aiHealth.message}</p> : null}
              <button
                type="button"
                onClick={() => void loadAiHealth()}
                disabled={isCheckingAi}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-accent/50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw size={16} className={isCheckingAi ? "animate-spin" : ""} />
                Testar conexao
              </button>
            </div>
          </article>

          <article className="min-w-0 rounded-lg border border-line bg-panel p-4 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-ink">Integracoes</h2>
                <p className="mt-1 text-sm text-muted">Preparado para canais externos sem ativar Meta ainda.</p>
              </div>
              <Smartphone size={18} className="text-accent" />
            </div>
            <div className="mt-4 rounded-lg bg-elevated px-3 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">WhatsApp</p>
                  <p className="text-xs text-muted">
                    {whatsAppStatus?.configured
                      ? "Vincule seu telefone por codigo temporario."
                      : "Defina WHATSAPP_ENABLED e o numero oficial para liberar o vinculo."}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs ${isWhatsAppConnected ? "bg-accent/10 text-accent" : "bg-muted/10 text-muted"}`}>
                  {whatsappStatusLabel}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {whatsAppStatus?.officialNumber ? (
                  <p className="rounded-lg bg-panel px-3 py-2 text-xs text-muted">
                    Numero oficial: <span className="font-medium text-ink">{whatsAppStatus.officialNumber}</span>
                  </p>
                ) : null}
                {isWhatsAppConnected ? (
                  <div className="rounded-lg bg-accent/10 px-3 py-2 text-xs text-accent">
                    <p>Telefone conectado {whatsAppStatus?.link?.phoneNormalized ? `(${whatsAppStatus.link.phoneNormalized})` : ""}.</p>
                    <button
                      type="button"
                      onClick={() => void handleDisconnectWhatsApp()}
                      disabled={isLoadingWhatsApp}
                      className="mt-2 h-9 rounded-lg border border-accent/30 px-3 text-xs text-accent transition hover:border-rose/40 hover:text-rose disabled:opacity-60"
                    >
                      {isLoadingWhatsApp ? "Desconectando..." : "Desconectar WhatsApp"}
                    </button>
                  </div>
                ) : null}
                {pendingWhatsAppLink ? (
                  <div className="rounded-lg border border-accent/30 bg-panel px-3 py-2 text-xs text-muted">
                    {whatsAppLink?.code ? (
                      <p>
                        Codigo temporario: <span className="font-semibold text-accent">{whatsAppLink.code}</span>
                      </p>
                    ) : (
                      <p>Existe um codigo pendente. Cancele e gere outro caso tenha perdido o codigo.</p>
                    )}
                    <p className="mt-1">
                      Envie esse codigo para {whatsAppStatus?.officialNumber || "o numero oficial do Invest Hub"} ate {formatDateTime(pendingWhatsAppLink.expiresAt)}.
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleCancelWhatsAppLink()}
                      disabled={isLoadingWhatsApp}
                      className="mt-2 h-9 rounded-lg border border-line px-3 text-xs text-muted transition hover:border-rose/40 hover:text-rose disabled:opacity-60"
                    >
                      Cancelar vinculo
                    </button>
                  </div>
                ) : null}
                {whatsAppFeedback ? (
                  <p className={`rounded-lg px-3 py-2 text-xs ${whatsAppFeedback.type === "success" ? "bg-accent/10 text-accent" : "bg-rose/10 text-rose"}`}>
                    {whatsAppFeedback.message}
                  </p>
                ) : null}
                {!isWhatsAppConnected && !pendingWhatsAppLink ? (
                  <button
                    type="button"
                    onClick={() => void handleStartWhatsAppLink()}
                    disabled={isLoadingWhatsApp || !whatsAppStatus?.configured}
                    className="h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-muted transition hover:border-accent/50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isLoadingWhatsApp ? "Gerando..." : "Conectar"}
                  </button>
                ) : null}
              </div>
            </div>
          </article>

          {user?.role === "admin" ? (
            <article className="min-w-0 rounded-lg border border-line bg-panel p-4 shadow-soft">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-ink">Usuarios</h2>
                  <p className="mt-1 text-sm text-muted">Aprovacao e status das contas do Invest Hub.</p>
                </div>
                <Users size={18} className="text-accent" />
              </div>
              {usersFeedback ? (
                <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${usersFeedback.type === "success" ? "bg-accent/10 text-accent" : "bg-rose/10 text-rose"}`}>{usersFeedback.message}</p>
              ) : null}
              <div className="mt-4 space-y-3">
                {isLoadingUsers ? <p className="rounded-lg bg-elevated px-3 py-2 text-sm text-muted">Carregando usuarios...</p> : null}
                {!isLoadingUsers && adminUsers.length === 0 ? <p className="rounded-lg bg-elevated px-3 py-2 text-sm text-muted">Nenhum usuario encontrado.</p> : null}
                {groupedAdminUsers.map((group) =>
                  group.users.length > 0 ? (
                    <div key={group.status} className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{group.label}</p>
                      {group.users.map((adminUser) => (
                        <div key={adminUser.id} className="rounded-lg bg-elevated px-3 py-3 text-sm">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-medium text-ink">{adminUser.name}</p>
                              <p className="truncate text-xs text-muted">{adminUser.email}</p>
                              <p className="mt-1 text-xs text-muted">Status: {userStatusLabels[adminUser.status]} | Ultimo acesso: {formatDateTime(adminUser.lastLoginAt)}</p>
                            </div>
                            <span className="rounded-full bg-panel px-2 py-1 text-xs text-muted">{adminUser.role}</span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {adminUser.status === "pending_approval" ? (
                              <>
                                <button type="button" onClick={() => void handleUserAction("approve", adminUser.id)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3 text-xs font-medium text-black"><Check size={14} />Aprovar</button>
                                <button type="button" onClick={() => void handleUserAction("reject", adminUser.id)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose/40 px-3 text-xs text-rose"><XCircle size={14} />Rejeitar</button>
                              </>
                            ) : null}
                            {adminUser.status === "active" && adminUser.id !== user.id ? (
                              <button type="button" onClick={() => void handleUserAction("disable", adminUser.id)} className="h-9 rounded-lg border border-line px-3 text-xs text-muted transition hover:border-rose/40 hover:text-rose">Desativar</button>
                            ) : null}
                            {adminUser.status === "disabled" ? (
                              <button type="button" onClick={() => void handleUserAction("reactivate", adminUser.id)} className="h-9 rounded-lg border border-accent/40 px-3 text-xs text-accent">Reativar</button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null
                )}
              </div>
            </article>
          ) : null}
        </aside>

        <section className="min-w-0 rounded-lg border border-line bg-panel p-4 shadow-soft">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-ink">Alocacao ideal</h2>
              <p className="mt-1 text-sm text-muted">A soma deve fechar em 100%.</p>
            </div>
            <button
              type="button"
              onClick={() => void handleSave()}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-black transition hover:bg-accent/90 disabled:opacity-50 md:w-auto"
              disabled={allocationTotal !== 100}
            >
              <Save size={16} />
              Salvar
            </button>
          </div>

          <div className="mt-5 space-y-5">
            {allocations.map((allocation) => (
              <div key={allocation.category}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-3 text-sm">
                  <span className="inline-flex min-w-0 items-center gap-2 text-muted">
                    <SlidersHorizontal size={15} />
                    <span className="break-words">{allocation.category}</span>
                  </span>
                  <span className="font-medium text-ink">{formatPercentage(allocation.targetPercentage)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={allocation.targetPercentage}
                  onChange={(event) => updateAllocation(allocation.category, Number(event.target.value))}
                  className="w-full accent-accent"
                />
                <ProgressBar value={allocation.targetPercentage} tone="blue" />
              </div>
            ))}
          </div>

          <div className={`mt-5 rounded-lg px-3 py-2 text-sm ${allocationTotal === 100 ? "bg-accent/10 text-accent" : "bg-amber/10 text-amber"}`}>
            Total configurado: {formatPercentage(allocationTotal)}
          </div>
        </section>
      </section>
    </div>
  );
}
