import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import db from "../db";
import { signToken, requireAuth, AuthError } from "../middleware/auth";
import { safeLowerEmail, toBool, nowIso } from "../utils";
import type { AuthUser } from "../types";

const router = Router();

interface UserDbRow {
  id: string;
  tenant_id: string;
  email: string;
  nome: string;
  role: string;
  area: string;
  active: number;
  can_delete: number;
  password_hash: string;
  must_change_password: number;
  reset_code_hash: string | null;
  reset_code_expires_at: string | null;
}

function rowToAuthUser(row: UserDbRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    nome: row.nome,
    role: row.role as AuthUser["role"],
    area: row.area,
    canDelete: row.can_delete === 1,
    tenantId: row.tenant_id,
  };
}

function genResetCode(): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let out = "";
  const buf = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  try {
    const { email: emailRaw, password } = req.body;
    if (!emailRaw || !password) {
      res.status(400).json({ error: "Email e senha são obrigatórios.", code: "MISSING_FIELDS" });
      return;
    }

    const email = safeLowerEmail(emailRaw);
    const tenantId = req.tenantId!;

    const row = db.prepare("SELECT * FROM users WHERE tenant_id = ? AND email = ?")
      .get(tenantId, email) as UserDbRow | undefined;

    if (!row) throw new AuthError("NO_USER", "Usuário não cadastrado.");
    if (row.active === 0) throw new AuthError("INACTIVE", "Usuário inativo.");

    // Check if reset required
    const needsReset = row.must_change_password === 1 || !row.password_hash?.trim() || !!row.reset_code_hash?.trim();
    if (needsReset) {
      throw new AuthError("RESET_REQUIRED", "Senha precisa ser definida/atualizada.", {
        firstAccess: !row.password_hash?.trim(),
      });
    }

    const ok = await bcrypt.compare(String(password), row.password_hash);
    if (!ok) throw new AuthError("BAD_CREDENTIALS", "Credenciais inválidas.");

    const user = rowToAuthUser(row);
    const token = signToken(user);

    // Registrar evento de login para métricas
    try {
      const eventId = uuidv4();
      db.prepare(
        "INSERT INTO login_events (id, tenant_id, user_id, logged_at) VALUES (?, ?, ?, ?)"
      ).run(eventId, tenantId, row.id, new Date().toISOString());
    } catch {
      // Não falhar o login se o registro falhar
    }

    res.cookie("auth_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 12 * 60 * 60 * 1000,
    });

    res.json({ user });
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(401).json({ error: err.message, code: err.code, meta: err.meta });
    } else {
      res.status(500).json({ error: "Erro interno.", code: "INTERNAL" });
    }
  }
});

// POST /api/auth/reset
router.post("/reset", async (req: Request, res: Response): Promise<void> => {
  try {
    const { email: emailRaw, code: codeRaw, newPassword } = req.body;
    if (!emailRaw || !codeRaw || !newPassword) {
      res.status(400).json({ error: "Campos obrigatórios faltando.", code: "MISSING_FIELDS" });
      return;
    }

    const email = safeLowerEmail(emailRaw);
    const code = String(codeRaw).trim();
    const tenantId = req.tenantId!;

    const row = db.prepare("SELECT * FROM users WHERE tenant_id = ? AND email = ?")
      .get(tenantId, email) as UserDbRow | undefined;

    if (!row) throw new AuthError("NO_USER", "Usuário não cadastrado.");
    if (row.active === 0) throw new AuthError("INACTIVE", "Usuário inativo.");

    const hash = row.reset_code_hash?.trim() || "";
    const exp = row.reset_code_expires_at?.trim() || "";

    if (!hash || !exp) throw new AuthError("NO_RESET", "Não existe reset pendente.");

    const expDate = new Date(exp);
    if (isNaN(expDate.getTime()) || Date.now() > expDate.getTime()) {
      throw new AuthError("RESET_EXPIRED", "Código expirado. Solicite um novo.");
    }

    const ok = await bcrypt.compare(code, hash);
    if (!ok) throw new AuthError("RESET_BAD_CODE", "Código inválido.");

    if (String(newPassword).trim().length < 6) {
      throw new AuthError("WEAK_PASSWORD", "Senha muito curta (mínimo 6 caracteres).");
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    db.prepare(`
      UPDATE users SET password_hash = ?, must_change_password = 0,
        reset_code_hash = NULL, reset_code_expires_at = NULL
      WHERE tenant_id = ? AND email = ?
    `).run(passwordHash, tenantId, email);

    const updatedRow = db.prepare("SELECT * FROM users WHERE tenant_id = ? AND email = ?")
      .get(tenantId, email) as UserDbRow;

    const user = rowToAuthUser(updatedRow);
    const token = signToken(user);

    // Registrar evento de login (reset de senha concluído = novo acesso)
    try {
      const eventId = uuidv4();
      db.prepare(
        "INSERT INTO login_events (id, tenant_id, user_id, logged_at) VALUES (?, ?, ?, ?)"
      ).run(eventId, tenantId, updatedRow.id, new Date().toISOString());
    } catch {
      // Não falhar se o registro falhar
    }

    res.cookie("auth_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 12 * 60 * 60 * 1000,
    });

    res.json({ user });
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(401).json({ error: err.message, code: err.code, meta: err.meta });
    } else {
      res.status(500).json({ error: "Erro interno.", code: "INTERNAL" });
    }
  }
});

// POST /api/auth/logout
router.post("/logout", (_req: Request, res: Response): void => {
  res.clearCookie("auth_token");
  res.clearCookie("csrf_token");
  res.json({ ok: true });
});

// GET /api/auth/me
router.get("/me", requireAuth, (req: Request, res: Response): void => {
  res.json({
    user: req.user,
    tenant: req.tenant,
    isImpersonating: !!req.impersonating,
  });
});

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 12 * 60 * 60 * 1000,
};

// POST /api/auth/impersonate — Admin mestre: visualizar como outro usuário (somente leitura)
router.post("/impersonate", requireAuth, (req: Request, res: Response): Promise<void> => {
  return (async () => {
    if (req.user!.role !== "ADMIN" || req.tenant?.slug !== "system") {
      res.status(403).json({ error: "Apenas o administrador mestre pode usar esta função.", code: "FORBIDDEN" });
      return;
    }
    const { userId } = req.body;
    if (!userId || typeof userId !== "string") {
      res.status(400).json({ error: "userId é obrigatório.", code: "MISSING_USER_ID" });
      return;
    }
    const systemTenant = db.prepare("SELECT id FROM tenants WHERE slug = 'system'").get() as { id: string } | undefined;
    if (!systemTenant) {
      res.status(500).json({ error: "Configuração do sistema inválida.", code: "INTERNAL" });
      return;
    }
    const targetRow = db.prepare(
      "SELECT id, tenant_id, email, nome, role, area, can_delete FROM users WHERE id = ? AND active = 1"
    ).get(userId) as (UserDbRow & { can_delete: number }) | undefined;
    if (!targetRow) {
      res.status(404).json({ error: "Usuário não encontrado ou inativo.", code: "NO_USER" });
      return;
    }
    if (targetRow.tenant_id === systemTenant.id) {
      res.status(400).json({ error: "Não é possível visualizar como outro administrador do sistema.", code: "INVALID_TARGET" });
      return;
    }
    const tenantRow = db.prepare("SELECT id, slug, name, active, created_at FROM tenants WHERE id = ? AND active = 1")
      .get(targetRow.tenant_id) as { id: string; slug: string; name: string; active: number; created_at: string } | undefined;
    if (!tenantRow) {
      res.status(404).json({ error: "Empresa do usuário não encontrada ou inativa.", code: "TENANT_NOT_FOUND" });
      return;
    }
    const targetUser = rowToAuthUser(targetRow as UserDbRow);
    const newToken = signToken(targetUser);
    const currentToken = req.cookies?.["auth_token"];
    if (currentToken) {
      res.cookie("auth_real_token", currentToken, { ...COOKIE_OPTIONS, maxAge: 12 * 60 * 60 * 1000 });
    }
    res.cookie("auth_token", newToken, COOKIE_OPTIONS);
    res.json({
      user: targetUser,
      tenant: { id: tenantRow.id, slug: tenantRow.slug, name: tenantRow.name },
    });
  })();
});

// POST /api/auth/impersonate/stop — Voltar à conta do administrador mestre
router.post("/impersonate/stop", requireAuth, (req: Request, res: Response): void => {
  const realToken = req.cookies?.["auth_real_token"];
  if (!realToken) {
    res.status(400).json({ error: "Não está visualizando como outro usuário.", code: "NOT_IMPERSONATING" });
    return;
  }
  try {
    const payload = require("../middleware/auth").verifyToken(realToken);
    res.cookie("auth_token", realToken, COOKIE_OPTIONS);
    res.clearCookie("auth_real_token", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    const tenantRow = db.prepare("SELECT id, slug, name FROM tenants WHERE id = ?")
      .get(payload.tenantId) as { id: string; slug: string; name: string } | undefined;
    res.json({
      user: payload,
      tenant: tenantRow ? { id: tenantRow.id, slug: tenantRow.slug, name: tenantRow.name } : req.tenant,
    });
  } catch {
    res.clearCookie("auth_real_token", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    res.status(401).json({ error: "Sessão original expirada. Faça login novamente.", code: "TOKEN_EXPIRED" });
  }
});

// POST /api/auth/generate-reset (ADMIN only)
router.post("/generate-reset", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user!.role !== "ADMIN") {
      res.status(403).json({ error: "Apenas ADMIN.", code: "FORBIDDEN" });
      return;
    }

    const { email: emailRaw, tenantSlug: bodyTenantSlug } = req.body;
    if (!emailRaw) {
      res.status(400).json({ error: "Email é obrigatório.", code: "MISSING_EMAIL" });
      return;
    }

    const email = safeLowerEmail(emailRaw);
    let tenantId = req.tenantId!;
    if (req.tenant?.slug === "system" && bodyTenantSlug) {
      const t = db.prepare("SELECT id FROM tenants WHERE slug = ?").get(bodyTenantSlug) as { id: string } | undefined;
      if (t) tenantId = t.id;
    }

    const row = db.prepare("SELECT * FROM users WHERE tenant_id = ? AND email = ?")
      .get(tenantId, email) as UserDbRow | undefined;

    if (!row) {
      res.status(404).json({ error: "Usuário não encontrado.", code: "NO_USER" });
      return;
    }
    if (row.active === 0) {
      res.status(400).json({ error: "Usuário inativo.", code: "INACTIVE" });
      return;
    }

    const code = genResetCode();
    const resetCodeHash = await bcrypt.hash(code, 12);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    db.prepare(`
      UPDATE users SET must_change_password = 1, reset_code_hash = ?, reset_code_expires_at = ?
      WHERE tenant_id = ? AND email = ?
    `).run(resetCodeHash, expiresAt, tenantId, email);

    res.json({ email, code, expiresAt });
  } catch {
    res.status(500).json({ error: "Erro interno.", code: "INTERNAL" });
  }
});

export default router;
