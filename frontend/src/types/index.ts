export type Role = "USER" | "LEADER" | "ADMIN";

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  /** Atualizado quando a logo é alterada; usar em ?v= para forçar o navegador a carregar a logo nova */
  logoUpdatedAt?: string | null;
}

export interface TenantListItem extends Tenant {
  active: number;
  created_at: string;
  /** Indica se a empresa tem logo cadastrada (admin mestre). */
  hasLogo?: boolean;
  /** Versão da logo para invalidar cache na listagem (admin mestre). */
  logoUpdatedAt?: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  nome: string;
  role: Role;
  area: string;
  canDelete: boolean;
  tenantId: string;
}

export interface User {
  id: string;
  tenantId: string;
  email: string;
  nome: string;
  role: Role;
  area: string;
  active: boolean;
  canDelete: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  /** Preenchido quando Admin Mestre lista usuários de várias empresas */
  tenantSlug?: string;
  tenantName?: string;
  /** Data/hora do último login (ISO). */
  lastLoginAt?: string | null;
  /** Data/hora do último logout (ISO). */
  lastLogoutAt?: string | null;
}

export interface Task {
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
  /** Email de quem alterou o prazo (auditoria). */
  prazoModifiedBy?: string;
  /** Nome para exibição: prazo modificado por. */
  prazoModifiedByName?: string;
  /** Email de quem concluiu / definiu a data de conclusão (auditoria). */
  realizadoPor?: string;
  /** Nome para exibição: concluído por. */
  realizadoPorNome?: string;
  /** ID da tarefa principal quando esta tarefa é uma subtarefa. */
  parentTaskId?: string;
  /** Descrição da tarefa principal (para exibir "Subtask de: X"). */
  parentTaskAtividade?: string;
  /** Número de subtarefas (apenas em tarefas principais). */
  subtaskCount?: number;
  /** Status da justificativa (apenas para tarefas Concluído em Atraso). */
  justificationStatus?: JustificationStatus;
  evidences?: TaskEvidence[];
}

export type JustificationStatus = "none" | "pending" | "approved" | "refused" | "blocked";

export interface TaskJustification {
  id: string;
  taskId: string;
  description: string;
  status: string;
  createdAt: string;
  createdBy: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  reviewComment?: string | null;
  task?: { id: string; atividade: string; responsavelNome: string; prazo: string | null; realizado: string | null };
  evidences?: { id: string; fileName: string; mimeType: string; fileSize: number; uploadedAt: string; downloadUrl: string }[];
}

export interface JustificationMineItem {
  task: Pick<Task, "id" | "atividade" | "responsavelNome" | "area" | "prazo" | "realizado" | "status" | "competenciaYm">;
  justificationStatus: JustificationStatus;
  justification: TaskJustification | null;
}

export interface TaskEvidence {
  id: string;
  taskId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
  uploadedBy: string;
  downloadUrl: string;
}

export interface LookupItem {
  id: string;
  category: string;
  value: string;
  orderIndex: number;
}

export type Lookups = Record<string, string[]>;

export interface Rule {
  id: string;
  tenantId: string;
  area: string;
  allowedRecorrencias: string[];
  updatedAt: string;
  updatedBy: string;
}

export interface TaskFilters {
  search: string;
  status: string;
  area: string;
  responsavel: string;
  competenciaYm: string;
}

export interface PerformanceFilters {
  from: string;
  to: string;
  status: string;
  responsavel: string;
  recorrencia: string;
  tipo: string;
}

export interface UserFilters {
  search: string;
  area: string;
  role: string;
  status: string;
  tenantSlug: string; // Admin Mestre: filtrar por empresa
  withoutPassword: string; // Admin Mestre: "1" = somente usuários sem senha definida
  from: string;
  to: string;
}

export interface ResponsavelStats {
  email: string;
  nome: string;
  total: number;
  concluido: number;
  emAndamento: number;
  emAtraso: number;
  concluidoEmAtraso: number;
}

export interface PerformanceSummary {
  total: number;
  emAndamento: number;
  concluido: number;
  emAtraso: number;
  concluidoEmAtraso: number;
  byResponsavel: ResponsavelStats[];
  lastUpdated: string;
}

export const STATUS_COLORS: Record<string, string> = {
  "Em Andamento": "blue",
  "Concluído": "green",
  "Em Atraso": "red",
  "Concluído em Atraso": "amber",
  "Aguardando subtarefas": "slate",
};

export const STATUS_LIST = ["Em Andamento", "Concluído", "Em Atraso", "Concluído em Atraso", "Aguardando subtarefas"];
