import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { authApi, clearCsrfToken, setTenantSlug } from "@/services/api";
import type { AuthUser, Tenant } from "@/types";

interface AuthContextValue {
  user: AuthUser | null;
  tenant: Tenant | null;
  loading: boolean;
  /** True quando o admin mestre está visualizando como outro usuário (somente leitura). */
  isImpersonating: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
  /** Atualiza user e tenant a partir do cookie (útil após reset de senha ou impersonation). */
  refreshSession: () => Promise<void>;
  /** Admin mestre: inicia visualização como o usuário (somente leitura). Retorna { user, tenant } do alvo. */
  startImpersonation: (userId: string) => Promise<{ user: AuthUser; tenant: Tenant }>;
  /** Sai do modo "visualizar como" e volta à conta do admin mestre. */
  stopImpersonation: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [isImpersonating, setIsImpersonating] = useState(false);

  const checkSession = useCallback(async () => {
    try {
      await authApi.init();
      const data = await authApi.me();
      setUser(data.user);
      setTenant(data.tenant);
      setIsImpersonating(!!data.isImpersonating);
    } catch {
      setUser(null);
      setTenant(null);
      setIsImpersonating(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const login = useCallback(async (email: string, password: string) => {
    const { user: u } = await authApi.login(email, password);
    const data = await authApi.me();
    setUser(data.user);
    setTenant(data.tenant);
    setIsImpersonating(!!data.isImpersonating);
  }, []);

  const refreshSession = useCallback(async () => {
    const data = await authApi.me();
    setUser(data.user);
    setTenant(data.tenant);
    setIsImpersonating(!!data.isImpersonating);
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    clearCsrfToken();
    setUser(null);
    setTenant(null);
    setIsImpersonating(false);
  }, []);

  const startImpersonation = useCallback(async (userId: string) => {
    const res = await authApi.impersonate(userId);
    setTenantSlug(res.tenant.slug);
    await refreshSession();
    return res;
  }, [refreshSession]);

  const stopImpersonation = useCallback(async () => {
    await authApi.impersonateStop();
    setTenantSlug("system");
    await refreshSession();
  }, [refreshSession]);

  const value = useMemo(
    () => ({
      user,
      tenant,
      loading,
      isImpersonating,
      login,
      logout,
      setUser,
      refreshSession,
      startImpersonation,
      stopImpersonation,
    }),
    [user, tenant, loading, isImpersonating, login, logout, refreshSession, startImpersonation, stopImpersonation]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
