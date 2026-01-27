import "dotenv/config";
import express from "express";
import helmet from "helmet";
import path from "path";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import crypto from "crypto";

import { login, verifyToken, type AuthedUser, adminGenerateResetCode, resetPasswordWithCode, AuthError } from "./auth";
import { sheets } from "./sheetsApi";
import { mustString, nowIso, safeLowerEmail } from "./utils";
import type { TaskRow } from "./types";
import { canEditTask, canDeleteTask } from "./access";

const app = express();

// Render/Proxy
app.set("trust proxy", 1);
app.disable("x-powered-by");

// Helmet (CSP compatível: não quebra seu HTML/CSS atual)
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'", "'unsafe-inline'"], // mantém compatibilidade
        "style-src": ["'self'", "'unsafe-inline'"],  // mantém compatibilidade
        "img-src": ["'self'", "data:"],
        "connect-src": ["'self'"],
        "frame-ancestors": ["'none'"],
        "base-uri": ["'self'"],
        "object-src": ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

const a =
  (fn: any) =>
  (req: any, res: any, next: any) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/* =========================
   Cookies: Sessão + CSRF
   ========================= */
const SESSION_COOKIE = "qco_session";
const CSRF_COOKIE = "qco_csrf";

function isProd() {
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

function setSessionCookie(res: express.Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    maxAge: 1000 * 60 * 60 * 12, // 12h
  });
}

function clearSessionCookie(res: express.Response) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

function genCsrf() {
  return crypto.randomBytes(24).toString("hex");
}

function setCsrfCookie(res: express.Response, token: string) {
  // não httpOnly para o front conseguir ler e mandar no header
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    maxAge: 1000 * 60 * 60 * 12, // casa com sessão
  });
}

function ensureCsrfCookie(req: any, res: any) {
  const has = String(req.cookies?.[CSRF_COOKIE] || "");
  if (!has) setCsrfCookie(res, genCsrf());
}

function getTokenFromReq(req: any) {
  const c = req.cookies?.[SESSION_COOKIE];
  if (c) return String(c);

  // fallback (compat)
  const auth = String(req.headers.authorization || "");
  if (auth.startsWith("Bearer ")) return auth.slice(7);

  return "";
}

function authMiddleware(req: any, res: any, next: any) {
  try {
    const token = getTokenFromReq(req);
    if (!token) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }
}

// CSRF: exige header em mutações
function csrfProtect(req: any, res: any, next: any) {
  const m = String(req.method || "GET").toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return next();

  // libera auth/login e auth/logout
  if (req.path === "/api/auth/login" || req.path === "/api/auth/logout") return next();

  const cookieToken = String(req.cookies?.[CSRF_COOKIE] || "");
  const headerToken = String(req.headers["x-csrf-token"] || "");

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ ok: false, error: "CSRF_BLOCKED" });
  }

  next();
}

/* =========================
   Rate limit (login)
   ========================= */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Muitas tentativas. Tente novamente em alguns minutos." },
});

/* ===== Cache de tasks (TTL curto) + índice por ID ===== */
let tasksCache: { at: number; data: TaskRow[] } | null = null;
let tasksIndex: Map<string, TaskRow> | null = null;

async function listTasksCached() {
  const ttlMs = 8000;
  if (tasksCache && Date.now() - tasksCache.at < ttlMs) return tasksCache.data;
  const data = (await sheets.listTasks()) as TaskRow[];
  tasksCache = { at: Date.now(), data };
  tasksIndex = null;
  return data;
}

async function getTaskByIdCached(id: string) {
  const all = await listTasksCached();
  if (!tasksIndex) tasksIndex = new Map(all.map((t) => [String(t.id), t]));
  return tasksIndex.get(String(id)) || null;
}

function bustTasksCache() {
  tasksCache = null;
  tasksIndex = null;
}

/* ===== Competência: normaliza para AAAA-MM ===== */
function normYm(input: any): string {
  const s = String(input || "").trim();
  if (!s) return "";

  let m = s.match(/^(\d{4})-(\d{1,2})-\d{1,2}/);
  if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}`;

  m = s.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}`;

  m = s.match(/^(\d{4})\/(\d{1,2})$/);
  if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}`;

  m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[2]}-${String(Number(m[1])).padStart(2, "0")}`;

  return s;
}

/* ===== Datas: salvar como YYYY-MM-DD ===== */
function toYmdOrEmpty(v: any): string {
  if (!v) return "";
  const s = String(v).trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }
  return s.slice(0, 10);
}

/* ===== Status (Concluído x Concluído em Atraso) ===== */
function toDateOrNull(v: any) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;

  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function isConcluidoStatus(s: any) {
  const x = String(s || "").toLowerCase();
  return x.includes("conclu");
}

function normalizeClear(patch: any) {
  if (patch.realizado === "CLEAR") patch.realizado = "";
}

function applyDoneLateRule(finalStatus: any, finalPrazo: any, finalRealizado: any) {
  if (!isConcluidoStatus(finalStatus)) return String(finalStatus || "");

  const p = toDateOrNull(finalPrazo);
  const r = toDateOrNull(finalRealizado);
  if (!p || !r) return "Concluído";

  return r > p ? "Concluído em Atraso" : "Concluído";
}

async function getUserByEmailSafe(email: string) {
  const e = safeLowerEmail(email);
  if (!e) return null;
  try {
    const u = await sheets.getUserByEmail(e);
    return u || null;
  } catch {
    return null;
  }
}

/* =========================
   Static + páginas
   ========================= */
app.use("/public", express.static(path.join(process.cwd(), "public")));

// rota vazia: se logado -> calendário
app.get(
  "/",
  a(async (req: any, res: any) => {
    ensureCsrfCookie(req, res);

    const token = getTokenFromReq(req);
    if (token) {
      try {
        verifyToken(token);
        return res.redirect("/calendar");
      } catch {
        clearSessionCookie(res);
      }
    }
    return res.sendFile(path.join(process.cwd(), "public/login.html"));
  })
);

app.get("/app", (req, res) => {
  ensureCsrfCookie(req, res);
  res.sendFile(path.join(process.cwd(), "public/app.html"));
});
app.get("/calendar", (req, res) => {
  ensureCsrfCookie(req, res);
  res.sendFile(path.join(process.cwd(), "public/calendar.html"));
});
app.get("/admin", (req, res) => {
  ensureCsrfCookie(req, res);
  res.sendFile(path.join(process.cwd(), "public/admin.html"));
});
app.get("/admin/users", (req, res) => {
  ensureCsrfCookie(req, res);
  res.sendFile(path.join(process.cwd(), "public/users.html"));
});
app.get("/admin/rules", (req, res) => {
  ensureCsrfCookie(req, res);
  res.sendFile(path.join(process.cwd(), "public/admin-rules.html"));
});
app.get(
  "/api/rules/by-area",
  authMiddleware,
  a(async (req: any, res: any) => {
    const me = req.user as AuthedUser;
    if (me.role !== "ADMIN" && me.role !== "LEADER") {
      return res.status(403).json({ ok: false, error: "FORBIDDEN" });
    }

    const area = String(req.query.area || "").trim();
    if (!area) return res.status(400).json({ ok: false, error: "area obrigatória" });

    // LEADER só pode ver a própria área
    if (me.role === "LEADER" && String(area) !== String(me.area || "")) {
      return res.status(403).json({ ok: false, error: "Leader não pode acessar regra fora da sua área." });
    }

    const rule = await sheets.getRuleByArea(area);

    res.json({
      ok: true,
      rule: {
        area,
        allowedRecorrencias: Array.isArray(rule?.allowedRecorrencias) ? rule.allowedRecorrencias : [],
        updatedAt: rule?.updatedAt || "",
        updatedBy: rule?.updatedBy || "",
      },
    });
  })
);


/* =========================
   CSRF endpoint (opcional)
   ========================= */
app.get(
  "/api/csrf",
  a(async (req: any, res: any) => {
    ensureCsrfCookie(req, res);
    res.json({ ok: true });
  })
);

/* =========================
   AUTH
   ========================= */
app.post(
  "/api/auth/login",
  loginLimiter,
  a(async (req: any, res: any) => {
    try {
      const email = mustString(req.body.email, "Email");
      const password = mustString(req.body.password, "Senha");

      const out = await login(email, password);

      setSessionCookie(res, out.token);
      setCsrfCookie(res, genCsrf());
      res.json({ ok: true, user: out.user });
    } catch (e: any) {
      if (e?.code === "RESET_REQUIRED") {
        return res.status(409).json({ ok: false, error: "RESET_REQUIRED", firstAccess: !!e?.meta?.firstAccess });
      }
      return res.status(401).json({ ok: false, error: e?.message || "UNAUTHORIZED" });
    }
  })
);

app.post(
  "/api/auth/reset",
  a(async (req: any, res: any) => {
    try {
      const email = mustString(req.body.email, "Email");
      const code = mustString(req.body.code, "Código");
      const newPassword = mustString(req.body.newPassword, "Nova senha");

      const out = await resetPasswordWithCode(email, code, newPassword);

      setSessionCookie(res, out.token);
      setCsrfCookie(res, genCsrf());
      res.json({ ok: true, user: out.user });
    } catch (e: any) {
      const msg = e?.message || "Erro";
      res.status(400).json({ ok: false, error: msg });
    }
  })
);

app.post(
  "/api/auth/logout",
  a(async (_req: any, res: any) => {
    clearSessionCookie(res);
    res.clearCookie(CSRF_COOKIE, { path: "/" });
    res.json({ ok: true });
  })
);

// protege mutações
app.use(csrfProtect);

app.get(
  "/api/me",
  authMiddleware,
  a(async (req: any, res: any) => {
    res.json({ ok: true, user: req.user as AuthedUser });
  })
);

/* USERS (VISUALIZAÇÃO) */
app.get(
  "/api/users",
  authMiddleware,
  a(async (req: any, res: any) => {
    const me = req.user as AuthedUser;
    const all = await sheets.listUsers();
    const active = all.filter((u: any) => String(u.active).toUpperCase() === "TRUE" || u.active === true);

    let visible = active;
    if (me.role === "LEADER") visible = active.filter((u: any) => String(u.area || "") === String(me.area || ""));
    if (me.role === "USER") visible = active.filter((u: any) => safeLowerEmail(u.email) === me.email);

    res.json({
      ok: true,
      users: visible.map((u: any) => ({
        email: safeLowerEmail(u.email),
        nome: String(u.nome || ""),
        role: String(u.role || "USER").toUpperCase(),
        area: String(u.area || ""),
      })),
    });
  })
);

/* ADMIN - USERS */
app.get(
  "/api/admin/users",
  authMiddleware,
  a(async (req: any, res: any) => {
    const me = req.user as AuthedUser;
    if (me.role !== "ADMIN") return res.status(403).json({ ok: false, error: "FORBIDDEN" });

    const all = await sheets.listUsers();
    res.json({
      ok: true,
      users: all.map((u: any) => ({
        email: safeLowerEmail(u.email),
        nome: String(u.nome || ""),
        role: String(u.role || "USER").toUpperCase(),
        area: String(u.area || ""),
        active: String(u.active).toUpperCase() === "TRUE" || u.active === true,
        canDelete: String(u.canDelete).toUpperCase() === "TRUE" || u.canDelete === true,
      })),
    });
  })
);

app.post(
  "/api/admin/users",
  authMiddleware,
  a(async (req: any, res: any) => {
    const me = req.user as AuthedUser;
    if (me.role !== "ADMIN") return res.status(403).json({ ok: false, error: "FORBIDDEN" });

    const email = mustString(req.body.email, "Email").toLowerCase();

    // senha agora é OPCIONAL (novo fluxo: primeiro acesso/reset via código)
    const rawPass = String(req.body.password || "").trim();
    const passwordHash = rawPass ? await bcrypt.hash(rawPass, 12) : "";

    const user = await sheets.userUpsert(
      {
        email,
        nome: req.body.nome || "",
        role: String(req.body.role || "USER").toUpperCase(),
        area: req.body.area || "",
        active: req.body.active ?? true,
        canDelete: req.body.canDelete ?? false,
        passwordHash, // pode ser "" (sem senha) -> exige reset/código para entrar
      },
      me.email
    );

    res.json({ ok: true, user });
  })
);

app.put(
  "/api/admin/users/:email",
  authMiddleware,
  a(async (req: any, res: any) => {
    const me = req.user as AuthedUser;
    if (me.role !== "ADMIN") return res.status(403).json({ ok: false, error: "FORBIDDEN" });

    const email = mustString(req.params.email, "Email").toLowerCase();

    const patch: any = {
      email,
      nome: req.body.nome,
      role: req.body.role,
      area: req.body.area,
      active: req.body.active,
      canDelete: req.body.canDelete,
    };

    // senha continua opcional na edição
    const rawPass = String(req.body.password || "").trim();
    if (rawPass) patch.passwordHash = await bcrypt.hash(rawPass, 12);

    const user = await sheets.userUpsert(patch, me.email);
    res.json({ ok: true, user });
  })
);

app.post(
  "/api/admin/users/:email/active",
  authMiddleware,
  a(async (req: any, res: any) => {
    const me = req.user as AuthedUser;
    if (me.role !== "ADMIN") return res.status(403).json({ ok: false, error: "FORBIDDEN" });

    const email = mustString(req.params.email, "Email").toLowerCase();
    const active = !!req.body.active;

    const user = await sheets.userSetActive(email, active, me.email);
    res.json({ ok: true, user });
  })
);

app.post(
  "/api/admin/users/:email/reset-code",
  authMiddleware,
  a(async (req: any, res: any) => {
    const me = req.user as AuthedUser;
    if (me.role !== "ADMIN") return res.status(403).json({ ok: false, error: "FORBIDDEN" });

    const email = mustString(req.params.email, "Email").toLowerCase();
    const out = await adminGenerateResetCode(me, email);

    // retorna o código só pro ADMIN (você copia e passa pro usuário)
    res.json({ ok: true, ...out });
  })
);

/* LOOKUPS */
app.get(
  "/api/lookups",
  authMiddleware,
  a(async (_req: any, res: any) => {
    const lookups = await sheets.listLookups();
    res.json({ ok: true, lookups });
  })
);

app.post(
  "/api/lookups",
  authMiddleware,
  a(async (req: any, res: any) => {
    const me = req.user as AuthedUser;
    if (me.role !== "ADMIN") return res.status(403).json({ ok: false, error: "FORBIDDEN" });

    const lookups = await sheets.upsertLookup({
      category: mustString(req.body.category, "Categoria").toUpperCase(),
      value: mustString(req.body.value, "Valor"),
      order: Number(req.body.order ?? 9999),
    });

    res.json({ ok: true, lookups });
  })
);

app.put(
  "/api/lookups/rename",
  authMiddleware,
  a(async (req: any, res: any) => {
    const me = req.user as AuthedUser;
    if (me.role !== "ADMIN") return res.status(403).json({ ok: false, error: "FORBIDDEN" });

    const lookups = await sheets.lookupRename(
      mustString(req.body.category, "Categoria").toUpperCase(),
      mustString(req.body.oldValue, "Valor antigo"),
      mustString(req.body.newValue, "Novo valor"),
      me.email
    );
    res.json({ ok: true, lookups });
  })
);

/*RULES*/
app.get(
  "/api/rules",
  authMiddleware,
  a(async (req: any, res: any) => {
    const me = req.user as AuthedUser;

    // regra sempre é por "área"
    const area = String(me.area || "").trim();
    const rule = await sheets.getRuleByArea(area);

    res.json({
      ok: true,
      area,
      allowedRecorrencias: Array.isArray(rule?.allowedRecorrencias) ? rule.allowedRecorrencias : [],
    });
  })
);

app.put(
  "/api/rules",
  authMiddleware,
  a(async (req: any, res: any) => {
    const me = req.user as AuthedUser;
    if (me.role !== "ADMIN" && me.role !== "LEADER") {
      return res.status(403).json({ ok: false, error: "FORBIDDEN" });
    }

    const targetArea = mustString(req.body.area || me.area, "area");
    if (me.role === "LEADER" && String(targetArea) !== String(me.area || "")) {
      return res.status(403).json({ ok: false, error: "Leader não pode alterar regra fora da sua área." });
    }

    const allowedRecorrencias = Array.isArray(req.body.allowedRecorrencias) ? req.body.allowedRecorrencias : [];
    const rule = await sheets.upsertRule({ area: targetArea, allowedRecorrencias }, me.email);

    res.json({ ok: true, rule });
  })
);

/* TASKS */
app.get(
  "/api/tasks",
  authMiddleware,
  a(async (req: any, res: any) => {
    const me = req.user as AuthedUser;
    const all = await listTasksCached();

    let visible = all.filter((t: any) => {
      if (me.role === "ADMIN") return true;
      if (me.role === "LEADER") return String(t.area || "") === String(me.area || "");
      return safeLowerEmail(t.responsavelEmail) === me.email;
    });

    // preenche responsavelNome se vazio
    try {
      const needs = visible.some((t: any) => !String(t.responsavelNome || "").trim());
      if (needs) {
        const uAll = await sheets.listUsers();
        const map = new Map<string, string>(uAll.map((u: any) => [safeLowerEmail(u.email), String(u.nome || "").trim()]));
        visible = visible.map((t: any) => {
          const email = safeLowerEmail(t.responsavelEmail);
          const nome = String(t.responsavelNome || "").trim() || map.get(email) || "";
          return { ...t, responsavelEmail: email, responsavelNome: nome || email };
        });
      }
    } catch {}

    res.json({ ok: true, tasks: visible });
  })
);

app.post(
  "/api/tasks",
  authMiddleware,
  a(async (req: any, res: any) => {
    const me = req.user as AuthedUser;
    const now = nowIso();

    let responsavelEmail = me.email;
    if ((me.role === "ADMIN" || me.role === "LEADER") && req.body.responsavelEmail) {
      responsavelEmail = safeLowerEmail(req.body.responsavelEmail);
    }

    const u = await getUserByEmailSafe(responsavelEmail);
    const area = u?.area ? String(u.area) : String(me.area || "");
    if (me.role === "LEADER" && area !== String(me.area || "")) {
      return res.status(403).json({ ok: false, error: "Leader não pode criar tarefa fora da sua área." });
    }

    // 1) recorrência deve existir no LOOKUP
    const lkp = await sheets.listLookups();
    const validRec = (lkp?.RECORRENCIA || []).map((x: any) => String(x).trim());
    const rec = String(req.body.recorrencia || "").trim();

    if (rec && !validRec.includes(rec)) {
      return res.status(400).json({ ok: false, error: "Recorrência inválida (não existe no LOOKUPS)." });
    }

    // 2) USER só pode criar com recorrência permitida pela regra da área
    if (me.role === "USER") {
      const rule = await sheets.getRuleByArea(String(me.area || ""));
      const allowed = (rule?.allowedRecorrencias || []).map((x: any) => String(x).trim()).filter(Boolean);

      // se não tem regra cadastrada, bloqueia criação (pra forçar config)
      if (!allowed.length) {
        return res.status(403).json({ ok: false, error: "Sua área ainda não tem recorrências liberadas. Fale com o Leader/Admin." });
      }

      if (!allowed.includes(rec)) {
        return res.status(403).json({ ok: false, error: "Recorrência não permitida para sua área." });
      }
    }

    const competenciaYm = normYm(req.body.competenciaYm || req.body.competencia);

    const prazo = toYmdOrEmpty(req.body.prazo);
    const realizado = toYmdOrEmpty(req.body.realizado);

    const rawStatus = req.body.status || "";
    const finalStatus = applyDoneLateRule(rawStatus, prazo, realizado);

    const task: any = {
      competenciaYm,
      competencia: competenciaYm,
      recorrencia: req.body.recorrencia || "",
      tipo: req.body.tipo || "",
      atividade: mustString(req.body.atividade, "Atividade"),
      responsavelEmail,
      responsavelNome: String(u?.nome || ""),
      area,
      prazo,
      realizado,
      status: finalStatus,
      observacoes: req.body.observacoes || "",
      createdAt: now,
      createdBy: me.email,
      updatedAt: now,
      updatedBy: me.email,
      deletedAt: "",
      deletedBy: "",
    };

    const created = await sheets.createTask(task);
    bustTasksCache();
    res.json({ ok: true, task: created });
  })
);

app.post(
  "/api/tasks/:id/duplicate",
  authMiddleware,
  a(async (req: any, res: any) => {
    const me = req.user as AuthedUser;
    if (me.role === "USER") return res.status(403).json({ ok: false, error: "FORBIDDEN" });

    const id = mustString(req.params.id, "id");
    const cur = await getTaskByIdCached(id);
    if (!cur) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    if (me.role === "LEADER" && String((cur as any).area || "") !== String(me.area || "")) {
      return res.status(403).json({ ok: false, error: "FORBIDDEN" });
    }

    const newEmail = safeLowerEmail((cur as any).responsavelEmail);
    const u = await getUserByEmailSafe(newEmail);
    const competenciaYm = normYm((cur as any).competenciaYm || (cur as any).competencia);

    const now = nowIso();
    const copy: any = {
      competenciaYm,
      competencia: competenciaYm,
      recorrencia: (cur as any).recorrencia || "",
      tipo: (cur as any).tipo || "",
      atividade: (cur as any).atividade || "",
      responsavelEmail: newEmail,
      responsavelNome: String(u?.nome || (cur as any).responsavelNome || ""),
      area: String(u?.area || (cur as any).area || me.area || ""),
      prazo: toYmdOrEmpty((cur as any).prazo),
      realizado: "",
      status: "Em Andamento",
      observacoes: (cur as any).observacoes || "",
      createdAt: now,
      createdBy: me.email,
      updatedAt: now,
      updatedBy: me.email,
      deletedAt: "",
      deletedBy: "",
    };

    const created = await sheets.createTask(copy);
    bustTasksCache();
    res.json({ ok: true, task: created });
  })
);

app.put(
  "/api/tasks/:id",
  authMiddleware,
  a(async (req: any, res: any) => {
    const me = req.user as AuthedUser;
    const id = mustString(req.params.id, "id");

    const current = await getTaskByIdCached(id);
    if (!current) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    if (me.role === "USER") {
      if (safeLowerEmail((current as any).responsavelEmail) !== me.email) {
        return res.status(403).json({ ok: false, error: "FORBIDDEN" });
      }

      const patch: any = { updatedAt: nowIso(), updatedBy: me.email };
      if (req.body.status !== undefined) patch.status = req.body.status;
      if (req.body.realizado !== undefined) patch.realizado = req.body.realizado;
      if (req.body.observacoes !== undefined) patch.observacoes = String(req.body.observacoes || "");

      normalizeClear(patch);
      if (patch.realizado !== undefined) patch.realizado = toYmdOrEmpty(patch.realizado);

      const finalPrazo = (current as any).prazo || "";
      const finalRealizado = patch.realizado !== undefined ? patch.realizado : (current as any).realizado || "";
      const finalStatusRaw = patch.status !== undefined ? patch.status : (current as any).status || "";
      patch.status = applyDoneLateRule(finalStatusRaw, finalPrazo, finalRealizado);

      const updated = await sheets.updateTask(id, patch);
      bustTasksCache();
      return res.json({ ok: true, task: updated });
    }

    const patch: any = { ...req.body, updatedAt: nowIso(), updatedBy: me.email };
    normalizeClear(patch);

    if (patch.prazo !== undefined) patch.prazo = toYmdOrEmpty(patch.prazo);
    if (patch.realizado !== undefined) patch.realizado = toYmdOrEmpty(patch.realizado);

    if (patch.competenciaYm || patch.competencia) {
      const ym = normYm(patch.competenciaYm || patch.competencia);
      patch.competenciaYm = ym;
      patch.competencia = ym;
    }

    if (patch.responsavelEmail) {
      const newEmail = safeLowerEmail(patch.responsavelEmail);
      const u = await getUserByEmailSafe(newEmail);
      patch.responsavelEmail = newEmail;
      patch.responsavelNome = String(u?.nome || "");
      patch.area = String(u?.area || (current as any).area || "");

      if (me.role === "LEADER" && String(patch.area || "") !== String(me.area || "")) {
        return res.status(403).json({ ok: false, error: "Leader não pode reatribuir para fora da área." });
      }
    }

    if (!canEditTask(me, current as any, patch)) {
      return res.status(403).json({ ok: false, error: "FORBIDDEN" });
    }

    const finalPrazo = patch.prazo !== undefined ? patch.prazo : (current as any).prazo || "";
    const finalRealizado = patch.realizado !== undefined ? patch.realizado : (current as any).realizado || "";
    const finalStatusRaw = patch.status !== undefined ? patch.status : (current as any).status || "";
    patch.status = applyDoneLateRule(finalStatusRaw, finalPrazo, finalRealizado);

    const updated = await sheets.updateTask(id, patch);
    bustTasksCache();
    res.json({ ok: true, task: updated });
  })
);

app.delete(
  "/api/tasks/:id",
  authMiddleware,
  a(async (req: any, res: any) => {
    const me = req.user as AuthedUser;
    const id = mustString(req.params.id, "id");

    const current = await getTaskByIdCached(id);
    if (!current) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    if (!canDeleteTask(me, current as any)) return res.status(403).json({ ok: false, error: "FORBIDDEN" });

    const deleted = await sheets.softDeleteTask(id, me.email);
    bustTasksCache();
    res.json({ ok: true, task: deleted });
  })
);

/* handler de erro */
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("SERVER_ERROR:", err);
  res.status(500).json({ ok: false, error: err?.message || "SERVER_ERROR" });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`OK http://localhost:${port}`));