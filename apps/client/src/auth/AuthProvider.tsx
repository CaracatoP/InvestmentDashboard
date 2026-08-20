import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  authApi,
  clearCsrfToken,
  clearApiCacheForLogout,
  setApiCacheScope
} from "../services/api";
import { useInvestmentStore } from "../stores/useInvestmentStore";
import type { AuthLoginInput, AuthRegisterInput, AuthUser } from "../types/auth";

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (input: AuthLoginInput) => Promise<AuthUser>;
  register: (input: AuthRegisterInput) => Promise<{ message: string; status?: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<AuthUser | null>;
  forgotPassword: (email: string) => Promise<{ message: string }>;
  resetPassword: (input: { token: string; password: string; confirmPassword: string }) => Promise<{ message: string }>;
  changePassword: (input: { currentPassword: string; password: string; confirmPassword: string }) => Promise<{ message: string }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const resetWorkspace = useInvestmentStore((state) => state.resetWorkspace);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const applyUser = useCallback((nextUser: AuthUser | null) => {
    setUser(nextUser);
    if (nextUser) {
      setApiCacheScope(nextUser.id);
      return;
    }

    clearCsrfToken();
    clearApiCacheForLogout();
    resetWorkspace();
  }, [resetWorkspace]);

  const refresh = useCallback(async () => {
    try {
      const result = await authApi.me();
      applyUser(result.user);
      return result.user;
    } catch {
      applyUser(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [applyUser]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isAuthenticated: Boolean(user),
    isLoading,
    login: async (input) => {
      try {
        await authApi.login(input);
      } catch (error) {
        applyUser(null);
        if (error instanceof Error) {
          throw error;
        }
        throw new Error("Nao foi possivel concluir o login.");
      }

      try {
        const confirmed = await authApi.me();
        if (!confirmed.user) {
          applyUser(null);
          throw new Error("Sessao autenticada sem usuario associado.");
        }
        applyUser(confirmed.user);
        return confirmed.user;
      } catch (error) {
        applyUser(null);
        throw new Error("Login aceito, mas a sessao nao foi confirmada na requisicao seguinte. Verifique o dominio/API publicado e tente novamente.");
      }
    },
    register: authApi.register,
    logout: async () => {
      try {
        await authApi.logout();
      } finally {
        applyUser(null);
      }
    },
    refresh,
    forgotPassword: authApi.forgotPassword,
    resetPassword: authApi.resetPassword,
    changePassword: authApi.changePassword
  }), [applyUser, isLoading, refresh, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
