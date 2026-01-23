import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sheets } from "./sheetsApi";
import { safeLowerEmail, toBool } from "./utils";
import type { Role, UserRow } from "./types";

const JWT_SECRET = process.env.JWT_SECRET!;

export type AuthedUser = {
  email: string;
  nome: string;
  role: Role;
  area: string;
  canDelete: boolean;
};

export class AuthError extends Error {
  code: string;
  meta?: any;
  constructor(code: string, message: string, meta?: any) {
    super(message);
    this.code = code;
    this.meta = meta;
  }
}

export function signToken(user: AuthedUser) {
  if (!JWT_SECRET) throw new Error("JWT_SECRET não configurado.");
  return jwt.sign(user, JWT_SECRET, { expiresIn: "12h" });
}

export function verifyToken(token: string): AuthedUser {
  return jwt.verify(token, JWT_SECRET) as AuthedUser;
}

function makeUser(row: UserRow, email: string): AuthedUser {
  return {
    email,
    nome: String(row.nome || ""),
    role: String(row.role || "USER").toUpperCase() as Role,
    area: String(row.area || ""),
    canDelete: toBool((row as any).canDelete),
  };
}

function isResetRequired(row: any) {
  const must = toBool(row.mustChangePassword);
  const noPass = !String(row.passwordHash || "").trim();
  const hasCode = !!String(row.resetCodeHash || "").trim();
  return must || noPass || hasCode;
}

export async function login(emailRaw: string, password: string): Promise<{ token: string; user: AuthedUser }> {
  const email = safeLowerEmail(emailRaw);
  const row = (await sheets.getUserByEmail(email)) as UserRow | null;

  if (!row) throw new AuthError("NO_USER", "Usuário não cadastrado.");
  if (!toBool((row as any).active)) throw new AuthError("INACTIVE", "Usuário inativo.");

  // Se precisa reset/primeiro acesso, não deixa logar com senha
  if (isResetRequired(row)) {
    throw new AuthError("RESET_REQUIRED", "Senha precisa ser definida/atualizada.", {
      firstAccess: !String(row.passwordHash || "").trim(),
    });
  }

  const ok = await bcrypt.compare(password, String(row.passwordHash));
  if (!ok) throw new AuthError("BAD_CREDENTIALS", "Credenciais inválidas.");

  const user = makeUser(row, email);
  return { token: signToken(user), user };
}

function genResetCode(): string {
  // 8 chars, evita confusos (0/O, 1/I)
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let out = "";
  const buf = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}

export async function adminGenerateResetCode(
  actor: AuthedUser,
  emailRaw: string
): Promise<{ email: string; code: string; expiresAt: string }> {
  if (actor.role !== "ADMIN") throw new AuthError("FORBIDDEN", "Apenas ADMIN.");

  const email = safeLowerEmail(emailRaw);
  const row = (await sheets.getUserByEmail(email)) as any;
  if (!row) throw new AuthError("NO_USER", "Usuário não cadastrado.");
  if (!toBool(row.active)) throw new AuthError("INACTIVE", "Usuário inativo.");

  const code = genResetCode();
  const resetCodeHash = await bcrypt.hash(code, 12);

  const expires = new Date(Date.now() + 30 * 60 * 1000); // 30 min
  const expiresAt = expires.toISOString();

  await sheets.userUpsert(
    {
      email,
      mustChangePassword: true,
      resetCodeHash,
      resetCodeExpiresAt: expiresAt,
    },
    actor.email
  );

  return { email, code, expiresAt };
}

export async function resetPasswordWithCode(
  emailRaw: string,
  codeRaw: string,
  newPassword: string
): Promise<{ token: string; user: AuthedUser }> {
  const email = safeLowerEmail(emailRaw);
  const code = String(codeRaw || "").trim();

  const row = (await sheets.getUserByEmail(email)) as any;
  if (!row) throw new AuthError("NO_USER", "Usuário não cadastrado.");
  if (!toBool(row.active)) throw new AuthError("INACTIVE", "Usuário inativo.");

  const hash = String(row.resetCodeHash || "").trim();
  const exp = String(row.resetCodeExpiresAt || "").trim();

  if (!hash || !exp) throw new AuthError("NO_RESET", "Não existe reset pendente para este usuário.");

  const expD = new Date(exp);
  if (isNaN(expD.getTime()) || Date.now() > expD.getTime()) {
    throw new AuthError("RESET_EXPIRED", "Código expirado. Solicite um novo.");
  }

  const ok = await bcrypt.compare(code, hash);
  if (!ok) throw new AuthError("RESET_BAD_CODE", "Código inválido.");

  if (String(newPassword || "").trim().length < 6) {
    throw new AuthError("WEAK_PASSWORD", "Senha muito curta (mínimo 6).");
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  // consome o código (1x)
  await sheets.userUpsert(
    {
      email,
      passwordHash,
      mustChangePassword: false,
      resetCodeHash: "",
      resetCodeExpiresAt: "",
    },
    email
  );

  const user = makeUser(row, email);
  return { token: signToken(user), user };
}