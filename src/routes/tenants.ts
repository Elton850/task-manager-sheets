import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import db from "../db";
import { requireAuth, requireRole, optionalAuth } from "../middleware/auth";
import { nowIso } from "../utils";

const router = Router();

const SYSTEM_TENANT_SLUG = "system";

/** True se o usuário autenticado é o administrador do sistema (tenant "system", role ADMIN). */
function isSystemAdmin(req: Request): boolean {
  return !!(req.user && req.tenant?.slug === SYSTEM_TENANT_SLUG && req.user.role === "ADMIN");
}

/** Comparação segura contra timing attack para chave super-admin. */
function secureCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Acesso por chave em header (scripts/API externa). */
function checkSuperAdminKey(req: Request, res: Response): boolean {
  const key = (req.headers["x-super-admin-key"] as string) || "";
  const expected = process.env.SUPER_ADMIN_KEY || "";
  if (!expected || !secureCompare(key, expected)) {
    res.status(403).json({ error: "Acesso negado.", code: "FORBIDDEN" });
    return false;
  }
  return true;
}

/** Permite listar tenants: administrador do sistema (logado) ou chave super-admin. */
function canListTenants(req: Request, res: Response): boolean {
  if (req.user && isSystemAdmin(req)) return true;
  if (checkSuperAdminKey(req, res)) return true;
  if (!res.headersSent) res.status(403).json({ error: "Acesso negado.", code: "FORBIDDEN" });
  return false;
}

/** Permite criar/alterar tenants: administrador do sistema (logado) ou chave super-admin. */
function canManageTenants(req: Request, res: Response): boolean {
  if (req.user && isSystemAdmin(req)) return true;
  if (checkSuperAdminKey(req, res)) return true;
  if (!res.headersSent) res.status(403).json({ error: "Acesso negado.", code: "FORBIDDEN" });
  return false;
}

// GET /api/tenants — list all tenants (administrador do sistema logado ou chave)
router.get("/", optionalAuth, (req: Request, res: Response): void => {
  if (!canListTenants(req, res)) return;
  try {
    const tenants = db.prepare("SELECT id, slug, name, active, created_at FROM tenants WHERE slug != ? ORDER BY name ASC").all(SYSTEM_TENANT_SLUG);
    res.json({ tenants });
  } catch {
    res.status(500).json({ error: "Erro ao buscar empresas.", code: "INTERNAL" });
  }
});

// GET /api/tenants/current — tenant info for current request
router.get("/current", (req: Request, res: Response): void => {
  if (!req.tenant) {
    res.status(404).json({ error: "Tenant não identificado.", code: "NO_TENANT" });
    return;
  }
  res.json({
    tenant: {
      id: req.tenant.id,
      slug: req.tenant.slug,
      name: req.tenant.name,
    }
  });
});

// PATCH /api/tenants/current — update current tenant (ADMIN only)
router.patch("/current", requireAuth, requireRole("ADMIN"), (req: Request, res: Response): void => {
  try {
    const tenant = req.tenant;
    if (!tenant) {
      res.status(404).json({ error: "Tenant não identificado.", code: "NO_TENANT" });
      return;
    }
    const { name } = req.body;
    if (typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "Nome da empresa é obrigatório.", code: "MISSING_NAME" });
      return;
    }
    db.prepare("UPDATE tenants SET name = ? WHERE id = ?").run(name.trim(), tenant.id);
    res.json({
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: name.trim(),
      },
    });
  } catch {
    res.status(500).json({ error: "Erro ao atualizar empresa.", code: "INTERNAL" });
  }
});

// POST /api/tenants — cria apenas a empresa (sem admin). Admin Mestre cadastra usuários depois.
router.post("/", optionalAuth, async (req: Request, res: Response): Promise<void> => {
  if (!canManageTenants(req, res)) return;

  try {
    const { slug, name } = req.body;

    if (!slug || !name) {
      res.status(400).json({ error: "slug e name são obrigatórios.", code: "MISSING_FIELDS" });
      return;
    }

    const slugNorm = String(slug).trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const existing = db.prepare("SELECT id FROM tenants WHERE slug = ?").get(slugNorm);

    if (existing) {
      res.status(409).json({ error: "Slug já em uso.", code: "DUPLICATE_SLUG" });
      return;
    }

    const tenantId = uuidv4();
    const now = nowIso();

    const DEFAULT_LOOKUPS: Record<string, string[]> = {
      AREA: ["TI", "Financeiro", "RH", "Operações", "Comercial"],
      RECORRENCIA: ["Diário", "Semanal", "Quinzenal", "Mensal", "Trimestral", "Semestral", "Anual", "Pontual"],
      TIPO: ["Rotina", "Projeto", "Reunião", "Auditoria", "Treinamento"],
    };

    db.exec("BEGIN");
    try {
      db.prepare("INSERT INTO tenants (id, slug, name, active, created_at) VALUES (?, ?, ?, 1, ?)")
        .run(tenantId, slugNorm, String(name).trim(), now);

      let order = 0;
      for (const [category, values] of Object.entries(DEFAULT_LOOKUPS)) {
        for (const value of values) {
          db.prepare("INSERT OR IGNORE INTO lookups (id, tenant_id, category, value, order_index, created_at) VALUES (?, ?, ?, ?, ?, ?)")
            .run(uuidv4(), tenantId, category, value, order++, now);
        }
      }
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }

    res.status(201).json({
      tenant: { id: tenantId, slug: slugNorm, name: String(name).trim() },
      accessUrl: `/${slugNorm}`,
    });
  } catch {
    res.status(500).json({ error: "Erro ao criar empresa.", code: "INTERNAL" });
  }
});

// PATCH /api/tenants/:id/toggle-active (administrador do sistema ou chave)
router.patch("/:id/toggle-active", optionalAuth, (req: Request, res: Response): void => {
  if (!canManageTenants(req, res)) return;
  try {
    const { id } = req.params;
    const tenant = db.prepare("SELECT * FROM tenants WHERE id = ?").get(id) as { active: number } | undefined;
    if (!tenant) {
      res.status(404).json({ error: "Tenant não encontrado.", code: "NOT_FOUND" });
      return;
    }
    db.prepare("UPDATE tenants SET active = ? WHERE id = ?").run(tenant.active === 1 ? 0 : 1, id);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro.", code: "INTERNAL" });
  }
});

// GET /api/tenants/:id/info — tenant info (authenticated, same tenant)
router.get("/:id/info", requireAuth, (req: Request, res: Response): void => {
  try {
    if (req.user!.tenantId !== req.params.id) {
      res.status(403).json({ error: "Acesso negado.", code: "FORBIDDEN" });
      return;
    }
    const tenant = db.prepare("SELECT id, slug, name, active, created_at FROM tenants WHERE id = ?")
      .get(req.params.id);
    if (!tenant) {
      res.status(404).json({ error: "Tenant não encontrado.", code: "NOT_FOUND" });
      return;
    }
    res.json({ tenant });
  } catch {
    res.status(500).json({ error: "Erro.", code: "INTERNAL" });
  }
});

export default router;
