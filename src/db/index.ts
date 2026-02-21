// Uses Node.js built-in SQLite (available since Node.js v22.5.0)
// No native compilation needed — works out of the box
import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";

const DB_PATH = path.resolve(process.cwd(), "data", "taskmanager.db");

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

// Performance optimizations
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA synchronous = NORMAL");

// Create schema
db.exec(`
  CREATE TABLE IF NOT EXISTS tenants (
    id          TEXT PRIMARY KEY,
    slug        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id                    TEXT PRIMARY KEY,
    tenant_id             TEXT NOT NULL REFERENCES tenants(id),
    email                 TEXT NOT NULL,
    nome                  TEXT NOT NULL,
    role                  TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('USER','LEADER','ADMIN')),
    area                  TEXT NOT NULL DEFAULT '',
    active                INTEGER NOT NULL DEFAULT 1,
    can_delete            INTEGER NOT NULL DEFAULT 0,
    password_hash         TEXT NOT NULL DEFAULT '',
    must_change_password  INTEGER NOT NULL DEFAULT 1,
    reset_code_hash       TEXT,
    reset_code_expires_at TEXT,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(tenant_id, email)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id                TEXT PRIMARY KEY,
    tenant_id         TEXT NOT NULL REFERENCES tenants(id),
    competencia_ym    TEXT NOT NULL,
    recorrencia       TEXT NOT NULL,
    tipo              TEXT NOT NULL,
    atividade         TEXT NOT NULL,
    responsavel_email TEXT NOT NULL,
    responsavel_nome  TEXT NOT NULL,
    area              TEXT NOT NULL,
    prazo             TEXT,
    realizado         TEXT,
    status            TEXT NOT NULL DEFAULT 'Em Andamento',
    observacoes       TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    created_by        TEXT NOT NULL,
    updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_by        TEXT NOT NULL,
    deleted_at        TEXT,
    deleted_by        TEXT
  );

  CREATE TABLE IF NOT EXISTS lookups (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id),
    category    TEXT NOT NULL,
    value       TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(tenant_id, category, value)
  );

  CREATE TABLE IF NOT EXISTS rules (
    id                    TEXT PRIMARY KEY,
    tenant_id             TEXT NOT NULL REFERENCES tenants(id),
    area                  TEXT NOT NULL,
    allowed_recorrencias  TEXT NOT NULL DEFAULT '[]',
    updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_by            TEXT NOT NULL,
    UNIQUE(tenant_id, area)
  );

  CREATE TABLE IF NOT EXISTS task_evidences (
    id           TEXT PRIMARY KEY,
    tenant_id    TEXT NOT NULL REFERENCES tenants(id),
    task_id      TEXT NOT NULL REFERENCES tasks(id),
    file_name    TEXT NOT NULL,
    file_path    TEXT NOT NULL,
    mime_type    TEXT NOT NULL,
    file_size    INTEGER NOT NULL DEFAULT 0,
    uploaded_at  TEXT NOT NULL DEFAULT (datetime('now')),
    uploaded_by  TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_tenant    ON tasks(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_tenant_status ON tasks(tenant_id, status);
  CREATE INDEX IF NOT EXISTS idx_tasks_area      ON tasks(tenant_id, area);
  CREATE INDEX IF NOT EXISTS idx_tasks_resp      ON tasks(tenant_id, responsavel_email);
  CREATE INDEX IF NOT EXISTS idx_tasks_ym        ON tasks(tenant_id, competencia_ym);
  CREATE INDEX IF NOT EXISTS idx_users_tenant    ON users(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_lookups_tenant  ON lookups(tenant_id, category);
  CREATE TABLE IF NOT EXISTS login_events (
    id         TEXT PRIMARY KEY,
    tenant_id  TEXT NOT NULL REFERENCES tenants(id),
    user_id    TEXT NOT NULL REFERENCES users(id),
    logged_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_evidence_task   ON task_evidences(task_id);
  CREATE INDEX IF NOT EXISTS idx_evidence_tenant ON task_evidences(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_login_events_tenant_user ON login_events(tenant_id, user_id);
  CREATE INDEX IF NOT EXISTS idx_login_events_logged_at ON login_events(logged_at);
`);

// Tenant "system" para o administrador do sistema (único usuário que cadastra empresas)
const SYSTEM_TENANT_ID = "00000000-0000-0000-0000-000000000001";
try {
  db.prepare(
    "INSERT OR IGNORE INTO tenants (id, slug, name, active, created_at) VALUES (?, 'system', 'Sistema', 1, datetime('now'))"
  ).run(SYSTEM_TENANT_ID);
} catch {
  // ignorar se já existir
}

// Migração: coluna logo_path em tenants (logo por empresa)
try {
  const cols = db.prepare("PRAGMA table_info(tenants)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "logo_path")) {
    db.exec("ALTER TABLE tenants ADD COLUMN logo_path TEXT");
  }
} catch {
  // ignorar se já existir ou falha
}

// Migração: logo_updated_at para invalidar cache da logo quando alterada
try {
  const cols = db.prepare("PRAGMA table_info(tenants)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "logo_updated_at")) {
    db.exec("ALTER TABLE tenants ADD COLUMN logo_updated_at TEXT");
    db.exec("UPDATE tenants SET logo_updated_at = datetime('now') WHERE logo_path IS NOT NULL AND logo_path != ''");
  }
} catch {
  // ignorar
}

// Migração: último login e logout por usuário (para log na área do usuário e na página de controle)
try {
  const userCols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!userCols.some((c) => c.name === "last_login_at")) {
    db.exec("ALTER TABLE users ADD COLUMN last_login_at TEXT");
  }
  if (!userCols.some((c) => c.name === "last_logout_at")) {
    db.exec("ALTER TABLE users ADD COLUMN last_logout_at TEXT");
  }
} catch {
  // ignorar
}

// Migração: auditoria de prazo e conclusão (quem modificou prazo / quem concluiu)
try {
  const taskCols = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
  if (!taskCols.some((c) => c.name === "prazo_modified_by")) {
    db.exec("ALTER TABLE tasks ADD COLUMN prazo_modified_by TEXT");
  }
  if (!taskCols.some((c) => c.name === "realizado_por")) {
    db.exec("ALTER TABLE tasks ADD COLUMN realizado_por TEXT");
  }
} catch {
  // ignorar
}

// Migração: sub tarefas (tarefa filha vinculada a uma tarefa principal)
try {
  const taskCols = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
  if (!taskCols.some((c) => c.name === "parent_task_id")) {
    db.exec("ALTER TABLE tasks ADD COLUMN parent_task_id TEXT REFERENCES tasks(id)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id) WHERE parent_task_id IS NOT NULL");
  }
} catch {
  // ignorar
}

export default db;
export { SYSTEM_TENANT_ID };
