import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { authApi, clearCsrfToken } from "@/services/api";
import type { AuthUser, Tenant } from "@/types";

interface AuthContextValue {
  user: AuthUser | null;
  tenant: Tenant | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
  /** Atualiza user e tenant a partir do cookie (útil após reset de senha). */
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  const checkSession = useCallback(async () => {
    try {
      await authApi.init();
      const { user: u, tenant: t } = await authApi.me();
      setUser(u);
      setTenant(t);
    } catch {
      setUser(null);
      setTenant(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const login = useCallback(async (email: string, password: string) => {
    const { user: u } = await authApi.login(email, password);
    const { user: me, tenant: t } = await authApi.me();
    setUser(me);
    setTenant(t);
  }, []);

  const refreshSession = useCallback(async () => {
    const { user: me, tenant: t } = await authApi.me();
    setUser(me);
    setTenant(t);
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    clearCsrfToken();
    setUser(null);
    setTenant(null);
  }, []);

  const value = useMemo(
    () => ({ user, tenant, loading, login, logout, setUser, refreshSession }),
    [user, tenant, loading, login, logout, refreshSession]
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
