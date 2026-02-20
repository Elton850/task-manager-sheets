import React, { useState } from "react";
import { Building2 } from "lucide-react";

interface TenantLogoProps {
  /** Slug da empresa (ex.: "acme"). Quando vazio ou "system", mostra placeholder. */
  tenantSlug: string | null | undefined;
  /** Versão da logo (ex.: logoUpdatedAt do tenant); ao mudar, o navegador busca a imagem nova. */
  logoVersion?: string | null;
  alt?: string;
  className?: string;
  /** Tamanho do container (ex.: "h-8 w-8", "h-16 w-16"). */
  size?: string;
}

/**
 * Exibe a logo da empresa quando existir (GET /api/tenants/logo/:slug).
 * Se não houver logo ou der erro, mostra ícone de placeholder (empresa).
 * logoVersion (ex.: tenant.logoUpdatedAt) garante que alterações no cadastro de empresas apareçam ao acessar a empresa.
 */
export default function TenantLogo({ tenantSlug, logoVersion, alt = "Logo", className = "", size = "h-10 w-10" }: TenantLogoProps) {
  const [useFallback, setUseFallback] = useState(false);
  const versionQuery = logoVersion ? `?v=${encodeURIComponent(logoVersion)}` : "";
  const hasLogo = tenantSlug && tenantSlug !== "system" && !useFallback;
  const logoUrl = hasLogo ? `/api/tenants/logo/${tenantSlug}${versionQuery}` : null;

  return (
    <div
      className={`${size} rounded-lg border border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center flex-shrink-0 ${className}`}
      title={hasLogo ? alt : "Nenhuma logo definida"}
      aria-label={hasLogo ? alt : "Placeholder: nenhuma logo"}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={alt}
          className="w-full h-full object-contain bg-white"
          onError={() => setUseFallback(true)}
        />
      ) : (
        <Building2
          className="w-[55%] h-[55%] text-slate-300"
          strokeWidth={1.5}
          aria-hidden
        />
      )}
    </div>
  );
}
