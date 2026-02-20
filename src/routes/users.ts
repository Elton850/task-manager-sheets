import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import db, { SYSTEM_TENANT_ID } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { safeLowerEmail, nowIso } from "../utils";

const router = Router();
router.use(requireAuth);

const SYSTEM_TENANT_SLUG = "system";

function isMasterAdmin(req: Request): boolean {
  return !!(req.user && req.tenant?.slug === SYSTEM_TENANT_SLUG && req.user.role === "ADMIN");
}

interface UserDbRow {
  id: string;
  tenant_id: string;
  email: string;
  nome: string;
  role: string;
  area: string;
  active: number;
  can_delete: number;
  must_change_password: number;
  created_at: string;
}

function rowToUser(row: UserDbRow, tenantSlug?: string, tenantName?: string) {
  const u = {
    id: row.id,
    tenantId: row.tenant_id,
    email: row.email,
    nome: row.nome,
    role: row.role,
    area: row.area,
    active: row.active === 1,
    canDelete: row.can_delete === 1,
    mustChangePassword: row.must_change_password === 1,
    createdAt: row.created_at,
  };
  if (tenantSlug !== undefined) (u as Record<string, unknown>).tenantSlug = tenantSlug;
  if (tenantName !== undefined) (u as Record<string, unknown>).tenantName = tenantName;
  return u;
}

// GET /api/users — active users (filtered by role for selection dropdowns)
router.get("/", (req: Request, res: Response): void => {
  try {
    const user = req.user!;
    const tenantId = req.tenantId!;

    let rows: UserDbRow[];

    if (user.role === "ADMIN") {
      rows = db.prepare("SELECT * FROM users WHERE tenant_id = ? AND active = 1 ORDER BY nome ASC")
        .all(tenantId) as UserDbRow[];
    } else if (user.role === "LEADER") {
      rows = db.prepare("SELECT * FROM users WHERE tenant_id = ? AND active = 1 AND area = ? ORDER BY nome ASC")
        .all(tenantId, user.area) as UserDbRow[];
    } else {
      rows = db.prepare("SELECT * FROM users WHERE tenant_id = ? AND email = ?")
        .all(tenantId, user.email) as UserDbRow[];
    }

    res.json({ users: rows.map(rowToUser) });
  } catch {
    res.status(500).json({ error: "Erro ao buscar usuários.", code: "INTERNAL" });
  }
});

const WITHOUT_PASSWORD_CONDITION = "(u.must_change_password = 1 OR TRIM(COALESCE(u.password_hash, '')) = '')";

// GET /api/users/all — Admin Mestre: ?tenant=slug ou todos; ?withoutPassword=1 só usuários sem senha (mestre)
router.get("/all", requireRole("ADMIN", "LEADER"), (req: Request, res: Response): void => {
  try {
    const user = req.user!;
    const tenantId = req.tenantId!;
    const filterTenantSlug = req.query.tenant as string | undefined;
    const onlyWithoutPassword = req.query.withoutPassword === "1" && isMasterAdmin(req);

    if (isMasterAdmin(req)) {
      // Admin Mestre: listar todos ou filtrar por tenant e opcionalmente só sem senha
      if (filterTenantSlug) {
        const t = db.prepare("SELECT id, slug, name FROM tenants WHERE slug = ?").get(filterTenantSlug) as { id: string; slug: string; name: string } | undefined;
        if (!t) {
          res.status(404).json({ error: "Empresa não encontrada.", code: "NOT_FOUND" });
          return;
        }
        const sql = onlyWithoutPassword
          ? "SELECT * FROM users u WHERE u.tenant_id = ? AND (u.must_change_password = 1 OR TRIM(COALESCE(u.password_hash, '')) = '') ORDER BY u.nome ASC"
          : "SELECT * FROM users WHERE tenant_id = ? ORDER BY nome ASC";
        const rows = db.prepare(sql).all(t.id) as UserDbRow[];
        res.json({ users: rows.map((r) => rowToUser(r, t.slug, t.name)) });
      } else {
        const whereClause = onlyWithoutPassword
          ? `WHERE t.slug != ? AND ${WITHOUT_PASSWORD_CONDITION}`
          : "WHERE t.slug != ?";
        const rows = db.prepare(`
          SELECT u.*, t.slug AS tenant_slug, t.name AS tenant_name
          FROM users u
          INNER JOIN tenants t ON u.tenant_id = t.id
          ${whereClause}
          ORDER BY t.name ASC, u.nome ASC
        `).all(SYSTEM_TENANT_SLUG) as (UserDbRow & { tenant_slug: string; tenant_name: string })[];
        const users = rows.map((r) => {
          const { tenant_slug, tenant_name, ...userRow } = r;
          return rowToUser(userRow, tenant_slug, tenant_name);
        });
        res.json({ users });
      }
      return;
    }

    let rows: UserDbRow[];
    if (user.role === "ADMIN") {
      rows = db.prepare("SELECT * FROM users WHERE tenant_id = ? ORDER BY nome ASC").all(tenantId) as UserDbRow[];
    } else {
      rows = db.prepare("SELECT * FROM users WHERE tenant_id = ? AND area = ? ORDER BY nome ASC").all(tenantId, user.area) as UserDbRow[];
    }
    res.json({ users: rows.map((r) => rowToUser(r)) });
  } catch {
    res.status(500).json({ error: "Erro ao buscar usuários.", code: "INTERNAL" });
  }
});

// POST /api/users — Admin Mestre: cria em qualquer empresa (body.tenantSlug); empresas só têm USER/LEADER
router.post("/", requireRole("ADMIN"), async (req: Request, res: Response): Promise<void> => {
  try {
    let targetTenantId = req.tenantId!;
    const { nome, email: emailRaw, role, area, canDelete, tenantSlug: bodyTenantSlug } = req.body;

    if (isMasterAdmin(req) && bodyTenantSlug) {
      const t = db.prepare("SELECT id FROM tenants WHERE slug = ? AND slug != ?").get(bodyTenantSlug, SYSTEM_TENANT_SLUG);
      if (!t) {
        res.status(404).json({ error: "Empresa não encontrada.", code: "NOT_FOUND" });
        return;
      }
      targetTenantId = (t as { id: string }).id;
    }

    if (!nome || !emailRaw || !role || !area) {
      res.status(400).json({ error: "Nome, email, role e área são obrigatórios.", code: "MISSING_FIELDS" });
      return;
    }

    const email = safeLowerEmail(emailRaw);
    const isTargetSystem = targetTenantId === SYSTEM_TENANT_ID;

    const existing = db.prepare("SELECT id FROM users WHERE tenant_id = ? AND email = ?").get(targetTenantId, email);
    if (existing) {
      res.status(409).json({ error: "Email já cadastrado nesta empresa.", code: "DUPLICATE_EMAIL" });
      return;
    }

    // Em empresas (não system) só USER e LEADER
    const allowedRoles = isTargetSystem ? ["USER", "LEADER", "ADMIN"] : ["USER", "LEADER"];
    if (!allowedRoles.includes(role)) {
      res.status(400).json({ error: "Nas empresas só são permitidos os perfis Usuário e Líder.", code: "INVALID_ROLE" });
      return;
    }

    const id = uuidv4();
    const now = nowIso();

    db.prepare(`
      INSERT INTO users (id, tenant_id, email, nome, role, area, active, can_delete, password_hash, must_change_password, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, '', 1, ?)
    `).run(id, targetTenantId, email, String(nome).trim(), role, String(area).trim(), canDelete ? 1 : 0, now);

    const created = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserDbRow;
    res.status(201).json({ user: rowToUser(created) });
  } catch {
    res.status(500).json({ error: "Erro ao criar usuário.", code: "INTERNAL" });
  }
});

// PUT /api/users/:id — Admin Mestre: qualquer tenant; senão mesmo tenant
router.put("/:id", requireRole("ADMIN"), (req: Request, res: Response): void => {
  try {
    const tenantId = req.tenantId!;
    const { id } = req.params;

    const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserDbRow | undefined;
    if (!existing) {
      res.status(404).json({ error: "Usuário não encontrado.", code: "NOT_FOUND" });
      return;
    }
    if (!isMasterAdmin(req) && existing.tenant_id !== tenantId) {
      res.status(403).json({ error: "Acesso negado.", code: "FORBIDDEN" });
      return;
    }

    const { nome, role, area, canDelete } = req.body;
    const isTargetSystem = existing.tenant_id === SYSTEM_TENANT_ID;
    const allowedRoles = isTargetSystem ? ["USER", "LEADER", "ADMIN"] : ["USER", "LEADER"];
    if (role && !allowedRoles.includes(role)) {
      res.status(400).json({ error: "Nas empresas só são permitidos Usuário e Líder.", code: "INVALID_ROLE" });
      return;
    }

    db.prepare(`
      UPDATE users SET
        nome = ?, role = ?, area = ?, can_delete = ?
      WHERE id = ?
    `).run(
      nome || existing.nome,
      role || existing.role,
      area || existing.area,
      canDelete !== undefined ? (canDelete ? 1 : 0) : existing.can_delete,
      id
    );

    const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserDbRow;
    res.json({ user: rowToUser(updated) });
  } catch {
    res.status(500).json({ error: "Erro ao atualizar usuário.", code: "INTERNAL" });
  }
});

// GET /api/users/login-counts — logins per user in period (from/to as YYYY-MM). Admin mestre pode passar ?tenant=slug para escopar por empresa.
router.get("/login-counts", requireRole("ADMIN", "LEADER"), (req: Request, res: Response): void => {
  try {
    let tenantId = req.tenantId!;
    const fromYm = (req.query.from as string) || "";
    const toYm = (req.query.to as string) || "";
    const tenantSlug = (req.query.tenant as string) || "";

    if (!fromYm || !toYm) {
      res.json({ counts: {} });
      return;
    }

    // Admin mestre: escopar por empresa (senão req.tenantId é "system" e login_events das empresas não entram)
    if (isMasterAdmin(req) && tenantSlug && tenantSlug !== SYSTEM_TENANT_SLUG) {
      const t = db.prepare("SELECT id FROM tenants WHERE slug = ?").get(tenantSlug) as { id: string } | undefined;
      if (t) tenantId = t.id;
    } else if (isMasterAdmin(req) && !tenantSlug) {
      // Admin mestre sem filtro de empresa: contar logins de todos os tenants (não filtrar por tenant_id)
      const fromDate = `${fromYm}-01T00:00:00.000Z`;
      const [y, m] = toYm.split("-").map(Number);
      const lastDay = new Date(Date.UTC(y, m, 0));
      const toDate = `${toYm}-${String(lastDay.getUTCDate()).padStart(2, "0")}T23:59:59.999Z`;
      const rows = db.prepare(`
        SELECT user_id, COUNT(*) as cnt
        FROM login_events
        WHERE logged_at >= ? AND logged_at <= ?
        GROUP BY user_id
      `).all(fromDate, toDate) as { user_id: string; cnt: number }[];
      const counts: Record<string, number> = {};
      for (const r of rows) counts[r.user_id] = r.cnt;
      res.json({ counts });
      return;
    }

    // YYYY-MM -> first day 00:00 and last day 23:59
    const fromDate = `${fromYm}-01T00:00:00.000Z`;
    const [y, m] = toYm.split("-").map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0));
    const toDate = `${toYm}-${String(lastDay.getUTCDate()).padStart(2, "0")}T23:59:59.999Z`;

    const rows = db.prepare(`
      SELECT user_id, COUNT(*) as cnt
      FROM login_events
      WHERE tenant_id = ? AND logged_at >= ? AND logged_at <= ?
      GROUP BY user_id
    `).all(tenantId, fromDate, toDate) as { user_id: string; cnt: number }[];

    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.user_id] = r.cnt;
    res.json({ counts });
  } catch {
    res.status(500).json({ error: "Erro ao buscar contagem de logins.", code: "INTERNAL" });
  }
});

// PATCH /api/users/bulk-toggle-active — Admin Mestre: qualquer tenant; senão mesmo tenant
router.patch("/bulk-toggle-active", requireRole("ADMIN"), (req: Request, res: Response): void => {
  try {
    const tenantId = req.tenantId!;
    const currentUserId = req.user!.id;
    const { ids, active } = req.body as { ids?: string[]; active?: boolean };

    if (!Array.isArray(ids) || ids.length === 0 || typeof active !== "boolean") {
      res.status(400).json({ error: "ids (array) e active (boolean) são obrigatórios.", code: "MISSING_FIELDS" });
      return;
    }

    const value = active ? 1 : 0;
    let updated = 0;
    for (const id of ids) {
      if (id === currentUserId) continue;
      const row = db.prepare("SELECT tenant_id FROM users WHERE id = ?").get(id) as { tenant_id: string } | undefined;
      if (!row) continue;
      if (!isMasterAdmin(req) && row.tenant_id !== tenantId) continue;
      const result = db.prepare("UPDATE users SET active = ? WHERE id = ?").run(value, id);
      if (result.changes) updated++;
    }

    res.json({ updated });
  } catch {
    res.status(500).json({ error: "Erro ao atualizar usuários.", code: "INTERNAL" });
  }
});

// PATCH /api/users/:id/toggle-active — Admin Mestre: qualquer tenant; senão mesmo tenant
router.patch("/:id/toggle-active", requireRole("ADMIN"), (req: Request, res: Response): void => {
  try {
    const tenantId = req.tenantId!;
    const { id } = req.params;

    if (id === req.user!.id) {
      res.status(400).json({ error: "Não é possível desativar sua própria conta.", code: "SELF_DEACTIVATE" });
      return;
    }

    const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserDbRow | undefined;
    if (!existing) {
      res.status(404).json({ error: "Usuário não encontrado.", code: "NOT_FOUND" });
      return;
    }
    if (!isMasterAdmin(req) && existing.tenant_id !== tenantId) {
      res.status(403).json({ error: "Acesso negado.", code: "FORBIDDEN" });
      return;
    }

    const newActive = existing.active === 1 ? 0 : 1;
    db.prepare("UPDATE users SET active = ? WHERE id = ?").run(newActive, id);

    const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserDbRow;
    res.json({ user: rowToUser(updated) });
  } catch {
    res.status(500).json({ error: "Erro ao atualizar usuário.", code: "INTERNAL" });
  }
});

export default router;
