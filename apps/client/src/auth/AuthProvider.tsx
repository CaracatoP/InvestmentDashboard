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
      const result = await authApi.login(input);
      applyUser(result.user);
      return result.user;
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
