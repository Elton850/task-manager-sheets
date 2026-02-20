import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import db, { SYSTEM_TENANT_ID } from "./index";

/**
 * Cria o administrador do sistema na primeira execução, quando as variáveis
 * SYSTEM_ADMIN_EMAIL e SYSTEM_ADMIN_PASSWORD estiverem definidas.
 * Esse usuário pertence ao tenant "system" e é o único que pode cadastrar empresas.
 */
export function seedSystemAdminIfNeeded(): void {
  const email = process.env.SYSTEM_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SYSTEM_ADMIN_PASSWORD;
  if (!email || !password || password.length < 6) return;

  const existing = db.prepare("SELECT id FROM users WHERE tenant_id = ? AND email = ?").get(SYSTEM_TENANT_ID, email);
  if (existing) return;

  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 12);
  const now = new Date().toISOString();
  const nome = process.env.SYSTEM_ADMIN_NOME?.trim() || "Administrador do Sistema";

  db.prepare(`
    INSERT INTO users (id, tenant_id, email, nome, role, area, active, can_delete, password_hash, must_change_password, created_at)
    VALUES (?, ?, ?, ?, 'ADMIN', 'Sistema', 1, 0, ?, 0, ?)
  `).run(id, SYSTEM_TENANT_ID, email, nome, passwordHash, now);

  console.log("[seed] Administrador do sistema criado:", email);
}
