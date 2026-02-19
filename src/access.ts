import type { AuthUser } from "./types";
import type { TaskRow } from "./types";

export function canSeeTask(me: AuthUser, t: TaskRow) {
  if (me.role === "ADMIN") return true;
  if (me.role === "LEADER") return String(t.area || "") === String(me.area || "");
  return String(t.responsavelEmail || "").toLowerCase() === me.email.toLowerCase();
}

export function canEditTask(me: AuthUser, t: TaskRow, patch: Partial<TaskRow>) {
  if (!canSeeTask(me, t)) return false;

  if (me.role === "ADMIN") return true;

  if (me.role === "LEADER") {
    // Leader não pode mudar área pra fora
    if (patch.area && patch.area !== me.area) return false;
    return true;
  }

  // USER: não reatribui responsável/área
  if (patch.responsavelEmail && patch.responsavelEmail.toLowerCase() !== me.email.toLowerCase()) return false;
  if (patch.area && patch.area !== me.area) return false;

  return true;
}

export function canDeleteTask(me: AuthUser, t: TaskRow) {
  if (me.role === "ADMIN") return true;
  if (!me.canDelete) return false;

  if (me.role === "LEADER") return String(t.area || "") === String(me.area || "");
  return String(t.responsavelEmail || "").toLowerCase() === me.email.toLowerCase();
}