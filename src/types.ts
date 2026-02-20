export type Role = "USER" | "LEADER" | "ADMIN";

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  createdAt: string;
}

export interface UserRow {
  id: string;
  tenantId: string;
  email: string;
  nome: string;
  role: Role;
  area: string;
  active: boolean;
  canDelete: boolean;
  passwordHash: string;
  mustChangePassword: boolean;
  resetCodeHash?: string;
  resetCodeExpiresAt?: string;
  createdAt: string;
}

export interface TaskRow {
  id: string;
  tenantId: string;
  competenciaYm: string;
  recorrencia: string;
  tipo: string;
  atividade: string;
  responsavelEmail: string;
  responsavelNome: string;
  area: string;
  prazo: string;
  realizado: string;
  status: string;
  observacoes: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  deletedAt?: string;
  deletedBy?: string;
  evidences?: TaskEvidenceRow[];
}

export interface TaskEvidenceRow {
  id: string;
  tenantId: string;
  taskId: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
  uploadedBy: string;
}

export interface LookupRow {
  id: string;
  tenantId: string;
  category: string;
  value: string;
  orderIndex: number;
  createdAt: string;
}

export interface RuleRow {
  id: string;
  tenantId: string;
  area: string;
  allowedRecorrencias: string[];
  updatedAt: string;
  updatedBy: string;
}

export type Lookups = Record<string, string[]>;

export interface AuthUser {
  id: string;
  email: string;
  nome: string;
  role: Role;
  area: string;
  canDelete: boolean;
  tenantId: string;
}

// Express Request augmentation
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      tenantId?: string;
      tenant?: Tenant;
      /** Definido quando o admin mestre está visualizando como outro usuário (somente leitura). */
      impersonating?: boolean;
    }
  }
}
