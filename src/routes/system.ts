import { Router, Request, Response } from "express";
import db from "../db";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

const SYSTEM_TENANT_SLUG = "system";

function isSystemAdmin(req: Request): boolean {
  return !!(req.user && req.tenant?.slug === SYSTEM_TENANT_SLUG && req.user.role === "ADMIN");
}

/** GET /api/system/stats — visão geral (apenas admin do sistema) */
router.get("/stats", (req: Request, res: Response): void => {
  try {
    if (!isSystemAdmin(req)) {
      res.status(403).json({ error: "Acesso apenas para administrador do sistema.", code: "FORBIDDEN" });
      return;
    }
    const tenantsCount = db.prepare(
      "SELECT COUNT(*) as c FROM tenants WHERE slug != ? AND active = 1"
    ).get(SYSTEM_TENANT_SLUG) as { c: number };
    const usersCount = db.prepare(
      "SELECT COUNT(*) as c FROM users u JOIN tenants t ON t.id = u.tenant_id WHERE t.slug != ? AND u.tenant_id IS NOT NULL"
    ).get(SYSTEM_TENANT_SLUG) as { c: number };
    const tasksCount = db.prepare(
      "SELECT COUNT(*) as c FROM tasks WHERE deleted_at IS NULL"
    ).get() as { c: number };
    const recentLogins = db.prepare(`
      SELECT le.logged_at, le.tenant_id, le.user_id,
             t.slug as tenant_slug, t.name as tenant_name,
             u.email as user_email, u.nome as user_nome
      FROM login_events le
      JOIN tenants t ON t.id = le.tenant_id
      JOIN users u ON u.id = le.user_id
      WHERE t.slug != ?
      ORDER BY le.logged_at DESC
      LIMIT 30
    `).all(SYSTEM_TENANT_SLUG) as {
      logged_at: string;
      tenant_id: string;
      user_id: string;
      tenant_slug: string;
      tenant_name: string;
      user_email: string;
      user_nome: string;
    }[];
    res.json({
      tenantsCount: tenantsCount?.c ?? 0,
      usersCount: usersCount?.c ?? 0,
      tasksCount: tasksCount?.c ?? 0,
      recentLogins: recentLogins.map(r => ({
        loggedAt: r.logged_at,
        tenantSlug: r.tenant_slug,
        tenantName: r.tenant_name,
        userEmail: r.user_email,
        userName: r.user_nome,
      })),
    });
  } catch {
    res.status(500).json({ error: "Erro ao buscar estatísticas.", code: "INTERNAL" });
  }
});

/** GET /api/system/login-logs — log de acessos (apenas admin do sistema) */
router.get("/login-logs", (req: Request, res: Response): void => {
  try {
    if (!isSystemAdmin(req)) {
      res.status(403).json({ error: "Acesso apenas para administrador do sistema.", code: "FORBIDDEN" });
      return;
    }
    const fromYm = (req.query.from as string) || "";
    const toYm = (req.query.to as string) || "";
    const tenantSlug = (req.query.tenant as string) || "";
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || "100"), 10) || 100, 10), 500);

    let where = "t.slug != ?";
    const params: (string | number)[] = [SYSTEM_TENANT_SLUG];
    if (tenantSlug) {
      where += " AND t.slug = ?";
      params.push(tenantSlug);
    }
    if (fromYm) {
      where += " AND le.logged_at >= ?";
      params.push(`${fromYm}-01T00:00:00.000Z`);
    }
    if (toYm) {
      const [y, m] = toYm.split("-").map(Number);
      const lastDay = new Date(Date.UTC(y, m, 0));
      const toDate = `${toYm}-${String(lastDay.getUTCDate()).padStart(2, "0")}T23:59:59.999Z`;
      where += " AND le.logged_at <= ?";
      params.push(toDate);
    }
    params.push(limit);

    const rows = db.prepare(`
      SELECT le.logged_at, le.tenant_id, le.user_id,
             t.slug as tenant_slug, t.name as tenant_name,
             u.email as user_email, u.nome as user_nome
      FROM login_events le
      JOIN tenants t ON t.id = le.tenant_id
      JOIN users u ON u.id = le.user_id
      WHERE ${where}
      ORDER BY le.logged_at DESC
      LIMIT ?
    `).all(...params) as {
      logged_at: string;
      tenant_slug: string;
      tenant_name: string;
      user_email: string;
      user_nome: string;
    }[];

    res.json({
      items: rows.map(r => ({
        loggedAt: r.logged_at,
        tenantSlug: r.tenant_slug,
        tenantName: r.tenant_name,
        userEmail: r.user_email,
        userName: r.user_nome,
      })),
    });
  } catch {
    res.status(500).json({ error: "Erro ao buscar logs de acesso.", code: "INTERNAL" });
  }
});

export default router;
