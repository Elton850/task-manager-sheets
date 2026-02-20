import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import db from "../db";
import { requireAuth } from "../middleware/auth";
import { nowIso } from "../utils";

const router = Router();
router.use(requireAuth);

const SYSTEM_TENANT_SLUG = "system";

function isSystemAdmin(req: Request): boolean {
  return !!(req.user && req.tenant?.slug === SYSTEM_TENANT_SLUG && req.user.role === "ADMIN");
}

function getTenantIdBySlug(slug: string): string | null {
  const row = db.prepare("SELECT id FROM tenants WHERE slug = ? AND active = 1").get(slug) as { id: string } | undefined;
  return row?.id ?? null;
}

interface RuleDbRow {
  id: string;
  tenant_id: string;
  area: string;
  allowed_recorrencias: string;
  updated_at: string;
  updated_by: string;
}

function rowToRule(row: RuleDbRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    area: row.area,
    allowedRecorrencias: JSON.parse(row.allowed_recorrencias || "[]") as string[],
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

// GET /api/rules/by-tenant/:tenantSlug — regras de uma empresa (só Admin Mestre)
router.get("/by-tenant/:tenantSlug", (req: Request, res: Response): void => {
  if (!isSystemAdmin(req)) {
    res.status(403).json({ error: "Apenas o Administrador Mestre pode ver regras de outra empresa.", code: "FORBIDDEN" });
    return;
  }
  try {
    const tenantId = getTenantIdBySlug(req.params.tenantSlug);
    if (!tenantId) {
      res.status(404).json({ error: "Empresa não encontrada.", code: "NOT_FOUND" });
      return;
    }
    const rows = db.prepare("SELECT * FROM rules WHERE tenant_id = ? ORDER BY area ASC").all(tenantId) as RuleDbRow[];
    res.json({ rules: rows.map(rowToRule) });
  } catch {
    res.status(500).json({ error: "Erro ao buscar regras.", code: "INTERNAL" });
  }
});

// PUT /api/rules/for-tenant — salvar regra de uma área para uma empresa (só Admin Mestre)
router.put("/for-tenant", (req: Request, res: Response): void => {
  if (!isSystemAdmin(req)) {
    res.status(403).json({ error: "Apenas o Administrador Mestre pode definir regras de outra empresa.", code: "FORBIDDEN" });
    return;
  }
  try {
    const { tenantSlug, area, allowedRecorrencias } = req.body;
    if (!tenantSlug || !area) {
      res.status(400).json({ error: "tenantSlug e area são obrigatórios.", code: "MISSING_FIELDS" });
      return;
    }
    const tenantId = getTenantIdBySlug(String(tenantSlug).trim().toLowerCase());
    if (!tenantId) {
      res.status(404).json({ error: "Empresa não encontrada.", code: "NOT_FOUND" });
      return;
    }
    if (!Array.isArray(allowedRecorrencias)) {
      res.status(400).json({ error: "allowedRecorrencias deve ser um array.", code: "VALIDATION" });
      return;
    }

    const existing = db.prepare("SELECT id FROM rules WHERE tenant_id = ? AND area = ?")
      .get(tenantId, area) as { id: string } | undefined;
    const now = nowIso();
    const allowedJson = JSON.stringify(allowedRecorrencias);

    if (existing) {
      db.prepare(`
        UPDATE rules SET allowed_recorrencias = ?, updated_at = ?, updated_by = ?
        WHERE tenant_id = ? AND area = ?
      `).run(allowedJson, now, req.user!.email, tenantId, area);
    } else {
      db.prepare(`
        INSERT INTO rules (id, tenant_id, area, allowed_recorrencias, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), tenantId, area, allowedJson, now, req.user!.email);
    }

    const updated = db.prepare("SELECT * FROM rules WHERE tenant_id = ? AND area = ?")
      .get(tenantId, area) as RuleDbRow;
    res.json({ rule: rowToRule(updated) });
  } catch {
    res.status(500).json({ error: "Erro ao salvar regra.", code: "INTERNAL" });
  }
});

// GET /api/rules — rules for current user's area (or all areas for ADMIN)
router.get("/", (req: Request, res: Response): void => {
  try {
    const user = req.user!;
    const tenantId = req.tenantId!;

    let rows: RuleDbRow[];

    if (user.role === "ADMIN") {
      rows = db.prepare("SELECT * FROM rules WHERE tenant_id = ? ORDER BY area ASC").all(tenantId) as RuleDbRow[];
    } else {
      rows = db.prepare("SELECT * FROM rules WHERE tenant_id = ? AND area = ?").all(tenantId, user.area) as RuleDbRow[];
    }

    res.json({ rules: rows.map(rowToRule) });
  } catch {
    res.status(500).json({ error: "Erro ao buscar regras.", code: "INTERNAL" });
  }
});

// GET /api/rules/by-area — get rules for a specific area
router.get("/by-area", (req: Request, res: Response): void => {
  try {
    const user = req.user!;
    const tenantId = req.tenantId!;
    const { area } = req.query;

    if (!area || typeof area !== "string") {
      res.status(400).json({ error: "Área é obrigatória.", code: "MISSING_AREA" });
      return;
    }

    // LEADER can only see their area
    if (user.role === "LEADER" && area !== user.area) {
      res.status(403).json({ error: "Sem permissão para ver regras desta área.", code: "FORBIDDEN" });
      return;
    }

    const row = db.prepare("SELECT * FROM rules WHERE tenant_id = ? AND area = ?")
      .get(tenantId, area) as RuleDbRow | undefined;

    res.json({ rule: row ? rowToRule(row) : null });
  } catch {
    res.status(500).json({ error: "Erro ao buscar regra.", code: "INTERNAL" });
  }
});

// PUT /api/rules — upsert rules for an area (LEADER manages own area, ADMIN manages all)
router.put("/", (req: Request, res: Response): void => {
  try {
    const user = req.user!;
    const tenantId = req.tenantId!;
    const { area, allowedRecorrencias } = req.body;

    if (user.role === "USER") {
      res.status(403).json({ error: "Sem permissão.", code: "FORBIDDEN" });
      return;
    }

    if (!area) {
      res.status(400).json({ error: "Área é obrigatória.", code: "MISSING_AREA" });
      return;
    }

    // LEADER can only manage their area
    if (user.role === "LEADER" && area !== user.area) {
      res.status(403).json({ error: "LEADER só pode gerenciar regras da sua própria área.", code: "FORBIDDEN" });
      return;
    }

    if (!Array.isArray(allowedRecorrencias)) {
      res.status(400).json({ error: "allowedRecorrencias deve ser um array.", code: "VALIDATION" });
      return;
    }

    const existing = db.prepare("SELECT id FROM rules WHERE tenant_id = ? AND area = ?")
      .get(tenantId, area) as { id: string } | undefined;

    const now = nowIso();
    const allowedJson = JSON.stringify(allowedRecorrencias);

    if (existing) {
      db.prepare(`
        UPDATE rules SET allowed_recorrencias = ?, updated_at = ?, updated_by = ?
        WHERE tenant_id = ? AND area = ?
      `).run(allowedJson, now, user.email, tenantId, area);
    } else {
      db.prepare(`
        INSERT INTO rules (id, tenant_id, area, allowed_recorrencias, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), tenantId, area, allowedJson, now, user.email);
    }

    const updated = db.prepare("SELECT * FROM rules WHERE tenant_id = ? AND area = ?")
      .get(tenantId, area) as RuleDbRow;

    res.json({ rule: rowToRule(updated) });
  } catch {
    res.status(500).json({ error: "Erro ao salvar regra.", code: "INTERNAL" });
  }
});

export default router;
