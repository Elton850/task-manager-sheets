import React, { createContext, useContext, useEffect } from "react";
import { useLocation, Outlet } from "react-router-dom";
import { setTenantSlug } from "@/services/api";
import { getTenantFromPath, getBasePath } from "@/utils/tenantPath";

const BasePathContext = createContext<string>("");

export function useBasePath(): string {
  const ctx = useContext(BasePathContext);
  return ctx ?? "";
}

/** Sincroniza tenant do path com a API e fornece basePath para links. */
export function SyncTenantAndBasePath() {
  const location = useLocation();
  const pathname = location.pathname;
  const tenant = getTenantFromPath(pathname);
  const basePath = getBasePath(pathname);

  useEffect(() => {
    setTenantSlug(tenant);
    if (tenant !== "system") {
      localStorage.setItem("tenantSlug", tenant);
    }
  }, [tenant]);

  return (
    <BasePathContext.Provider value={basePath}>
      <Outlet />
    </BasePathContext.Provider>
  );
}
