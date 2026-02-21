/** Segmentos de rota que NÃO são slug de empresa (Admin Mestre usa sem prefixo). */
const RESERVED_SEGMENTS = new Set([
  "login",
  "calendar",
  "tasks",
  "performance",
  "users",
  "admin",
  "empresa",
  "empresas",
  "justificativas",
  "sistema",
  "logs-acesso",
]);

/**
 * Extrai o tenant do pathname.
 * /empresax/login -> "empresax"
 * /login -> "system"
 * / -> "system"
 */
export function getTenantFromPath(pathname: string): string {
  const segment = pathname.split("/").filter(Boolean)[0];
  if (!segment) return "system";
  if (RESERVED_SEGMENTS.has(segment.toLowerCase())) return "system";
  return segment.toLowerCase();
}

/** basePath para links: "" para Admin Mestre (system), "/empresax" para empresa. */
export function getBasePath(pathname: string): string {
  const tenant = getTenantFromPath(pathname);
  return tenant === "system" ? "" : `/${tenant}`;
}
