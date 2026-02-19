import type {
  AuthUser,
  Tenant,
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

export function getTenantSlugFromUrl(): string {
  const hostname = window.location.hostname;

  // Production: empresaX.taskmanager.com
  const parts = hostname.split(".");
  if (parts.length >= 3 && !hostname.includes("localhost")) {
    return parts[0].toLowerCase();
  }

  // Development: query param
  const params = new URLSearchParams(window.location.search);
  const tenantParam = params.get("tenant");
  if (tenantParam) {
    localStorage.setItem("tenantSlug", tenantParam);
    return tenantParam.toLowerCase();
  }

  // Fallback to localStorage
  return localStorage.getItem("tenantSlug") || "demo";
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

  if (res.status === 401) {
    if (window.location.pathname !== "/login") {
      window.location.replace("/login");
    }
    const error = new Error("Sessão expirada");
    (error as Error & { code?: string }).code = "UNAUTHORIZED";
    throw error;
  }

  const data = await res.json();

  if (!res.ok) {
    const error = new Error(data.error || "Erro desconhecido");
    (error as Error & { code?: string }).code = data.code;
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

  me: () => get<{ user: AuthUser; tenant: Tenant }>("/auth/me"),

  generateReset: (email: string) =>
    post<{ email: string; code: string; expiresAt: string }>("/auth/generate-reset", { email }),
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

  listEvidences: (id: string) => get<{ evidences: TaskEvidence[] }>(`/tasks/${id}/evidences`),

  uploadEvidence: (id: string, file: { fileName: string; mimeType: string; contentBase64: string }) =>
    post<{ evidence: TaskEvidence; task: Task }>(`/tasks/${id}/evidences`, file),

  deleteEvidence: (id: string, evidenceId: string) =>
    del<{ ok: boolean; task: Task }>(`/tasks/${id}/evidences/${evidenceId}`),
};

export const usersApi = {
  list: () => get<{ users: User[] }>("/users"),

  listAll: () => get<{ users: User[] }>("/users/all"),

  create: (data: Partial<User>) => post<{ user: User }>("/users", data),

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
};

export const rulesApi = {
  list: () => get<{ rules: Rule[] }>("/rules"),

  byArea: (area: string) => {
    const params = new URLSearchParams({ area });
    return get<{ rule: Rule | null }>(`/rules/by-area?${params}`);
  },

  save: (area: string, allowedRecorrencias: string[]) =>
    put<{ rule: Rule }>("/rules", { area, allowedRecorrencias }),
};

export const tenantApi = {
  current: () => get<{ tenant: Tenant }>("/tenants/current"),
};
