/**
 * Seed única para banco LOCAL: limpa todos os dados e recria dados fictícios.
 * Uso: npm run seed:local          → limpa tudo e insere dados
 *      npm run seed:local -- --clean → só limpa (e recria tenant system)
 *
 * SEGURANÇA: Só permite limpeza total quando NODE_ENV !== 'production' ou com --local.
 * Destinado apenas ao banco local (data/taskmanager.db em desenvolvimento).
 */
import "dotenv/config";
import path from "path";
import fs from "fs";
import db, { SYSTEM_TENANT_ID } from "./index";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { seedSystemAdminIfNeeded } from "./seedSystemAdmin";

const LOCAL_DB_DIR = path.resolve(process.cwd(), "data");
const MOCK_PASSWORD = "123456";

const DEFAULT_LOOKUPS: Record<string, string[]> = {
  AREA: ["TI", "Financeiro", "RH", "Operações", "Comercial"],
  RECORRENCIA: ["Diário", "Semanal", "Quinzenal", "Mensal", "Trimestral", "Semestral", "Anual", "Pontual"],
  TIPO: ["Rotina", "Projeto", "Reunião", "Auditoria", "Treinamento"],
};

const TASK_TEMPLATES: Array<{ atividade: string; recorrencia: string; tipo: string; status: string; observacoes: string | null }> = [
  { atividade: "Relatório periódico da área", recorrencia: "Mensal", tipo: "Rotina", status: "Em Andamento", observacoes: "Entrega até o último dia do mês" },
  { atividade: "Reunião de alinhamento semanal", recorrencia: "Semanal", tipo: "Reunião", status: "Em Andamento", observacoes: null },
  { atividade: "Auditoria interna de processos", recorrencia: "Trimestral", tipo: "Auditoria", status: "Em Andamento", observacoes: null },
  { atividade: "Projeto de melhoria contínua", recorrencia: "Pontual", tipo: "Projeto", status: "Em Andamento", observacoes: null },
  { atividade: "Treinamento da equipe", recorrencia: "Semestral", tipo: "Treinamento", status: "Concluído", observacoes: null },
  { atividade: "Conferência de indicadores", recorrencia: "Quinzenal", tipo: "Rotina", status: "Em Andamento", observacoes: null },
  { atividade: "Reunião de feedback", recorrencia: "Mensal", tipo: "Reunião", status: "Concluído", observacoes: null },
  { atividade: "Documentação de procedimentos", recorrencia: "Pontual", tipo: "Rotina", status: "Em Atraso", observacoes: "Pendente atualização" },
];

interface TenantSpec {
  slug: string;
  name: string;
  leaders: Array<{
    area: string;
    nome: string;
    email: string;
    collaborators: Array<{ nome: string; email: string }>;
  }>;
}

const TENANTS_SPEC: TenantSpec[] = [
  {
    slug: "empresa-alpha",
    name: "Empresa Alpha",
    leaders: [
      { area: "TI", nome: "Carlos Silva", email: "lider.ti@empresa-alpha.com", collaborators: [{ nome: "Ana Costa", email: "ana.costa@empresa-alpha.com" }, { nome: "Bruno Lima", email: "bruno.lima@empresa-alpha.com" }, { nome: "Carla Mendes", email: "carla.mendes@empresa-alpha.com" }, { nome: "Diego Oliveira", email: "diego.oliveira@empresa-alpha.com" }] },
      { area: "Financeiro", nome: "Fernanda Santos", email: "lider.financeiro@empresa-alpha.com", collaborators: [{ nome: "Eduardo Rocha", email: "eduardo.rocha@empresa-alpha.com" }, { nome: "Gabriela Alves", email: "gabriela.alves@empresa-alpha.com" }, { nome: "Henrique Pereira", email: "henrique.pereira@empresa-alpha.com" }] },
    ],
  },
  {
    slug: "empresa-beta",
    name: "Empresa Beta",
    leaders: [
      { area: "RH", nome: "Patricia Souza", email: "lider.rh@empresa-beta.com", collaborators: [{ nome: "Julia Ferreira", email: "julia.ferreira@empresa-beta.com" }, { nome: "Lucas Martins", email: "lucas.martins@empresa-beta.com" }, { nome: "Mariana Ribeiro", email: "mariana.ribeiro@empresa-beta.com" }, { nome: "Nicolas Carvalho", email: "nicolas.carvalho@empresa-beta.com" }] },
      { area: "Operações", nome: "Ricardo Nascimento", email: "lider.operacoes@empresa-beta.com", collaborators: [{ nome: "Otavio Dias", email: "otavio.dias@empresa-beta.com" }, { nome: "Paula Gomes", email: "paula.gomes@empresa-beta.com" }, { nome: "Rafael Teixeira", email: "rafael.teixeira@empresa-beta.com" }] },
    ],
  },
];

function isLocalAllowed(): boolean {
  if (process.env.NODE_ENV === "production" && !process.argv.includes("--local")) {
    return false;
  }
  return true;
}

/**
 * Apaga todos os dados do banco na ordem correta (respeitando FK).
 * Em seguida recria o tenant "system".
 */
function cleanAll(): void {
  if (!isLocalAllowed()) {
    console.error("❌ Limpeza total só é permitida em ambiente local (NODE_ENV !== 'production' ou use --local).");
    process.exit(1);
  }
  const dbPath = path.join(LOCAL_DB_DIR, "taskmanager.db");
  if (!fs.existsSync(dbPath)) {
    console.error("❌ Banco local não encontrado em data/taskmanager.db. Abortando.");
    process.exit(1);
  }

  console.log("🧹 Limpando todo o banco de dados (apenas local)...\n");
  db.exec("BEGIN TRANSACTION");
  try {
    db.prepare("DELETE FROM justification_evidences").run();
    db.prepare("DELETE FROM task_justifications").run();
    db.prepare("DELETE FROM task_evidences").run();
    db.prepare("DELETE FROM tasks").run();
    db.prepare("DELETE FROM rules").run();
    db.prepare("DELETE FROM lookups").run();
    db.prepare("DELETE FROM login_events").run();
    db.prepare("DELETE FROM users").run();
    db.prepare("DELETE FROM tenants").run();
    db.exec("COMMIT");
    console.log("   Tabelas esvaziadas.");

    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO tenants (id, slug, name, active, created_at) VALUES (?, 'system', 'Sistema', 1, ?)"
    ).run(SYSTEM_TENANT_ID, now);
    console.log("   Tenant 'system' recriado.\n✅ Limpeza concluída.");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function getAllPeopleFromSpec(spec: TenantSpec): Array<{ email: string; nome: string; area: string }> {
  const people: Array<{ email: string; nome: string; area: string }> = [];
  for (const leader of spec.leaders) {
    people.push({ email: leader.email, nome: leader.nome, area: leader.area });
    for (const col of leader.collaborators) {
      people.push({ email: col.email, nome: col.nome, area: leader.area });
    }
  }
  return people;
}

function insertLookups(tenantId: string, now: string): void {
  let order = 0;
  for (const [category, values] of Object.entries(DEFAULT_LOOKUPS)) {
    for (const value of values) {
      db.prepare("INSERT OR IGNORE INTO lookups (id, tenant_id, category, value, order_index, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(uuidv4(), tenantId, category, value, order++, now);
    }
  }
}

function insertRulesForSpec(tenantId: string, spec: TenantSpec, now: string): void {
  const areas = [...new Set(spec.leaders.map(l => l.area))];
  const allowedJson = JSON.stringify(DEFAULT_LOOKUPS.RECORRENCIA);
  for (const area of areas) {
    db.prepare(
      "INSERT INTO rules (id, tenant_id, area, allowed_recorrencias, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(uuidv4(), tenantId, area, allowedJson, now, "seed");
  }
}

function insertTasksForTenant(tenantId: string, spec: TenantSpec, now: string): number {
  const people = getAllPeopleFromSpec(spec);
  const competenciaMonths = ["2026-01", "2026-02", "2026-03"];
  let inserted = 0;
  const insertTask = db.prepare(`
    INSERT INTO tasks (id, tenant_id, competencia_ym, recorrencia, tipo, atividade,
      responsavel_email, responsavel_nome, area, prazo, realizado, status, observacoes,
      created_at, created_by, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (let i = 0; i < people.length; i++) {
    const person = people[i];
    const numTasks = 2 + (i % 3);
    for (let t = 0; t < numTasks; t++) {
      const tmpl = TASK_TEMPLATES[(i + t) % TASK_TEMPLATES.length];
      const ym = competenciaMonths[t % competenciaMonths.length];
      const prazo = ym + (tmpl.status === "Concluído" ? "-15" : "-28");
      const realizado = tmpl.status === "Concluído" ? ym + "-14" : null;
      insertTask.run(
        uuidv4(), tenantId, ym, tmpl.recorrencia, tmpl.tipo, tmpl.atividade,
        person.email, person.nome, person.area, prazo, realizado, tmpl.status, tmpl.observacoes,
        now, person.email, now, person.email
      );
      inserted++;
    }
  }
  return inserted;
}

async function seedData(): Promise<void> {
  const passwordHash = await bcrypt.hash(MOCK_PASSWORD, 12);
  const now = new Date().toISOString();

  // 1) Demo (tenant simples com 1 admin e poucas tarefas)
  const demoSlug = "demo";
  if (!db.prepare("SELECT id FROM tenants WHERE slug = ?").get(demoSlug)) {
    const demoTenantId = uuidv4();
    const adminId = uuidv4();
    db.exec("BEGIN TRANSACTION");
    try {
      db.prepare("INSERT INTO tenants (id, slug, name, active, created_at) VALUES (?, ?, ?, 1, ?)")
        .run(demoTenantId, demoSlug, "Empresa Demo", now);
      db.prepare(`
        INSERT INTO users (id, tenant_id, email, nome, role, area, active, can_delete, password_hash, must_change_password, created_at)
        VALUES (?, ?, ?, ?, 'ADMIN', 'TI', 1, 1, ?, 0, ?)
      `).run(adminId, demoTenantId, "admin@demo.com", "Administrador", passwordHash, now);
      insertLookups(demoTenantId, now);
      const sampleTasks = [
        { competenciaYm: "2026-02", recorrencia: "Mensal", tipo: "Rotina", atividade: "Relatório mensal de TI", prazo: "2026-02-28", realizado: null, status: "Em Andamento", observacoes: "Relatório de infraestrutura" },
        { competenciaYm: "2026-02", recorrencia: "Pontual", tipo: "Projeto", atividade: "Migração para novo servidor", prazo: "2026-02-15", realizado: null, status: "Em Atraso", observacoes: null },
        { competenciaYm: "2026-01", recorrencia: "Mensal", tipo: "Reunião", atividade: "Reunião de alinhamento", prazo: "2026-01-31", realizado: "2026-01-30", status: "Concluído", observacoes: null },
      ];
      for (const t of sampleTasks) {
        db.prepare(`
          INSERT INTO tasks (id, tenant_id, competencia_ym, recorrencia, tipo, atividade,
            responsavel_email, responsavel_nome, area, prazo, realizado, status, observacoes,
            created_at, created_by, updated_at, updated_by)
          VALUES (?, ?, ?, ?, ?, ?, 'admin@demo.com', 'Administrador', 'TI', ?, ?, ?, ?, ?, 'admin@demo.com', ?, 'admin@demo.com')
        `).run(uuidv4(), demoTenantId, t.competenciaYm, t.recorrencia, t.tipo, t.atividade, t.prazo, t.realizado, t.status, t.observacoes, now, now);
      }
      db.exec("COMMIT");
      console.log("✅ Demo: admin@demo.com / " + MOCK_PASSWORD);
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }

  // 2) Empresa Alpha e Beta (líderes, colaboradores, tarefas)
  for (const spec of TENANTS_SPEC) {
    if (db.prepare("SELECT id FROM tenants WHERE slug = ?").get(spec.slug)) continue;
    const tenantId = uuidv4();
    db.exec("BEGIN TRANSACTION");
    try {
      db.prepare("INSERT INTO tenants (id, slug, name, active, created_at) VALUES (?, ?, ?, 1, ?)")
        .run(tenantId, spec.slug, spec.name, now);
      insertLookups(tenantId, now);
      insertRulesForSpec(tenantId, spec, now);
      for (const leader of spec.leaders) {
        db.prepare(`
          INSERT INTO users (id, tenant_id, email, nome, role, area, active, can_delete, password_hash, must_change_password, created_at)
          VALUES (?, ?, ?, ?, 'LEADER', ?, 1, 1, ?, 0, ?)
        `).run(uuidv4(), tenantId, leader.email, leader.nome, leader.area, passwordHash, now);
        for (const col of leader.collaborators) {
          db.prepare(`
            INSERT INTO users (id, tenant_id, email, nome, role, area, active, can_delete, password_hash, must_change_password, created_at)
            VALUES (?, ?, ?, ?, 'USER', ?, 1, 1, ?, 0, ?)
          `).run(uuidv4(), tenantId, col.email, col.nome, leader.area, passwordHash, now);
        }
      }
      const n = insertTasksForTenant(tenantId, spec, now);
      db.exec("COMMIT");
      console.log(`✅ ${spec.name} (${spec.slug}): ${n} tarefas, líderes e colaboradores`);
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }

  seedSystemAdminIfNeeded();
}

async function main(): Promise<void> {
  const cleanOnly = process.argv.includes("--clean");
  if (cleanOnly) {
    cleanAll();
    return;
  }
  cleanAll();
  console.log("\n🌱 Inserindo dados fictícios...\n");
  await seedData();
  console.log("\n🎉 Seed local concluído!");
  console.log("\n📋 Acesso (senha padrão: " + MOCK_PASSWORD + "):");
  console.log("   Demo:        ?tenant=demo          → admin@demo.com");
  console.log("   Empresa Alpha: ?tenant=empresa-alpha → lider.ti@empresa-alpha.com, etc.");
  console.log("   Empresa Beta:  ?tenant=empresa-beta  → lider.rh@empresa-beta.com, etc.");
  console.log("   Sistema (admin): tenant system + SYSTEM_ADMIN_EMAIL no .env");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
}).finally(() => process.exit(0));
