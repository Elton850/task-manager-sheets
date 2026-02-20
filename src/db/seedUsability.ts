/**
 * Seed de dados mock para testes de usabilidade.
 * Cria 2 empresas, cada uma com 2 LEADERs (áreas distintas) e 3–4 colaboradores (USER) por líder,
 * e atividades (tarefas) mock para todos os usuários.
 * Não altera lógica nem código existente; apenas insere dados no banco.
 *
 * Execução:     npm run seed:usability   ou   npx ts-node src/db/seedUsability.ts
 * Apagar dados: npm run seed:usability:clean   ou   npx ts-node src/db/seedUsability.ts --clean
 */
import "dotenv/config";
import db from "./index";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

const MOCK_PASSWORD = "123456";

/** Slugs dos tenants criados por esta seed; usado para apagar somente esses dados. */
const USABILITY_SLUGS = ["empresa-alpha", "empresa-beta"];

const DEFAULT_LOOKUPS: Record<string, string[]> = {
  AREA: ["TI", "Financeiro", "RH", "Operações", "Comercial"],
  RECORRENCIA: ["Diário", "Semanal", "Quinzenal", "Mensal", "Trimestral", "Semestral", "Anual", "Pontual"],
  TIPO: ["Rotina", "Projeto", "Reunião", "Auditoria", "Treinamento"],
};

/** Templates de atividades para atribuir aos usuários (recorrencia/tipo/status dentro dos lookups). */
const TASK_TEMPLATES: Array<{ atividade: string; recorrencia: string; tipo: string; status: string; observacoes: string | null }> = [
  { atividade: "Relatório periódico da área", recorrencia: "Mensal", tipo: "Rotina", status: "Em Andamento", observacoes: "Entrega até o último dia do mês" },
  { atividade: "Reunião de alinhamento semanal", recorrencia: "Semanal", tipo: "Reunião", status: "Em Andamento", observacoes: null },
  { atividade: "Auditoria interna de processos", recorrencia: "Trimestral", tipo: "Auditoria", status: "Em Andamento", observacoes: "Conforme cronograma" },
  { atividade: "Projeto de melhoria contínua", recorrencia: "Pontual", tipo: "Projeto", status: "Em Andamento", observacoes: null },
  { atividade: "Treinamento da equipe", recorrencia: "Semestral", tipo: "Treinamento", status: "Concluído", observacoes: "Realizado no período" },
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

interface Person {
  email: string;
  nome: string;
  area: string;
}

function getAllPeopleFromSpec(spec: TenantSpec): Person[] {
  const people: Person[] = [];
  for (const leader of spec.leaders) {
    people.push({ email: leader.email, nome: leader.nome, area: leader.area });
    for (const col of leader.collaborators) {
      people.push({ email: col.email, nome: col.nome, area: leader.area });
    }
  }
  return people;
}

function insertMockTasksForTenant(tenantId: string, spec: TenantSpec, now: string): number {
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

const TENANTS_SPEC: TenantSpec[] = [
  {
    slug: "empresa-alpha",
    name: "Empresa Alpha",
    leaders: [
      {
        area: "TI",
        nome: "Carlos Silva",
        email: "lider.ti@empresa-alpha.com",
        collaborators: [
          { nome: "Ana Costa", email: "ana.costa@empresa-alpha.com" },
          { nome: "Bruno Lima", email: "bruno.lima@empresa-alpha.com" },
          { nome: "Carla Mendes", email: "carla.mendes@empresa-alpha.com" },
          { nome: "Diego Oliveira", email: "diego.oliveira@empresa-alpha.com" },
        ],
      },
      {
        area: "Financeiro",
        nome: "Fernanda Santos",
        email: "lider.financeiro@empresa-alpha.com",
        collaborators: [
          { nome: "Eduardo Rocha", email: "eduardo.rocha@empresa-alpha.com" },
          { nome: "Gabriela Alves", email: "gabriela.alves@empresa-alpha.com" },
          { nome: "Henrique Pereira", email: "henrique.pereira@empresa-alpha.com" },
        ],
      },
    ],
  },
  {
    slug: "empresa-beta",
    name: "Empresa Beta",
    leaders: [
      {
        area: "RH",
        nome: "Patricia Souza",
        email: "lider.rh@empresa-beta.com",
        collaborators: [
          { nome: "Julia Ferreira", email: "julia.ferreira@empresa-beta.com" },
          { nome: "Lucas Martins", email: "lucas.martins@empresa-beta.com" },
          { nome: "Mariana Ribeiro", email: "mariana.ribeiro@empresa-beta.com" },
          { nome: "Nicolas Carvalho", email: "nicolas.carvalho@empresa-beta.com" },
        ],
      },
      {
        area: "Operações",
        nome: "Ricardo Nascimento",
        email: "lider.operacoes@empresa-beta.com",
        collaborators: [
          { nome: "Otavio Dias", email: "otavio.dias@empresa-beta.com" },
          { nome: "Paula Gomes", email: "paula.gomes@empresa-beta.com" },
          { nome: "Rafael Teixeira", email: "rafael.teixeira@empresa-beta.com" },
        ],
      },
    ],
  },
];

async function seedUsability() {
  console.log("🌱 Seed de usabilidade: 2 empresas, líderes e colaboradores...\n");

  const passwordHash = await bcrypt.hash(MOCK_PASSWORD, 12);
  const now = new Date().toISOString();

  for (const spec of TENANTS_SPEC) {
    const existing = db.prepare("SELECT id FROM tenants WHERE slug = ?").get(spec.slug) as { id: string } | undefined;
    if (existing) {
      console.log(`⏭️  Tenant "${spec.slug}" já existe. Pulando.`);
      continue;
    }

    const tenantId = uuidv4();
    db.exec("BEGIN TRANSACTION");
    try {
      db.prepare("INSERT INTO tenants (id, slug, name, active, created_at) VALUES (?, ?, ?, 1, ?)")
        .run(tenantId, spec.slug, spec.name, now);
      console.log(`✅ Empresa: ${spec.name} (${spec.slug})`);

      let lookupOrder = 0;
      for (const [category, values] of Object.entries(DEFAULT_LOOKUPS)) {
        for (const value of values) {
          db.prepare("INSERT OR IGNORE INTO lookups (id, tenant_id, category, value, order_index, created_at) VALUES (?, ?, ?, ?, ?, ?)")
            .run(uuidv4(), tenantId, category, value, lookupOrder++, now);
        }
      }
      console.log(`   Lookups padrão criados.`);

      for (const leader of spec.leaders) {
        const leaderId = uuidv4();
        db.prepare(`
          INSERT INTO users (id, tenant_id, email, nome, role, area, active, can_delete, password_hash, must_change_password, created_at)
          VALUES (?, ?, ?, ?, 'LEADER', ?, 1, 1, ?, 0, ?)
        `).run(leaderId, tenantId, leader.email, leader.nome, leader.area, passwordHash, now);
        console.log(`   LEADER ${leader.area}: ${leader.nome} (${leader.email})`);

        for (const col of leader.collaborators) {
          const colId = uuidv4();
          db.prepare(`
            INSERT INTO users (id, tenant_id, email, nome, role, area, active, can_delete, password_hash, must_change_password, created_at)
            VALUES (?, ?, ?, ?, 'USER', ?, 1, 1, ?, 0, ?)
          `).run(colId, tenantId, col.email, col.nome, leader.area, passwordHash, now);
        }
        console.log(`      → ${leader.collaborators.length} colaboradores em ${leader.area}.`);
      }

      const taskCount = insertMockTasksForTenant(tenantId, spec, now);
      console.log(`   ✅ ${taskCount} atividades mock criadas.`);

      db.exec("COMMIT");
      console.log("");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }

  for (const spec of TENANTS_SPEC) {
    const row = db.prepare("SELECT id FROM tenants WHERE slug = ?").get(spec.slug) as { id: string } | undefined;
    if (!row) continue;
    const count = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE tenant_id = ?").get(row.id) as { c: number };
    if (count.c > 0) continue;
    db.exec("BEGIN TRANSACTION");
    try {
      const taskCount = insertMockTasksForTenant(row.id, spec, now);
      db.exec("COMMIT");
      console.log(`✅ ${spec.slug}: ${taskCount} atividades mock adicionadas (tenant já existia).`);
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }

  console.log("🎉 Seed de usabilidade concluído!\n");
  console.log("📋 Acesso para testes:");
  console.log(`   Senha padrão para todos os usuários: ${MOCK_PASSWORD}\n`);
  console.log("   Empresa Alpha (URL: ?tenant=empresa-alpha):");
  console.log("     Líder TI:       lider.ti@empresa-alpha.com");
  console.log("     Líder Financeiro: lider.financeiro@empresa-alpha.com");
  console.log("     Colaboradores: ana.costa@..., bruno.lima@..., etc.\n");
  console.log("   Empresa Beta (URL: ?tenant=empresa-beta):");
  console.log("     Líder RH:       lider.rh@empresa-beta.com");
  console.log("     Líder Operações: lider.operacoes@empresa-beta.com");
  console.log("     Colaboradores: julia.ferreira@..., lucas.martins@..., etc.");
}

/**
 * Remove somente os dados criados pela seed de usabilidade (tenants empresa-alpha e empresa-beta).
 * Ordem: task_evidences → tasks → rules → lookups → login_events → users → tenants.
 */
function cleanUsabilitySeed(): void {
  console.log("🧹 Apagando somente dados da seed de usabilidade...\n");
  const ids = USABILITY_SLUGS.map((slug) => {
    const row = db.prepare("SELECT id FROM tenants WHERE slug = ?").get(slug) as { id: string } | undefined;
    return row?.id;
  }).filter(Boolean) as string[];

  if (ids.length === 0) {
    console.log("   Nenhum tenant da seed de usabilidade encontrado. Nada a apagar.");
    return;
  }

  db.exec("BEGIN TRANSACTION");
  try {
    for (const tenantId of ids) {
      const slugRow = db.prepare("SELECT slug FROM tenants WHERE id = ?").get(tenantId) as { slug: string } | undefined;
      const slug = slugRow?.slug ?? tenantId;
      db.prepare("DELETE FROM task_evidences WHERE task_id IN (SELECT id FROM tasks WHERE tenant_id = ?)").run(tenantId);
      db.prepare("DELETE FROM tasks WHERE tenant_id = ?").run(tenantId);
      db.prepare("DELETE FROM rules WHERE tenant_id = ?").run(tenantId);
      db.prepare("DELETE FROM lookups WHERE tenant_id = ?").run(tenantId);
      db.prepare("DELETE FROM login_events WHERE tenant_id = ?").run(tenantId);
      db.prepare("DELETE FROM users WHERE tenant_id = ?").run(tenantId);
      db.prepare("DELETE FROM tenants WHERE id = ?").run(tenantId);
      console.log(`   Removido: ${slug} (usuários, tarefas, lookups, etc.).`);
    }
    db.exec("COMMIT");
    console.log("\n✅ Dados da seed de usabilidade apagados. Demais dados do banco não foram alterados.");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

if (process.argv.includes("--clean") || process.env.CLEAN_USABILITY_SEED === "1") {
  cleanUsabilitySeed();
  process.exit(0);
}

seedUsability().catch(console.error).finally(() => process.exit());
