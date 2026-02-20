import { Request, Response, NextFunction } from "express";
import db from "../db";
import type { Tenant } from "../types";

const IS_PROD = process.env.NODE_ENV === "production";
const ALLOWED_HOST_PATTERN = process.env.ALLOWED_HOST_PATTERN || ""; // e.g. "^[a-z0-9-]+\\.taskmanager\\.com$"

interface TenantDbRow {
  id: string;
  slug: string;
  name: string;
  active: number;
  created_at: string;
}

/** Valida Host header para mitigar Host Header Attack. Em prod, se ALLOWED_HOST_PATTERN estiver definido, exige match. */
function validateHost(host: string): boolean {
  if (!host || typeof host !== "string") return false;
  const h = host.split(":")[0].toLowerCase().trim();
  if (h.length > 253 || /[^a-z0-9.-]/.test(h)) return false; // caracteres inválidos
  if (!IS_PROD && (h === "localhost" || h === "127.0.0.1")) return true;
  if (IS_PROD && ALLOWED_HOST_PATTERN) {
    try {
      return new RegExp(ALLOWED_HOST_PATTERN).test(h);
    } catch {
      return false;
    }
  }
  return true; // prod sem pattern: manter compatibilidade (recomenda-se definir ALLOWED_HOST_PATTERN)
}

function resolveTenantSlug(req: Request): string | null {
  const host = (req.headers["host"] || "").trim();
  if (!validateHost(host)) return null;

  // 1. Custom header (used by frontend SPA)
  const header = req.headers["x-tenant-slug"];
  if (header && typeof header === "string") {
    const slug = header.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (slug) return slug;
  }

  // 2. Subdomain from Host header (production: empresaX.taskmanager.com)
  const parts = host.split(".");
  if (parts.length >= 3 && !host.includes("localhost")) {
    const sub = parts[0].toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (sub) return sub;
  }

  // 3. Query param apenas em desenvolvimento (evita tenant switching / IDOR em produção)
  if (!IS_PROD) {
    const qParam = req.query["tenant"];
    if (qParam && typeof qParam === "string") {
      const slug = qParam.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
      if (slug) return slug;
    }
  }

  return null;
}

export function tenantMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip tenant resolution for CSRF endpoint and static files
  const p = (req.path || "").replace(/^\/api/, "") || "/";
  if (p === "/csrf" || p === "/health") return next();

  let slug = resolveTenantSlug(req);
  // Admin Mestre pode acessar sem tenant na URL: tratamos como tenant "system"
  if (!slug) slug = "system";

  const row = db.prepare("SELECT * FROM tenants WHERE slug = ? AND active = 1").get(slug) as TenantDbRow | undefined;
  if (!row) {
    res.status(404).json({ error: "Empresa não encontrada ou inativa.", code: "TENANT_NOT_FOUND" });
    return;
  }

  req.tenant = {
    id: row.id,
    slug: row.slug,
    name: row.name,
    active: row.active === 1,
    createdAt: row.created_at,
  };
  req.tenantId = row.id;

  next();
}
