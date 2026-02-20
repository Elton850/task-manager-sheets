import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { AuthUser } from "../types";

const JWT_SECRET = process.env.JWT_SECRET!;

export class AuthError extends Error {
  code: string;
  meta?: unknown;
  constructor(code: string, message: string, meta?: unknown) {
    super(message);
    this.code = code;
    this.meta = meta;
  }
}

export function signToken(user: AuthUser): string {
  if (!JWT_SECRET) throw new Error("JWT_SECRET não configurado.");
  return jwt.sign(user, JWT_SECRET, { expiresIn: "12h" });
}

export function verifyToken(token: string): AuthUser {
  return jwt.verify(token, JWT_SECRET) as AuthUser;
}

/** Define req.user se houver token válido; não exige autenticação. */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.["auth_token"];
  if (!token) {
    next();
    return;
  }
  try {
    const payload = verifyToken(token);
    if (req.tenantId && payload.tenantId !== req.tenantId) {
      next();
      return;
    }
    req.user = payload;
  } catch {
    // token inválido: seguir sem user
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.["auth_token"];
  if (!token) {
    res.status(401).json({ error: "Não autenticado.", code: "UNAUTHORIZED" });
    return;
  }

  try {
    const payload = verifyToken(token);

    // Ensure token belongs to this tenant
    if (req.tenantId && payload.tenantId !== req.tenantId) {
      res.status(403).json({ error: "Acesso negado a este tenant.", code: "TENANT_MISMATCH" });
      return;
    }

    req.user = payload;
    next();
  } catch {
    res.clearCookie("auth_token");
    res.status(401).json({ error: "Sessão expirada. Faça login novamente.", code: "TOKEN_EXPIRED" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Não autenticado.", code: "UNAUTHORIZED" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Permissão insuficiente.", code: "FORBIDDEN" });
      return;
    }
    next();
  };
}
