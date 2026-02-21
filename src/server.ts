import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import path from "path";

import { tenantMiddleware } from "./middleware/tenant";
import { verifyCsrf, csrfToken } from "./middleware/csrf";
import { apiAuthContext, blockWritesWhenImpersonating } from "./middleware/auth";

import authRoutes from "./routes/auth";
import taskRoutes from "./routes/tasks";
import justificationRoutes from "./routes/justifications";
import userRoutes from "./routes/users";
import lookupRoutes from "./routes/lookups";
import ruleRoutes from "./routes/rules";
import tenantRoutes from "./routes/tenants";
import systemRoutes from "./routes/system";

// Initialize DB schema on startup
import "./db";
import { seedSystemAdminIfNeeded } from "./db/seedSystemAdmin";

seedSystemAdminIfNeeded();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === "production";

// Validação de secrets em produção
if (IS_PROD) {
  const secret = process.env.JWT_SECRET;
  if (!secret || typeof secret !== "string" || secret.length < 32) {
    console.error("Em produção, JWT_SECRET deve ter pelo menos 32 caracteres.");
    process.exit(1);
  }
}

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: IS_PROD ? { maxAge: 31536000, includeSubDomains: true } : false,
}));

// ── Core Middleware ────────────────────────────────────────────────────────────
app.use(cookieParser());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: false }));

// ── CORS (whitelist; nunca * com credentials) ───────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map((o) => o.trim()).filter(Boolean);
const devOrigins = ["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:5174"];
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = IS_PROD ? ALLOWED_ORIGINS : devOrigins;
  if (origin && allowed.some((o) => origin === o)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,PATCH,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,X-CSRF-Token,X-Tenant-Slug,X-Requested-With");
  }
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

// ── Rate Limiting ─────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Muitas tentativas de login. Tente novamente em 15 minutos.", code: "RATE_LIMITED" },
  standardHeaders: true,
  legacyHeaders: false,
});
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Muitas tentativas de redefinição. Tente novamente em 15 minutos.", code: "RATE_LIMITED" },
  standardHeaders: true,
  legacyHeaders: false,
});
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120,
  message: { error: "Muitas requisições. Tente novamente em breve.", code: "RATE_LIMITED" },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Public endpoints ──────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({ status: "ok", version: "2.0.0" }));
app.get("/api/csrf", csrfToken);

// ── Tenant Resolution ─────────────────────────────────────────────────────────
app.use("/api", (req, res, next) => {
  if (req.path === "/csrf" || req.path === "/health") return next();
  tenantMiddleware(req, res, next);
});

// ── Auth context (req.user, req.impersonating) e bloqueio de writes ao impersonar ─
app.use("/api", apiAuthContext);
app.use("/api", blockWritesWhenImpersonating);

// ── CSRF verification for mutating requests ───────────────────────────────────
app.use("/api", verifyCsrf);

// ── API Routes ────────────────────────────────────────────────────────────────
app.use("/api/auth/login", loginLimiter);
app.use("/api/auth/reset", resetLimiter);
app.use("/api/auth/request-reset", resetLimiter);
app.use("/api", apiLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/justifications", justificationRoutes);
app.use("/api/users", userRoutes);
app.use("/api/lookups", lookupRoutes);
app.use("/api/rules", ruleRoutes);
app.use("/api/tenants", tenantRoutes);
app.use("/api/system", systemRoutes);

// ── Serve React frontend in production ───────────────────────────────────────
if (IS_PROD) {
  const frontendDist = path.resolve(__dirname, "../frontend/dist");
  app.use(express.static(frontendDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Rota não encontrada.", code: "NOT_FOUND" });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[ERROR]", err.message);
  res.status(500).json({ error: "Erro interno do servidor.", code: "INTERNAL" });
});

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`\n🚀 Task Manager v2.0 rodando em http://localhost:${PORT}`);
    console.log(`   Modo: ${IS_PROD ? "produção" : "desenvolvimento"}`);
    console.log(`   DB:   ${process.cwd()}/data/taskmanager.db`);
    if (!IS_PROD) {
      console.log(`   Frontend: http://localhost:5173`);
    }
  });
}

export default app;
