import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import db from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
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

interface LookupDbRow {
  id: string;
  tenant_id: string;
  category: string;
  value: string;
  order_index: number;
  created_at: string;
}

// ——— Admin Mestre: gerenciar lookups de qualquer empresa ———

// GET /api/lookups/by-tenant/:tenantSlug — lookups agrupados (só Admin Mestre)
router.get("/by-tenant/:tenantSlug", requireRole("ADMIN"), (req: Request, res: Response): void => {
  if (!isSystemAdmin(req)) {
    res.status(403).json({ error: "Apenas o Administrador Mestre pode ver listas de outra empresa.", code: "FORBIDDEN" });
    return;
  }
  try {
    const tenantId = getTenantIdBySlug(req.params.tenantSlug);
    if (!tenantId) {
      res.status(404).json({ error: "Empresa não encontrada.", code: "NOT_FOUND" });
      return;
    }
    const rows = db.prepare(`
      SELECT * FROM lookups WHERE tenant_id = ?
      ORDER BY category ASC, order_index ASC, value ASC
    `).all(tenantId) as LookupDbRow[];

    const grouped: Record<string, string[]> = {};
    for (const row of rows) {
      if (!grouped[row.category]) grouped[row.category] = [];
      grouped[row.category].push(row.value);
    }
    res.json({ lookups: grouped });
  } catch {
    res.status(500).json({ error: "Erro ao buscar lookups.", code: "INTERNAL" });
  }
});

// GET /api/lookups/by-tenant/:tenantSlug/all — com metadata (só Admin Mestre)
router.get("/by-tenant/:tenantSlug/all", requireRole("ADMIN"), (req: Request, res: Response): void => {
  if (!isSystemAdmin(req)) {
    res.status(403).json({ error: "Apenas o Administrador Mestre pode ver listas de outra empresa.", code: "FORBIDDEN" });
    return;
  }
  try {
    const tenantId = getTenantIdBySlug(req.params.tenantSlug);
    if (!tenantId) {
      res.status(404).json({ error: "Empresa não encontrada.", code: "NOT_FOUND" });
      return;
    }
    const rows = db.prepare(`
      SELECT * FROM lookups WHERE tenant_id = ?
      ORDER BY category ASC, order_index ASC
    `).all(tenantId) as LookupDbRow[];

    res.json({
      lookups: rows.map(r => ({
        id: r.id,
        category: r.category,
        value: r.value,
        orderIndex: r.order_index,
      }))
    });
  } catch {
    res.status(500).json({ error: "Erro ao buscar lookups.", code: "INTERNAL" });
  }
});

// POST /api/lookups/for-tenant — adicionar valor em uma empresa (só Admin Mestre)
router.post("/for-tenant", requireRole("ADMIN"), (req: Request, res: Response): void => {
  if (!isSystemAdmin(req)) {
    res.status(403).json({ error: "Apenas o Administrador Mestre pode editar listas de outra empresa.", code: "FORBIDDEN" });
    return;
  }
  try {
    const { tenantSlug, category, value } = req.body;
    if (!tenantSlug || !category || !value) {
      res.status(400).json({ error: "tenantSlug, categoria e valor são obrigatórios.", code: "MISSING_FIELDS" });
      return;
    }
    const tenantId = getTenantIdBySlug(String(tenantSlug).trim().toLowerCase());
    if (!tenantId) {
      res.status(404).json({ error: "Empresa não encontrada.", code: "NOT_FOUND" });
      return;
    }

    const cat = String(category).trim().toUpperCase();
    const val = String(value).trim();

    const existing = db.prepare("SELECT id FROM lookups WHERE tenant_id = ? AND category = ? AND value = ?")
      .get(tenantId, cat, val);
    if (existing) {
      res.status(409).json({ error: "Valor já existe nesta categoria.", code: "DUPLICATE" });
      return;
    }

    const maxOrder = db.prepare("SELECT MAX(order_index) as max FROM lookups WHERE tenant_id = ? AND category = ?")
      .get(tenantId, cat) as { max: number | null };
    const id = uuidv4();
    db.prepare("INSERT INTO lookups (id, tenant_id, category, value, order_index, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, tenantId, cat, val, (maxOrder.max ?? -1) + 1, nowIso());
    res.status(201).json({ id, category: cat, value: val });
  } catch {
    res.status(500).json({ error: "Erro ao adicionar lookup.", code: "INTERNAL" });
  }
});

// PUT /api/lookups/for-tenant/:id — renomear valor (só Admin Mestre)
router.put("/for-tenant/:id", requireRole("ADMIN"), (req: Request, res: Response): void => {
  if (!isSystemAdmin(req)) {
    res.status(403).json({ error: "Apenas o Administrador Mestre pode editar listas de outra empresa.", code: "FORBIDDEN" });
    return;
  }
  try {
    const { id } = req.params;
    const { tenantSlug, value } = req.body;
    if (!tenantSlug || !value) {
      res.status(400).json({ error: "tenantSlug e value são obrigatórios.", code: "MISSING_FIELDS" });
      return;
    }
    const tenantId = getTenantIdBySlug(String(tenantSlug).trim().toLowerCase());
    if (!tenantId) {
      res.status(404).json({ error: "Empresa não encontrada.", code: "NOT_FOUND" });
      return;
    }

    const existing = db.prepare("SELECT * FROM lookups WHERE id = ? AND tenant_id = ?")
      .get(id, tenantId) as LookupDbRow | undefined;
    if (!existing) {
      res.status(404).json({ error: "Item não encontrado.", code: "NOT_FOUND" });
      return;
    }

    const newValue = String(value).trim();
    db.prepare("UPDATE lookups SET value = ? WHERE id = ? AND tenant_id = ?").run(newValue, id, tenantId);
    if (existing.category === "AREA") {
      db.prepare("UPDATE tasks SET area = ? WHERE tenant_id = ? AND area = ?").run(newValue, tenantId, existing.value);
      db.prepare("UPDATE users SET area = ? WHERE tenant_id = ? AND area = ?").run(newValue, tenantId, existing.value);
    } else if (existing.category === "RECORRENCIA") {
      db.prepare("UPDATE tasks SET recorrencia = ? WHERE tenant_id = ? AND recorrencia = ?").run(newValue, tenantId, existing.value);
    } else if (existing.category === "TIPO") {
      db.prepare("UPDATE tasks SET tipo = ? WHERE tenant_id = ? AND tipo = ?").run(newValue, tenantId, existing.value);
    }
    res.json({ ok: true, id, value: newValue });
  } catch {
    res.status(500).json({ error: "Erro ao renomear lookup.", code: "INTERNAL" });
  }
});

// DELETE /api/lookups/for-tenant/:id?tenantSlug= — remover (só Admin Mestre)
router.delete("/for-tenant/:id", requireRole("ADMIN"), (req: Request, res: Response): void => {
  if (!isSystemAdmin(req)) {
    res.status(403).json({ error: "Apenas o Administrador Mestre pode editar listas de outra empresa.", code: "FORBIDDEN" });
    return;
  }
  try {
    const { id } = req.params;
    const tenantSlug = req.query.tenantSlug as string | undefined;
    if (!tenantSlug) {
      res.status(400).json({ error: "tenantSlug é obrigatório.", code: "MISSING_FIELDS" });
      return;
    }
    const tenantId = getTenantIdBySlug(String(tenantSlug).trim().toLowerCase());
    if (!tenantId) {
      res.status(404).json({ error: "Empresa não encontrada.", code: "NOT_FOUND" });
      return;
    }
    const existing = db.prepare("SELECT * FROM lookups WHERE id = ? AND tenant_id = ?").get(id, tenantId);
    if (!existing) {
      res.status(404).json({ error: "Item não encontrado.", code: "NOT_FOUND" });
      return;
    }
    db.prepare("DELETE FROM lookups WHERE id = ? AND tenant_id = ?").run(id, tenantId);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro ao remover lookup.", code: "INTERNAL" });
  }
});

// POST /api/lookups/copy — copiar listas de uma empresa para outra (substitui destino) (só Admin Mestre)
router.post("/copy", requireRole("ADMIN"), (req: Request, res: Response): void => {
  if (!isSystemAdmin(req)) {
    res.status(403).json({ error: "Apenas o Administrador Mestre pode copiar listas entre empresas.", code: "FORBIDDEN" });
    return;
  }
  try {
    const { sourceTenantSlug, targetTenantSlug } = req.body;
    if (!sourceTenantSlug || !targetTenantSlug) {
      res.status(400).json({ error: "sourceTenantSlug e targetTenantSlug são obrigatórios.", code: "MISSING_FIELDS" });
      return;
    }
    const sourceId = getTenantIdBySlug(String(sourceTenantSlug).trim().toLowerCase());
    const targetId = getTenantIdBySlug(String(targetTenantSlug).trim().toLowerCase());
    if (!sourceId || !targetId) {
      res.status(404).json({ error: "Empresa de origem ou destino não encontrada.", code: "NOT_FOUND" });
      return;
    }
    if (sourceId === targetId) {
      res.status(400).json({ error: "Origem e destino devem ser empresas diferentes.", code: "SAME_TENANT" });
      return;
    }

    const now = nowIso();
    const rows = db.prepare("SELECT * FROM lookups WHERE tenant_id = ? ORDER BY category ASC, order_index ASC, value ASC")
      .all(sourceId) as LookupDbRow[];

    db.exec("BEGIN");
    try {
      db.prepare("DELETE FROM lookups WHERE tenant_id = ?").run(targetId);
      let order = 0;
      for (const r of rows) {
        db.prepare("INSERT INTO lookups (id, tenant_id, category, value, order_index, created_at) VALUES (?, ?, ?, ?, ?, ?)")
          .run(uuidv4(), targetId, r.category, r.value, order++, now);
      }
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }

    res.json({ ok: true, copied: rows.length });
  } catch {
    res.status(500).json({ error: "Erro ao copiar listas.", code: "INTERNAL" });
  }
});

// GET /api/lookups — all lookups grouped by category
router.get("/", (req: Request, res: Response): void => {
  try {
    const rows = db.prepare(`
      SELECT * FROM lookups WHERE tenant_id = ?
      ORDER BY category ASC, order_index ASC, value ASC
    `).all(req.tenantId!) as LookupDbRow[];

    const grouped: Record<string, string[]> = {};
    for (const row of rows) {
      if (!grouped[row.category]) grouped[row.category] = [];
      grouped[row.category].push(row.value);
    }

    res.json({ lookups: grouped });
  } catch {
    res.status(500).json({ error: "Erro ao buscar lookups.", code: "INTERNAL" });
  }
});

// GET /api/lookups/all — with metadata (ADMIN)
router.get("/all", requireRole("ADMIN"), (req: Request, res: Response): void => {
  try {
    const rows = db.prepare(`
      SELECT * FROM lookups WHERE tenant_id = ?
      ORDER BY category ASC, order_index ASC
    `).all(req.tenantId!) as LookupDbRow[];

    res.json({
      lookups: rows.map(r => ({
        id: r.id,
        category: r.category,
        value: r.value,
        orderIndex: r.order_index,
      }))
    });
  } catch {
    res.status(500).json({ error: "Erro ao buscar lookups.", code: "INTERNAL" });
  }
});

// POST /api/lookups — add new value (ADMIN)
router.post("/", requireRole("ADMIN"), (req: Request, res: Response): void => {
  try {
    const tenantId = req.tenantId!;
    const { category, value } = req.body;

    if (!category || !value) {
      res.status(400).json({ error: "Categoria e valor são obrigatórios.", code: "MISSING_FIELDS" });
      return;
    }

    const cat = String(category).trim().toUpperCase();
    const val = String(value).trim();

    const existing = db.prepare("SELECT id FROM lookups WHERE tenant_id = ? AND category = ? AND value = ?")
      .get(tenantId, cat, val);

    if (existing) {
      res.status(409).json({ error: "Valor já existe nesta categoria.", code: "DUPLICATE" });
      return;
    }

    const maxOrder = db.prepare("SELECT MAX(order_index) as max FROM lookups WHERE tenant_id = ? AND category = ?")
      .get(tenantId, cat) as { max: number | null };

    const id = uuidv4();
    db.prepare("INSERT INTO lookups (id, tenant_id, category, value, order_index, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, tenantId, cat, val, (maxOrder.max ?? -1) + 1, nowIso());

    res.status(201).json({ id, category: cat, value: val });
  } catch {
    res.status(500).json({ error: "Erro ao adicionar lookup.", code: "INTERNAL" });
  }
});

// PUT /api/lookups/:id — rename value (ADMIN)
router.put("/:id", requireRole("ADMIN"), (req: Request, res: Response): void => {
  try {
    const tenantId = req.tenantId!;
    const { id } = req.params;
    const { value } = req.body;

    if (!value) {
      res.status(400).json({ error: "Novo valor é obrigatório.", code: "MISSING_FIELDS" });
      return;
    }

    const existing = db.prepare("SELECT * FROM lookups WHERE id = ? AND tenant_id = ?")
      .get(id, tenantId) as LookupDbRow | undefined;

    if (!existing) {
      res.status(404).json({ error: "Item não encontrado.", code: "NOT_FOUND" });
      return;
    }

    const newValue = String(value).trim();

    // Update lookup value
    db.prepare("UPDATE lookups SET value = ? WHERE id = ? AND tenant_id = ?").run(newValue, id, tenantId);

    // Cascade rename: atualiza tasks e users que referenciam o valor antigo
    if (existing.category === "AREA") {
      db.prepare("UPDATE tasks SET area = ? WHERE tenant_id = ? AND area = ?").run(newValue, tenantId, existing.value);
      db.prepare("UPDATE users SET area = ? WHERE tenant_id = ? AND area = ?").run(newValue, tenantId, existing.value);
    } else if (existing.category === "RECORRENCIA") {
      db.prepare("UPDATE tasks SET recorrencia = ? WHERE tenant_id = ? AND recorrencia = ?").run(newValue, tenantId, existing.value);
    } else if (existing.category === "TIPO") {
      db.prepare("UPDATE tasks SET tipo = ? WHERE tenant_id = ? AND tipo = ?").run(newValue, tenantId, existing.value);
    }

    res.json({ ok: true, id, value: newValue });
  } catch {
    res.status(500).json({ error: "Erro ao renomear lookup.", code: "INTERNAL" });
  }
});

// DELETE /api/lookups/:id (ADMIN)
router.delete("/:id", requireRole("ADMIN"), (req: Request, res: Response): void => {
  try {
    const tenantId = req.tenantId!;
    const { id } = req.params;

    const existing = db.prepare("SELECT * FROM lookups WHERE id = ? AND tenant_id = ?")
      .get(id, tenantId);

    if (!existing) {
      res.status(404).json({ error: "Item não encontrado.", code: "NOT_FOUND" });
      return;
    }

    db.prepare("DELETE FROM lookups WHERE id = ? AND tenant_id = ?").run(id, tenantId);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro ao remover lookup.", code: "INTERNAL" });
  }
});

export default router;
