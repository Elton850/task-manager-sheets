import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import db from "../db";
import { requireAuth, requireRole, optionalAuth } from "../middleware/auth";
import { nowIso } from "../utils";

const router = Router();
const uploadsBaseDir = path.resolve(process.cwd(), "data", "uploads");
const TENANT_LOGOS_DIR = "tenants";
const LOGO_MAX_SIZE = 2 * 1024 * 1024; // 2MB
const LOGO_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

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

// GET /api/tenants/logo/:slug — serve logo da empresa (público, para login e layout)
router.get("/logo/:slug", (req: Request, res: Response): void => {
  try {
    const slug = (req.params.slug || "").trim().toLowerCase();
    if (!slug) {
      res.status(404).end();
      return;
    }
    const row = db.prepare("SELECT id, logo_path FROM tenants WHERE slug = ?").get(slug) as { id: string; logo_path: string | null } | undefined;
    if (!row || !row.logo_path) {
      res.status(404).end();
      return;
    }
    const absolutePath = path.resolve(process.cwd(), row.logo_path);
    const allowedDir = path.resolve(uploadsBaseDir, TENANT_LOGOS_DIR);
    if (!absolutePath.startsWith(allowedDir + path.sep) && absolutePath !== allowedDir) {
      res.status(403).end();
      return;
    }
    if (!fs.existsSync(absolutePath)) {
      db.prepare("UPDATE tenants SET logo_path = NULL WHERE id = ?").run(row.id);
      res.status(404).end();
      return;
    }
    const stat = fs.statSync(absolutePath, { throwIfNoEntry: false });
    const mtimeMs = stat?.mtimeMs ?? Date.now();
    const etag = `"${mtimeMs.toString(36)}"`;
    if (req.headers["if-none-match"] === etag) {
      res.status(304).end();
      return;
    }
    const ext = path.extname(absolutePath).toLowerCase();
    const mime = ext === ".png" ? "image/png" : ext === ".gif" ? "image/gif" : ext === ".webp" ? "image/webp" : "image/jpeg";
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
    res.setHeader("ETag", etag);
    res.sendFile(absolutePath);
  } catch {
    res.status(500).end();
  }
});

// GET /api/tenants — list all tenants (administrador do sistema logado ou chave)
router.get("/", optionalAuth, (req: Request, res: Response): void => {
  if (!canListTenants(req, res)) return;
  try {
    const rows = db.prepare("SELECT id, slug, name, active, created_at, logo_path, logo_updated_at FROM tenants WHERE slug != ? ORDER BY name ASC").all(SYSTEM_TENANT_SLUG) as { id: string; slug: string; name: string; active: number; created_at: string; logo_path: string | null; logo_updated_at: string | null }[];
    const tenants = rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      active: r.active,
      created_at: r.created_at,
      hasLogo: Boolean(r.logo_path && r.logo_path.trim() !== ""),
      logoUpdatedAt: r.logo_updated_at ?? undefined,
    }));
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
      logoUpdatedAt: req.tenant.logoUpdatedAt ?? undefined,
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

// POST /api/tenants/:id/logo — upload logo (apenas admin mestre)
router.post("/:id/logo", optionalAuth, (req: Request, res: Response): void => {
  if (!canManageTenants(req, res)) return;
  try {
    const { id: tenantId } = req.params;
    const tenant = db.prepare("SELECT id, slug, logo_path FROM tenants WHERE id = ? AND slug != ?").get(tenantId, SYSTEM_TENANT_SLUG) as { id: string; slug: string; logo_path: string | null } | undefined;
    if (!tenant) {
      res.status(404).json({ error: "Empresa não encontrada.", code: "NOT_FOUND" });
      return;
    }
    const { fileName, mimeType, contentBase64 } = req.body || {};
    const mime = (String(mimeType || "").toLowerCase().split(";")[0].trim()) || "image/jpeg";
    if (!LOGO_MIMES.has(mime)) {
      res.status(400).json({ error: "Use imagem JPEG, PNG, GIF ou WebP.", code: "INVALID_MIME" });
      return;
    }
    const raw = (contentBase64 || "").trim();
    const base64 = raw.includes("base64,") ? raw.slice(raw.indexOf("base64,") + 7) : raw;
    const buffer = Buffer.from(base64, "base64");
    if (!buffer.length) {
      res.status(400).json({ error: "Arquivo inválido.", code: "INVALID_FILE" });
      return;
    }
    if (buffer.length > LOGO_MAX_SIZE) {
      res.status(400).json({ error: "Imagem deve ter no máximo 2MB.", code: "FILE_TOO_LARGE" });
      return;
    }
    const ext = mime === "image/png" ? ".png" : mime === "image/gif" ? ".gif" : mime === "image/webp" ? ".webp" : ".jpg";
    const logoDir = path.join(uploadsBaseDir, TENANT_LOGOS_DIR, tenantId);
    fs.mkdirSync(logoDir, { recursive: true });
    const logoFileName = `logo${ext}`;
    const absolutePath = path.join(logoDir, logoFileName);
    fs.writeFileSync(absolutePath, buffer);
    const relativePath = path.relative(process.cwd(), absolutePath).replaceAll("\\", "/");
    db.prepare("UPDATE tenants SET logo_path = ?, logo_updated_at = datetime('now') WHERE id = ?").run(relativePath, tenantId);
    res.json({ ok: true, logoPath: relativePath });
  } catch {
    res.status(500).json({ error: "Erro ao salvar logo.", code: "INTERNAL" });
  }
});

// DELETE /api/tenants/:id/logo — remove logo (apenas admin mestre)
router.delete("/:id/logo", optionalAuth, (req: Request, res: Response): void => {
  if (!canManageTenants(req, res)) return;
  try {
    const { id: tenantId } = req.params;
    const tenant = db.prepare("SELECT id, logo_path FROM tenants WHERE id = ?").get(tenantId) as { id: string; logo_path: string | null } | undefined;
    if (!tenant) {
      res.status(404).json({ error: "Empresa não encontrada.", code: "NOT_FOUND" });
      return;
    }
    if (tenant.logo_path) {
      const absolutePath = path.resolve(process.cwd(), tenant.logo_path);
      const allowedDir = path.resolve(uploadsBaseDir, TENANT_LOGOS_DIR);
      if (absolutePath.startsWith(allowedDir + path.sep) && fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
      db.prepare("UPDATE tenants SET logo_path = NULL, logo_updated_at = datetime('now') WHERE id = ?").run(tenantId);
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro ao remover logo.", code: "INTERNAL" });
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
