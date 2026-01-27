import "dotenv/config";

const API_URL = process.env.SHEETS_API_URL!;
const API_KEY = process.env.SHEETS_API_KEY!;

async function callSheets<T>(action: string, payload: any = {}): Promise<T> {
  if (!API_URL || !API_KEY) throw new Error("SHEETS_API_URL / SHEETS_API_KEY não configurados.");

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000); // 15s

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: API_KEY, action, ...payload }),
      signal: controller.signal,
    });

    const text = await res.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch { data = { ok: false, error: `Resposta não-JSON do Apps Script: ${text.slice(0, 200)}` }; }

    if (!data?.ok) throw new Error(data?.error || "Erro ao chamar Sheets API");
    return data as T;
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error("Timeout chamando Apps Script (15s). Verifique deploy/URL.");
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export const sheets = {
  async getUserByEmail(email: string) {
    const data = await callSheets<{ ok: true; user: any }>("users.getByEmail", { email });
    return data.user;
  },

  async listUsers() {
    const data = await callSheets<{ ok: true; users: any[] }>("users.list");
    return data.users;
  },

  async listTasks() {
    const data = await callSheets<{ ok: true; tasks: any[] }>("tasks.list");
    return data.tasks;
  },

  async createTask(task: any) {
    const data = await callSheets<{ ok: true; task: any }>("tasks.create", { task });
    return data.task;
  },

  async updateTask(id: string, patch: any) {
    const data = await callSheets<{ ok: true; task: any }>("tasks.update", { id, patch });
    return data.task;
  },

  async softDeleteTask(id: string, deletedBy: string) {
    const data = await callSheets<{ ok: true; task: any }>("tasks.softDelete", { id, deletedBy });
    return data.task;
  },

  async listLookups() {
    const data = await callSheets<{ ok: true; lookups: any }>("lookups.list");
    return data.lookups;
  },

  async lookupRename(category: string, oldValue: string, newValue: string, actorEmail: string) {
    const data = await callSheets<{ ok: true; lookups: any }>("lookups.rename", { category, oldValue, newValue, actorEmail });
    return data.lookups;
  },

  async upsertLookup(item: any) {
    const data = await callSheets<{ ok: true; lookups: any }>("lookups.upsert", { item });
    return data.lookups;
  },

  async userUpsert(user: any, actorEmail: string) {
    const data = await callSheets<{ ok: true; user: any }>("users.upsert", { user, actorEmail });
    return data.user;
  },

  async userSetActive(email: string, active: boolean, actorEmail: string) {
    const data = await callSheets<{ ok: true; user: any }>("users.setActive", { email, active, actorEmail });
    return data.user;
  },

  async getRuleByArea(area: string) {
    const data = await callSheets<{ ok: true; rule: any }>("rules.getByArea", { area });
    return data.rule;
  },

  async upsertRule(rule: any, actorEmail: string) {
    const data = await callSheets<{ ok: true; rule: any }>("rules.upsert", { rule, actorEmail });
    return data.rule;
  }
};