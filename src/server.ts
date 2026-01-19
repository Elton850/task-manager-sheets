import "dotenv/config";
import express from "express";
import helmet from "helmet";
import path from "path";
import bcrypt from "bcryptjs";

import { login, verifyToken, type AuthedUser } from "./auth";
import { sheets } from "./sheetsApi";
import { mustString, nowIso, safeLowerEmail } from "./utils";
import type { TaskRow } from "./types";
import { canEditTask, canDeleteTask } from "./access";

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));

/* =========================
   Helpers
========================= */
const a =
  (fn: any) =>
  (req: any, res: any, next: any) =>
    Promise.resolve(fn(req, res, next)).catch(next);

function authMiddleware(req: any, res: any, next: any) {
  try {
    const auth = String(req.headers.authorization || "");
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }
}

/* =========================
   Static + Pages
========================= */
app.use("/public", express.static(path.join(process.cwd(), "public")));

app.get("/", (_, res) =>
  res.sendFile(path.join(process.cwd(), "public/login.html"))
);
app.get("/app", (_, res) =>
  res.sendFile(path.join(process.cwd(), "public/app.html"))
);
app.get("/admin", (_, res) =>
  res.sendFile(path.join(process.cwd(), "public/admin.html"))
);
app.get("/admin/users", (_, res) =>
  res.sendFile(path.join(process.cwd(), "public/users.html"))
);

/* =========================
   AUTH
========================= */
app.post(
  "/api/auth/login",
  a(async (req: any, res: any) => {
    const email = mustString(req.body.email, "Email");
    const password = mustString(req.body.password, "Senha");
    const out = await login(email, password);
    res.json({ ok: true, ...out });
  })
);

app.get(
  "/api/me",
  authMiddleware,
  a(async (req: any, res: any) => {
    res.json({ ok: true, user: req.user as AuthedUser });
  })
);

/* =========================
   USERS (VISUALIZAÇÃO)
========================= */
app.get(
  "/api/users",
  authMiddleware,
  a(async (req: any, res: any) => {
    const me = req.user as AuthedUser;
    const all = await sheets.listUsers();

    const active = all.filter(
      (u) => String(u.active).toUpperCase() === "TRUE" || u.active === true
    );

    let visible = active;

    if (me.role === "LEADER") {
      visible = active.filter((u) => String(u.area || "") === me.area);
    }

    if (me.role === "USER") {
      visible = active.filter(
        (u) => safeLowerEmail(u.email) === me.email
      );
    }

    res.json({
      ok: true,
      users: visible.map((u) => ({
        email: safeLowerEmail(u.email),
        nome: String(u.nome || ""),
        role: String(u.role || "USER").toUpperCase(),
        area: String(u.area || ""),
      })),
    });
  })
);

/* =========================
   ADMIN - USERS
========================= */
app.get(
  "/api/admin/users",
  authMiddleware,
  a(async (req: any, res: any) => {
    const me = req.user as AuthedUser;
    if (me.role !== "ADMIN")
      return res.status(403).json({ ok: false, error: "FORBIDDEN" });

    const all = await sheets.listUsers();
    res.json({
      ok: true,
      users: all.map((u) => ({
        email: safeLowerEmail(u.email),
        nome: String(u.nome || ""),
        role: String(u.role || "USER").toUpperCase(),
        area: String(u.area || ""),
        active: String(u.active).toUpperCase() === "TRUE" || u.active === true,
        canDelete:
          String(u.canDelete).toUpperCase() === "TRUE" || u.canDelete === true,
      })),
    });
  })
);

app.post(
  "/api/admin/users",
  authMiddleware,
  a(async (req: any, res: any) => {
    const me = req.user as AuthedUser;
    if (me.role !== "ADMIN")
      return res.status(403).json({ ok: false, error: "FORBIDDEN" });

    const email = mustString(req.body.email, "Email").toLowerCase();
    const password = mustString(req.body.password, "Senha");

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await sheets.userUpsert(
      {
        email,
        nome: req.body.nome || "",
        role: String(req.body.role || "USER").toUpperCase(),
        area: req.body.area || "",
        active: req.body.active ?? true,
        canDelete: req.body.canDelete ?? false,
        passwordHash,
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
    if (me.role !== "ADMIN")
      return res.status(403).json({ ok: false, error: "FORBIDDEN" });

    const email = mustString(req.params.email, "Email").toLowerCase();

    const patch: any = {
      email,
      nome: req.body.nome,
      role: req.body.role,
      area: req.body.area,
      active: req.body.active,
      canDelete: req.body.canDelete,
    };

    if (req.body.password) {
      patch.passwordHash = await bcrypt.hash(
        String(req.body.password),
        12
      );
    }

    const user = await sheets.userUpsert(patch, me.email);
    res.json({ ok: true, user });
  })
);

app.post(
  "/api/admin/users/:email/active",
  authMiddleware,
  a(async (req: any, res: any) => {
    const me = req.user as AuthedUser;
    if (me.role !== "ADMIN")
      return res.status(403).json({ ok: false, error: "FORBIDDEN" });

    const email = mustString(req.params.email, "Email").toLowerCase();
    const active = !!req.body.active;

    const user = await sheets.userSetActive(email, active, me.email);
    res.json({ ok: true, user });
  })
);

/* =========================
   LOOKUPS
========================= */
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
    if (me.role !== "ADMIN")
      return res.status(403).json({ ok: false, error: "FORBIDDEN" });

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
    if (me.role !== "ADMIN")
      return res.status(403).json({ ok: false, error: "FORBIDDEN" });

    const lookups = await sheets.lookupRename(
      mustString(req.body.category, "Categoria").toUpperCase(),
      mustString(req.body.oldValue, "Valor antigo"),
      mustString(req.body.newValue, "Novo valor"),
      me.email
    );

    res.json({ ok: true, lookups });
  })
);

/* =========================
   TASKS
========================= */
app.get(
  "/api/tasks",
  authMiddleware,
  a(async (req: any, res: any) => {
    const me = req.user as AuthedUser;
    const all = (await sheets.listTasks()) as TaskRow[];

    const visible = all.filter((t) => {
      if (me.role === "ADMIN") return true;
      if (me.role === "LEADER") return t.area === me.area;
      return safeLowerEmail(t.responsavelEmail) === me.email;
    });

    res.json({ ok: true, tasks: visible });
  })
);

app.post(
  "/api/tasks",
  authMiddleware,
  a(async (req: any, res: any) => {
    const me = req.user as AuthedUser;

    const now = nowIso();
    const task = {
      competencia: req.body.competencia || "",
      recorrencia: req.body.recorrencia,
      tipo: req.body.tipo,
      atividade: mustString(req.body.atividade, "Atividade"),
      responsavelEmail: me.email,
      responsavelNome: me.nome,
      area: me.area,
      prazo: req.body.prazo || "",
      realizado: req.body.realizado || "",
      status: req.body.status,
      observacoes: req.body.observacoes || "",
      createdAt: now,
      createdBy: me.email,
      updatedAt: now,
      updatedBy: me.email,
      deletedAt: "",
      deletedBy: "",
    };

    const created = await sheets.createTask(task);
    res.json({ ok: true, task: created });
  })
);

app.put(
  "/api/tasks/:id",
  authMiddleware,
  a(async (req: any, res: any) => {
    const me = req.user as AuthedUser;
    const id = mustString(req.params.id, "id");

    const all = (await sheets.listTasks()) as TaskRow[];
    const current = all.find((t) => t.id === id);
    if (!current)
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    const patch: any = { ...req.body, updatedAt: nowIso(), updatedBy: me.email };

    if (me.role === "USER" && patch.prazo !== undefined) {
      return res
        .status(403)
        .json({ ok: false, error: "Usuário não pode editar prazo." });
    }

    if (!canEditTask(me, current, patch))
      return res.status(403).json({ ok: false, error: "FORBIDDEN" });

    const updated = await sheets.updateTask(id, patch);
    res.json({ ok: true, task: updated });
  })
);

app.delete(
  "/api/tasks/:id",
  authMiddleware,
  a(async (req: any, res: any) => {
    const me = req.user as AuthedUser;
    const id = mustString(req.params.id, "id");

    const all = (await sheets.listTasks()) as TaskRow[];
    const current = all.find((t) => t.id === id);
    if (!current)
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    if (!canDeleteTask(me, current))
      return res.status(403).json({ ok: false, error: "FORBIDDEN" });

    const deleted = await sheets.softDeleteTask(id, me.email);
    res.json({ ok: true, task: deleted });
  })
);

/* =========================
   ERROR HANDLER
========================= */
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("SERVER_ERROR:", err);
  res.status(500).json({ ok: false, error: err?.message || "SERVER_ERROR" });
});

/* =========================
   START
========================= */
const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`OK http://localhost:${port}`));