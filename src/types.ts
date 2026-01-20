export type Role = "USER" | "LEADER" | "ADMIN";

export type UserRow = {
  email: string;
  nome: string;
  role: Role;
  area: string;
  active: string | boolean;
  canDelete: string | boolean;
  passwordHash: string;
};

export type TaskRow = {
  id: string;
  competencia: string;
  competenciaYm: string;
  recorrencia: string;
  tipo: string;
  atividade: string;
  responsavelEmail: string;
  responsavelNome: string;
  area: string;
  prazo: string;      // ISO
  realizado: string;  // ISO ou vazio
  status: string;
  observacoes: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  deletedAt: string;
  deletedBy: string;
};

export type Lookups = Record<string, string[]>;