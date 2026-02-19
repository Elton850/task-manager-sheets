import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import db from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { nowIso } from "../utils";

const router = Router();
router.use(requireAuth);

interface LookupDbRow {
  id: string;
  tenant_id: string;
  category: string;
  value: string;
  order_index: number;
  created_at: string;
}

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
