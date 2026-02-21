import type {
  AuthUser,
  Tenant,
  TenantListItem,
  Task,
  User,
  Lookups,
  LookupItem,
  Rule,
  TaskFilters,
  TaskEvidence,
} from "@/types";

let csrfToken = "";
let tenantSlug = "";

export function setTenantSlug(slug: string) {
  tenantSlug = slug;
}

/** Limpa o token CSRF em memória (ex.: após logout). O próximo POST/PUT vai obter um novo via GET /api/csrf. */
export function clearCsrfToken(): void {
  csrfToken = "";
}

const RESERVED_SEGMENTS = new Set(["login", "calendar", "tasks", "performance", "users", "admin", "empresa", "empresas"]);

/**
 * Tenant no path tem prioridade: /empresax/login -> empresax.
 * Path de sistema (/, /login, /empresas, etc.) -> sempre "system"; não usa localStorage.
 * Senão: subdomínio, query ?tenant=, ou localStorage (para dev).
 */
export function getTenantSlugFromUrl(): string {
  if (typeof window !== "undefined" && window.location.pathname) {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const seg = (parts[0] || "").toLowerCase();
    // Path com tenant: /acme ou /acme/login -> primeiro segmento é o slug da empresa
    if (seg && !RESERVED_SEGMENTS.has(seg)) return seg;
    // Path de sistema: /, /login, /calendar, /empresas, etc. -> sempre "system"
    return "system";
  }

  const hostname = window.location.hostname;
  if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1") {
    const parts = hostname.split(".");
    if (parts.length >= 3) return parts[0].toLowerCase();
  }

  const params = new URLSearchParams(window.location.search);
  const tenantParam = params.get("tenant");
  if (tenantParam) {
    localStorage.setItem("tenantSlug", tenantParam);
    return tenantParam.toLowerCase();
  }

  return localStorage.getItem("tenantSlug") || "system";
}

async function fetchCsrf(): Promise<void> {
  const res = await fetch("/api/csrf");
  const data = await res.json();
  csrfToken = data.csrfToken;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!csrfToken && method !== "GET") {
    await fetchCsrf();
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Tenant-Slug": tenantSlug || getTenantSlugFromUrl(),
  };

  if (csrfToken && method !== "GET") {
    headers["X-CSRF-Token"] = csrfToken;
  }

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({} as Record<string, unknown>));

  if (!res.ok) {
    const payload = data as { error?: string; code?: string; meta?: unknown };
    if (res.status === 401) {
      const isLoginEndpoint = path === "/auth/login";
      if (isLoginEndpoint) {
        // Objeto com code garantido para a tela de login exibir a mensagem correta
        const loginError = new Error(payload.error || "Não autorizado") as Error & { code?: string; meta?: unknown };
        loginError.code = payload.code ?? "UNAUTHORIZED";
        loginError.meta = payload.meta;
        throw loginError;
      }
      // Redirecionar para a página de login do tenant atual (ex.: /empresax/login), não sempre /login
      const currentTenant = getTenantSlugFromUrl();
      const loginPath = currentTenant === "system" ? "/login" : `/${currentTenant}/login`;
      if (window.location.pathname !== loginPath) {
        window.location.replace(loginPath);
      }
      const error = new Error("Sessão expirada") as Error & { code?: string };
      error.code = "UNAUTHORIZED";
      throw error;
    }
    const error = new Error(payload.error || "Erro desconhecido") as Error & { code?: string };
    error.code = payload.code;
    throw error;
  }

  return data as T;
}

const get = <T>(path: string) => request<T>("GET", path);
const post = <T>(path: string, body?: unknown) => request<T>("POST", path, body);
const put = <T>(path: string, body?: unknown) => request<T>("PUT", path, body);
const patch = <T>(path: string, body?: unknown) => request<T>("PATCH", path, body);
const del = <T>(path: string) => request<T>("DELETE", path);

export const authApi = {
  init: fetchCsrf,

  login: (email: string, password: string) => post<{ user: AuthUser }>("/auth/login", { email, password }),

  reset: (email: string, code: string, newPassword: string) =>
    post<{ user: AuthUser }>("/auth/reset", { email, code, newPassword }),

  logout: () => post<{ ok: boolean }>("/auth/logout"),

  me: () =>
    get<{
      user: AuthUser;
      tenant: Tenant;
      isImpersonating?: boolean;
      lastLoginAt?: string | null;
      lastLogoutAt?: string | null;
    }>("/auth/me"),

  /** Admin mestre: visualizar como outro usuário (somente leitura). Retorna user/tenant do usuário escolhido. */
  impersonate: (userId: string) =>
    post<{ user: AuthUser; tenant: Tenant }>("/auth/impersonate", { userId }),

  /** Sair do modo "visualizar como" e voltar à conta do administrador mestre. */
  impersonateStop: () => post<{ user: AuthUser; tenant: Tenant }>("/auth/impersonate/stop"),

  /** Admin: envia código de reset por e-mail ao usuário (nunca retorna o código). */
  generateReset: (email: string, tenantSlug?: string) =>
    post<{
      email: string;
      expiresAt: string;
      sentByEmail: boolean;
      emailError?: string;
    }>("/auth/generate-reset", { email, tenantSlug }),

  /** Usuário na tela de login: solicita envio do código por e-mail (sem auth). */
  requestReset: (email: string) =>
    post<{ message: string }>("/auth/request-reset", { email }),

  /** Admin mestre: envia código de reset por e-mail para vários usuários (máx. 50). */
  generateResetBulk: (userIds: string[]) =>
    post<{ sent: number; failed: number; results: { userId: string; email: string; sent: boolean; error?: string }[] }>(
      "/auth/generate-reset-bulk",
      { userIds }
    ),
};

export const tasksApi = {
  list: (filters?: Partial<TaskFilters>) => {
    const params = new URLSearchParams();
    if (filters?.search) params.set("search", filters.search);
    if (filters?.status) params.set("status", filters.status);
    if (filters?.area) params.set("area", filters.area);
    if (filters?.responsavel) params.set("responsavel", filters.responsavel);
    if (filters?.competenciaYm) params.set("competenciaYm", filters.competenciaYm);
    const qs = params.toString();
    return get<{ tasks: Task[] }>(`/tasks${qs ? `?${qs}` : ""}`);
  },

  create: (data: Partial<Task>) => post<{ task: Task }>("/tasks", data),

  update: (id: string, data: Partial<Task>) => put<{ task: Task }>(`/tasks/${id}`, data),

  delete: (id: string) => del<{ ok: boolean }>(`/tasks/${id}`),

  duplicate: (id: string) => post<{ task: Task }>(`/tasks/${id}/duplicate`),

  listSubtasks: (id: string) => get<{ tasks: Task[] }>(`/tasks/${id}/subtasks`),
  listEvidences: (id: string) => get<{ evidences: TaskEvidence[] }>(`/tasks/${id}/evidences`),

  uploadEvidence: (id: string, file: { fileName: string; mimeType: string; contentBase64: string }) =>
    post<{ evidence: TaskEvidence; task: Task }>(`/tasks/${id}/evidences`, file),

  deleteEvidence: (id: string, evidenceId: string) =>
    del<{ ok: boolean; task: Task }>(`/tasks/${id}/evidences/${evidenceId}`),
};

export const usersApi = {
  list: () => get<{ users: User[] }>("/users"),

  listAll: (tenantSlug?: string, withoutPassword?: boolean) => {
    const params = new URLSearchParams();
    if (tenantSlug) params.set("tenant", tenantSlug);
    if (withoutPassword) params.set("withoutPassword", "1");
    const qs = params.toString();
    return get<{ users: User[] }>(`/users/all${qs ? `?${qs}` : ""}`);
  },
  create: (data: Partial<User> & { tenantSlug?: string }) =>
    post<{ user: User }>("/users", data),

  getLoginCounts: (from: string, to: string, tenantSlug?: string) => {
    const params = new URLSearchParams({ from, to });
    if (tenantSlug) params.set("tenant", tenantSlug);
    return get<{ counts: Record<string, number> }>(`/users/login-counts?${params}`);
  },

  bulkToggleActive: (ids: string[], active: boolean) =>
    patch<{ updated: number }>("/users/bulk-toggle-active", { ids, active }),

  update: (id: string, data: Partial<User>) => put<{ user: User }>(`/users/${id}`, data),

  toggleActive: (id: string) => patch<{ user: User }>(`/users/${id}/toggle-active`),
};

export const lookupsApi = {
  list: () => get<{ lookups: Lookups }>("/lookups"),

  listAll: () => get<{ lookups: LookupItem[] }>("/lookups/all"),

  add: (category: string, value: string) =>
    post<{ id: string; category: string; value: string }>("/lookups", { category, value }),

  rename: (id: string, value: string) => put<{ ok: boolean }>(`/lookups/${id}`, { value }),

  remove: (id: string) => del<{ ok: boolean }>(`/lookups/${id}`),

  /** Admin Mestre: listas agrupadas de uma empresa */
  listByTenant: (tenantSlug: string) =>
    get<{ lookups: Lookups }>(`/lookups/by-tenant/${encodeURIComponent(tenantSlug)}`),

  /** Admin Mestre: listas com metadata de uma empresa */
  listAllByTenant: (tenantSlug: string) =>
    get<{ lookups: LookupItem[] }>(`/lookups/by-tenant/${encodeURIComponent(tenantSlug)}/all`),

  /** Admin Mestre: adicionar valor na empresa */
  addForTenant: (tenantSlug: string, category: string, value: string) =>
    post<{ id: string; category: string; value: string }>("/lookups/for-tenant", { tenantSlug, category, value }),

  /** Admin Mestre: renomear valor na empresa */
  renameForTenant: (tenantSlug: string, id: string, value: string) =>
    put<{ ok: boolean }>(`/lookups/for-tenant/${id}`, { tenantSlug, value }),

  /** Admin Mestre: remover valor na empresa */
  removeForTenant: (tenantSlug: string, id: string) =>
    del<{ ok: boolean }>(`/lookups/for-tenant/${id}?tenantSlug=${encodeURIComponent(tenantSlug)}`),

  /** Admin Mestre: copiar listas de uma empresa para outra (substitui destino) */
  copy: (sourceTenantSlug: string, targetTenantSlug: string) =>
    post<{ ok: boolean; copied: number }>("/lookups/copy", { sourceTenantSlug, targetTenantSlug }),
};

export const rulesApi = {
  list: () => get<{ rules: Rule[] }>("/rules"),

  byArea: (area: string) => {
    const params = new URLSearchParams({ area });
    return get<{ rule: Rule | null }>(`/rules/by-area?${params}`);
  },

  save: (area: string, allowedRecorrencias: string[]) =>
    put<{ rule: Rule }>("/rules", { area, allowedRecorrencias }),

  /** Admin Mestre: regras de uma empresa */
  listByTenant: (tenantSlug: string) =>
    get<{ rules: Rule[] }>(`/rules/by-tenant/${encodeURIComponent(tenantSlug)}`),

  /** Admin Mestre: salvar regra de uma área para uma empresa */
  saveForTenant: (tenantSlug: string, area: string, allowedRecorrencias: string[]) =>
    put<{ rule: Rule }>("/rules/for-tenant", { tenantSlug, area, allowedRecorrencias }),
};

export const tenantApi = {
  current: () => get<{ tenant: Tenant }>("/tenants/current"),
  updateCurrent: (name: string) =>
    patch<{ tenant: Tenant }>("/tenants/current", { name }),
  /** Lista todas as empresas (apenas administrador do sistema). */
  list: () => get<{ tenants: TenantListItem[] }>("/tenants"),
  /** Cria nova empresa (Admin Mestre cadastra usuários depois na aba Usuários). */
  create: (data: { slug: string; name: string }) =>
    post<{ tenant: Tenant; accessUrl: string }>("/tenants", data),
  toggleActive: (id: string) =>
    patch<{ ok: boolean }>(`/tenants/${id}/toggle-active`),
  /** Upload logo da empresa (Admin Mestre). body: { fileName, mimeType, contentBase64 } */
  uploadLogo: (tenantId: string, body: { fileName: string; mimeType: string; contentBase64: string }) =>
    post<{ ok: boolean }>(`/tenants/${tenantId}/logo`, body),
  /** Remove logo da empresa (Admin Mestre). */
  removeLogo: (tenantId: string) => del<{ ok: boolean }>(`/tenants/${tenantId}/logo`),
};
