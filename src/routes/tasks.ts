import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import db from "../db";
import { requireAuth } from "../middleware/auth";
import { mustString, optStr, nowIso, calcStatus } from "../utils";

const router = Router();
router.use(requireAuth);

interface TaskDbRow {
  id: string;
  tenant_id: string;
  competencia_ym: string;
  recorrencia: string;
  tipo: string;
  atividade: string;
  responsavel_email: string;
  responsavel_nome: string;
  area: string;
  prazo: string | null;
  realizado: string | null;
  status: string;
  observacoes: string | null;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

interface EvidenceDbRow {
  id: string;
  tenant_id: string;
  task_id: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  file_size: number;
  uploaded_at: string;
  uploaded_by: string;
}

function toEvidence(row: EvidenceDbRow, taskId: string) {
  return {
    id: row.id,
    taskId,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    uploadedAt: row.uploaded_at,
    uploadedBy: row.uploaded_by,
    downloadUrl: `/api/tasks/${taskId}/evidences/${row.id}/download`,
  };
}

function rowToTask(row: TaskDbRow, evidences: EvidenceDbRow[] = []) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    competenciaYm: row.competencia_ym,
    recorrencia: row.recorrencia,
    tipo: row.tipo,
    atividade: row.atividade,
    responsavelEmail: row.responsavel_email,
    responsavelNome: row.responsavel_nome,
    area: row.area,
    prazo: row.prazo || "",
    realizado: row.realizado || "",
    status: row.status,
    observacoes: row.observacoes || "",
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    evidences: evidences.map(e => toEvidence(e, row.id)),
  };
}

function canReadTask(user: Request["user"], task: TaskDbRow): boolean {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  if (user.role === "LEADER") return task.area === user.area;
  return task.responsavel_email === user.email;
}

function canManageTask(user: Request["user"], task: TaskDbRow): boolean {
  return canReadTask(user, task);
}

function buildWhereClause(user: Request["user"]): { where: string; params: Array<string | number | null> } {
  const baseWhere = "tenant_id = ? AND deleted_at IS NULL";
  const params: Array<string | number | null> = [user!.tenantId];

  if (user!.role === "ADMIN") {
    return { where: baseWhere, params };
  }
  if (user!.role === "LEADER") {
    return { where: `${baseWhere} AND area = ?`, params: [...params, user!.area] };
  }
  // USER: only own tasks
  return { where: `${baseWhere} AND responsavel_email = ?`, params: [...params, user!.email] };
}

// GET /api/tasks
router.get("/", (req: Request, res: Response): void => {
  try {
    const { where, params } = buildWhereClause(req.user);

    // Optional filters from query
    const { area, responsavel, status, competenciaYm, search } = req.query;
    let dynamicWhere = where;
    const dynamicParams = [...params];

    if (area && typeof area === "string") {
      dynamicWhere += " AND area = ?";
      dynamicParams.push(area);
    }
    if (responsavel && typeof responsavel === "string") {
      dynamicWhere += " AND responsavel_email = ?";
      dynamicParams.push(responsavel);
    }
    if (status && typeof status === "string") {
      dynamicWhere += " AND status = ?";
      dynamicParams.push(status);
    }
    if (competenciaYm && typeof competenciaYm === "string") {
      dynamicWhere += " AND competencia_ym = ?";
      dynamicParams.push(competenciaYm);
    }
    if (search && typeof search === "string") {
      dynamicWhere += " AND (atividade LIKE ? OR observacoes LIKE ?)";
      dynamicParams.push(`%${search}%`, `%${search}%`);
    }

    const rows = db.prepare(`
      SELECT * FROM tasks WHERE ${dynamicWhere}
      ORDER BY competencia_ym DESC, prazo ASC, created_at DESC
    `).all(...dynamicParams) as TaskDbRow[];
    const taskIds = rows.map(r => r.id);
    const evidencesByTask = new Map<string, EvidenceDbRow[]>();

    if (taskIds.length > 0) {
      const placeholders = taskIds.map(() => "?").join(",");
      const evidenceRows = db.prepare(`
        SELECT * FROM task_evidences
        WHERE task_id IN (${placeholders})
        ORDER BY uploaded_at DESC
      `).all(...taskIds) as EvidenceDbRow[];

      for (const evidence of evidenceRows) {
        const list = evidencesByTask.get(evidence.task_id) || [];
        list.push(evidence);
        evidencesByTask.set(evidence.task_id, list);
      }
    }

    res.json({ tasks: rows.map(row => rowToTask(row, evidencesByTask.get(row.id) || [])) });
  } catch {
    res.status(500).json({ error: "Erro ao buscar tarefas.", code: "INTERNAL" });
  }
});

// POST /api/tasks
router.post("/", (req: Request, res: Response): void => {
  try {
    const user = req.user!;
    const tenantId = req.tenantId!;
    const body = req.body;

    const atividade = mustString(body.atividade, "Atividade");
    if (atividade.length > 200) {
      res.status(400).json({ error: "Atividade muito longa (máx 200 chars).", code: "VALIDATION" });
      return;
    }

    // Determine the responsible user
    let responsavelEmail: string;
    let responsavelNome: string;
    let area: string;

    if (user.role === "ADMIN" || user.role === "LEADER") {
      responsavelEmail = mustString(body.responsavelEmail, "Responsável");
      // Get user info
      const respUser = db.prepare("SELECT nome, area FROM users WHERE tenant_id = ? AND email = ?")
        .get(tenantId, responsavelEmail) as { nome: string; area: string } | undefined;

      if (!respUser) {
        res.status(400).json({ error: "Responsável não encontrado.", code: "USER_NOT_FOUND" });
        return;
      }

      // LEADER can only assign to users in their area
      if (user.role === "LEADER" && respUser.area !== user.area) {
        res.status(403).json({ error: "LEADER só pode atribuir tarefas da sua área.", code: "FORBIDDEN" });
        return;
      }

      responsavelNome = respUser.nome;
      area = respUser.area;
    } else {
      // USER creates tasks for themselves
      responsavelEmail = user.email;
      responsavelNome = user.nome;
      area = user.area;

      // Validate recorrencia against rules
      const recorrencia = mustString(body.recorrencia, "Recorrência");
      const rule = db.prepare("SELECT allowed_recorrencias FROM rules WHERE tenant_id = ? AND area = ?")
        .get(tenantId, area) as { allowed_recorrencias: string } | undefined;

      if (!rule) {
        res.status(400).json({ error: "Nenhuma regra configurada para sua área. Contate o ADMIN.", code: "NO_RULE" });
        return;
      }

      const allowed: string[] = JSON.parse(rule.allowed_recorrencias || "[]");
      if (!allowed.includes(recorrencia)) {
        res.status(400).json({
          error: `Recorrência "${recorrencia}" não permitida para sua área. Permitidas: ${allowed.join(", ")}`,
          code: "RECORRENCIA_NOT_ALLOWED",
        });
        return;
      }
    }

    const prazo = optStr(body.prazo);
    const realizado = optStr(body.realizado);
    const observacoes = optStr(body.observacoes);

    if (observacoes.length > 1000) {
      res.status(400).json({ error: "Observações muito longas (máx 1000 chars).", code: "VALIDATION" });
      return;
    }

    const status = calcStatus(prazo, realizado);
    const id = uuidv4();
    const now = nowIso();

    db.prepare(`
      INSERT INTO tasks (id, tenant_id, competencia_ym, recorrencia, tipo, atividade,
        responsavel_email, responsavel_nome, area, prazo, realizado, status, observacoes,
        created_at, created_by, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, tenantId,
      mustString(body.competenciaYm, "Competência"),
      mustString(body.recorrencia, "Recorrência"),
      mustString(body.tipo, "Tipo"),
      atividade,
      responsavelEmail, responsavelNome, area,
      prazo || null, realizado || null,
      status, observacoes || null,
      now, user.email, now, user.email
    );

    const created = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskDbRow;
    res.status(201).json({ task: rowToTask(created, []) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao criar tarefa.";
    res.status(400).json({ error: msg, code: "VALIDATION" });
  }
});

// PUT /api/tasks/:id
router.put("/:id", (req: Request, res: Response): void => {
  try {
    const user = req.user!;
    const tenantId = req.tenantId!;
    const { id } = req.params;

    const task = db.prepare("SELECT * FROM tasks WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL")
      .get(id, tenantId) as TaskDbRow | undefined;

    if (!task) {
      res.status(404).json({ error: "Tarefa não encontrada.", code: "NOT_FOUND" });
      return;
    }

    // Access check
    if (user.role === "USER" && task.responsavel_email !== user.email) {
      res.status(403).json({ error: "Sem permissão para editar esta tarefa.", code: "FORBIDDEN" });
      return;
    }
    if (user.role === "LEADER" && task.area !== user.area) {
      res.status(403).json({ error: "Sem permissão para editar esta tarefa.", code: "FORBIDDEN" });
      return;
    }

    const body = req.body;
    let prazo: string | null;
    let realizado: string | null;
    let atividade: string;
    let observacoes: string | null;
    let competenciaYm: string;
    let recorrencia: string;
    let tipo: string;
    let responsavelEmail: string;
    let responsavelNome: string;
    let area: string;

    // USER can only update observacoes and realizado (mark as complete)
    if (user.role === "USER") {
      observacoes = optStr(body.observacoes ?? task.observacoes);
      realizado = optStr(body.realizado ?? task.realizado) || null;
      prazo = task.prazo || null;
      atividade = task.atividade;
      competenciaYm = task.competencia_ym;
      recorrencia = task.recorrencia;
      tipo = task.tipo;
      responsavelEmail = task.responsavel_email;
      responsavelNome = task.responsavel_nome;
      area = task.area;
    } else {
      prazo = optStr(body.prazo ?? task.prazo) || null;
      realizado = optStr(body.realizado ?? task.realizado) || null;
      atividade = optStr(body.atividade ?? task.atividade);
      observacoes = optStr(body.observacoes ?? task.observacoes) || null;
      competenciaYm = optStr(body.competenciaYm ?? task.competencia_ym);
      recorrencia = optStr(body.recorrencia ?? task.recorrencia);
      tipo = optStr(body.tipo ?? task.tipo);
      responsavelEmail = optStr(body.responsavelEmail ?? task.responsavel_email);
      responsavelNome = optStr(body.responsavelNome ?? task.responsavel_nome);
      area = optStr(body.area ?? task.area);
    }

    const status = calcStatus(prazo, realizado);
    const now = nowIso();

    db.prepare(`
      UPDATE tasks SET
        competencia_ym = ?, recorrencia = ?, tipo = ?, atividade = ?,
        responsavel_email = ?, responsavel_nome = ?, area = ?,
        prazo = ?, realizado = ?, status = ?, observacoes = ?,
        updated_at = ?, updated_by = ?
      WHERE id = ? AND tenant_id = ?
    `).run(
      competenciaYm, recorrencia, tipo, atividade,
      responsavelEmail, responsavelNome, area,
      prazo, realizado, status, observacoes,
      now, user.email,
      id, tenantId
    );

    const updated = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskDbRow;
    const evidences = db.prepare("SELECT * FROM task_evidences WHERE task_id = ? ORDER BY uploaded_at DESC")
      .all(id) as EvidenceDbRow[];
    res.json({ task: rowToTask(updated, evidences) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao atualizar tarefa.";
    res.status(400).json({ error: msg, code: "VALIDATION" });
  }
});

// DELETE /api/tasks/:id (soft delete)
router.delete("/:id", (req: Request, res: Response): void => {
  try {
    const user = req.user!;
    const tenantId = req.tenantId!;
    const { id } = req.params;

    const task = db.prepare("SELECT * FROM tasks WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL")
      .get(id, tenantId) as TaskDbRow | undefined;

    if (!task) {
      res.status(404).json({ error: "Tarefa não encontrada.", code: "NOT_FOUND" });
      return;
    }

    // Only ADMIN, LEADER (in area), or users with canDelete permission
    if (user.role === "USER" && !user.canDelete) {
      res.status(403).json({ error: "Sem permissão para excluir tarefas.", code: "FORBIDDEN" });
      return;
    }
    if (user.role === "LEADER" && task.area !== user.area) {
      res.status(403).json({ error: "Sem permissão para excluir esta tarefa.", code: "FORBIDDEN" });
      return;
    }

    db.prepare(`
      UPDATE tasks SET deleted_at = ?, deleted_by = ?
      WHERE id = ? AND tenant_id = ?
    `).run(nowIso(), user.email, id, tenantId);

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro ao excluir tarefa.", code: "INTERNAL" });
  }
});

// POST /api/tasks/:id/duplicate
router.post("/:id/duplicate", (req: Request, res: Response): void => {
  try {
    const user = req.user!;
    const tenantId = req.tenantId!;
    const { id } = req.params;

    if (user.role === "USER") {
      res.status(403).json({ error: "Sem permissão para duplicar tarefas.", code: "FORBIDDEN" });
      return;
    }

    const task = db.prepare("SELECT * FROM tasks WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL")
      .get(id, tenantId) as TaskDbRow | undefined;

    if (!task) {
      res.status(404).json({ error: "Tarefa não encontrada.", code: "NOT_FOUND" });
      return;
    }

    const newId = uuidv4();
    const now = nowIso();

    db.prepare(`
      INSERT INTO tasks (id, tenant_id, competencia_ym, recorrencia, tipo, atividade,
        responsavel_email, responsavel_nome, area, prazo, realizado, status, observacoes,
        created_at, created_by, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'Em Andamento', ?, ?, ?, ?, ?)
    `).run(
      newId, tenantId, task.competencia_ym, task.recorrencia, task.tipo,
      task.atividade, task.responsavel_email, task.responsavel_nome, task.area,
      task.prazo, task.observacoes, now, user.email, now, user.email
    );

    const created = db.prepare("SELECT * FROM tasks WHERE id = ?").get(newId) as TaskDbRow;
    res.status(201).json({ task: rowToTask(created, []) });
  } catch {
    res.status(500).json({ error: "Erro ao duplicar tarefa.", code: "INTERNAL" });
  }
});

const MAX_EVIDENCE_SIZE = 10 * 1024 * 1024;
const uploadsBaseDir = path.resolve(process.cwd(), "data", "uploads");

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf", "application/octet-stream",
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "text/plain", "text/csv",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\-]/g, "_").slice(0, 120) || "arquivo";
}

function parseBase64Payload(input: string): string {
  const trimmed = input.trim();
  const idx = trimmed.indexOf("base64,");
  if (idx >= 0) return trimmed.slice(idx + 7);
  return trimmed;
}

// GET /api/tasks/:id/evidences
router.get("/:id/evidences", (req: Request, res: Response): void => {
  try {
    const user = req.user!;
    const tenantId = req.tenantId!;
    const { id } = req.params;

    const task = db.prepare("SELECT * FROM tasks WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL")
      .get(id, tenantId) as TaskDbRow | undefined;

    if (!task) {
      res.status(404).json({ error: "Tarefa não encontrada.", code: "NOT_FOUND" });
      return;
    }
    if (!canReadTask(user, task)) {
      res.status(403).json({ error: "Sem permissão para visualizar evidências.", code: "FORBIDDEN" });
      return;
    }

    const evidenceRows = db.prepare(`
      SELECT * FROM task_evidences
      WHERE task_id = ? AND tenant_id = ?
      ORDER BY uploaded_at DESC
    `).all(id, tenantId) as EvidenceDbRow[];

    res.json({ evidences: evidenceRows.map(row => toEvidence(row, id)) });
  } catch {
    res.status(500).json({ error: "Erro ao buscar evidências.", code: "INTERNAL" });
  }
});

// POST /api/tasks/:id/evidences
router.post("/:id/evidences", (req: Request, res: Response): void => {
  try {
    const user = req.user!;
    const tenantId = req.tenantId!;
    const { id: taskId } = req.params;
    const { fileName: fileNameRaw, mimeType: mimeTypeRaw, contentBase64 } = req.body || {};

    const task = db.prepare("SELECT * FROM tasks WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL")
      .get(taskId, tenantId) as TaskDbRow | undefined;

    if (!task) {
      res.status(404).json({ error: "Tarefa não encontrada.", code: "NOT_FOUND" });
      return;
    }
    if (!canManageTask(user, task)) {
      res.status(403).json({ error: "Sem permissão para anexar evidências.", code: "FORBIDDEN" });
      return;
    }

    const fileName = mustString(fileNameRaw, "Nome do arquivo");
    const mimeType = (optStr(mimeTypeRaw) || "application/octet-stream").toLowerCase().split(";")[0].trim();
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      res.status(400).json({ error: "Tipo de arquivo não permitido.", code: "INVALID_MIME" });
      return;
    }
    const base64Payload = parseBase64Payload(mustString(contentBase64, "Conteúdo do arquivo"));
    const fileBuffer = Buffer.from(base64Payload, "base64");

    if (!fileBuffer.length) {
      res.status(400).json({ error: "Arquivo inválido.", code: "INVALID_FILE" });
      return;
    }
    if (fileBuffer.length > MAX_EVIDENCE_SIZE) {
      res.status(400).json({ error: "Arquivo excede 10MB.", code: "FILE_TOO_LARGE" });
      return;
    }

    const evidenceId = uuidv4();
    const safeName = sanitizeFileName(fileName);
    const tenantDir = path.join(uploadsBaseDir, tenantId, taskId);
    fs.mkdirSync(tenantDir, { recursive: true });
    const diskName = `${evidenceId}_${safeName}`;
    const absolutePath = path.join(tenantDir, diskName);
    fs.writeFileSync(absolutePath, fileBuffer);

    const relativePath = path.relative(process.cwd(), absolutePath).replaceAll("\\", "/");
    const now = nowIso();

    db.prepare(`
      INSERT INTO task_evidences
      (id, tenant_id, task_id, file_name, file_path, mime_type, file_size, uploaded_at, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      evidenceId,
      tenantId,
      taskId,
      fileName,
      relativePath,
      mimeType,
      fileBuffer.length,
      now,
      user.email
    );

    const evidence = db.prepare("SELECT * FROM task_evidences WHERE id = ?").get(evidenceId) as EvidenceDbRow;
    const evidences = db.prepare("SELECT * FROM task_evidences WHERE task_id = ? ORDER BY uploaded_at DESC")
      .all(taskId) as EvidenceDbRow[];
    const updatedTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as TaskDbRow;

    res.status(201).json({
      evidence: toEvidence(evidence, taskId),
      task: rowToTask(updatedTask, evidences),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao anexar evidência.";
    res.status(400).json({ error: msg, code: "VALIDATION" });
  }
});

// GET /api/tasks/:id/evidences/:evidenceId/download
router.get("/:id/evidences/:evidenceId/download", (req: Request, res: Response): void => {
  try {
    const user = req.user!;
    const tenantId = req.tenantId!;
    const { id: taskId, evidenceId } = req.params;

    const task = db.prepare("SELECT * FROM tasks WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL")
      .get(taskId, tenantId) as TaskDbRow | undefined;

    if (!task) {
      res.status(404).json({ error: "Tarefa não encontrada.", code: "NOT_FOUND" });
      return;
    }
    if (!canReadTask(user, task)) {
      res.status(403).json({ error: "Sem permissão para baixar evidências.", code: "FORBIDDEN" });
      return;
    }

    const evidence = db.prepare(`
      SELECT * FROM task_evidences
      WHERE id = ? AND task_id = ? AND tenant_id = ?
    `).get(evidenceId, taskId, tenantId) as EvidenceDbRow | undefined;

    if (!evidence) {
      res.status(404).json({ error: "Evidência não encontrada.", code: "NOT_FOUND" });
      return;
    }

    const absolutePath = path.resolve(process.cwd(), evidence.file_path);
    const uploadsBase = path.resolve(process.cwd(), "data", "uploads");
    if (!absolutePath.startsWith(uploadsBase + path.sep) && absolutePath !== uploadsBase) {
      res.status(400).json({ error: "Caminho de arquivo inválido.", code: "INVALID_PATH" });
      return;
    }
    if (!fs.existsSync(absolutePath)) {
      res.status(404).json({ error: "Arquivo não encontrado no disco.", code: "FILE_NOT_FOUND" });
      return;
    }

    const mime = evidence.mime_type || "application/octet-stream";
    const inline = req.query.inline === "1" || String(req.query.inline).toLowerCase() === "true";
    res.setHeader("Content-Type", mime);
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (inline) {
      res.setHeader("Content-Disposition", "inline");
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.sendFile(absolutePath);
    } else {
      res.download(absolutePath, evidence.file_name);
    }
  } catch {
    res.status(500).json({ error: "Erro ao baixar evidência.", code: "INTERNAL" });
  }
});

// DELETE /api/tasks/:id/evidences/:evidenceId
router.delete("/:id/evidences/:evidenceId", (req: Request, res: Response): void => {
  try {
    const user = req.user!;
    const tenantId = req.tenantId!;
    const { id: taskId, evidenceId } = req.params;

    const task = db.prepare("SELECT * FROM tasks WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL")
      .get(taskId, tenantId) as TaskDbRow | undefined;

    if (!task) {
      res.status(404).json({ error: "Tarefa não encontrada.", code: "NOT_FOUND" });
      return;
    }
    if (!canManageTask(user, task)) {
      res.status(403).json({ error: "Sem permissão para remover evidências.", code: "FORBIDDEN" });
      return;
    }

    const evidence = db.prepare(`
      SELECT * FROM task_evidences
      WHERE id = ? AND task_id = ? AND tenant_id = ?
    `).get(evidenceId, taskId, tenantId) as EvidenceDbRow | undefined;

    if (!evidence) {
      res.status(404).json({ error: "Evidência não encontrada.", code: "NOT_FOUND" });
      return;
    }

    const absolutePath = path.resolve(process.cwd(), evidence.file_path);
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }

    db.prepare("DELETE FROM task_evidences WHERE id = ? AND tenant_id = ?").run(evidenceId, tenantId);

    const evidences = db.prepare("SELECT * FROM task_evidences WHERE task_id = ? ORDER BY uploaded_at DESC")
      .all(taskId) as EvidenceDbRow[];
    const updatedTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as TaskDbRow;

    res.json({ ok: true, task: rowToTask(updatedTask, evidences) });
  } catch {
    res.status(500).json({ error: "Erro ao remover evidência.", code: "INTERNAL" });
  }
});

export default router;
