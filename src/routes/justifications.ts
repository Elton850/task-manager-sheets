import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import db from "../db";
import { requireAuth } from "../middleware/auth";
import { mustString, optStr, nowIso } from "../utils";

const router = Router();
router.use(requireAuth);

const MAX_EVIDENCE_SIZE = 10 * 1024 * 1024;
const uploadsBaseDir = path.resolve(process.cwd(), "data", "uploads");
const JUSTIFICATION_UPLOAD_DIR = "justification_evidences";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf", "application/octet-stream",
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "text/plain", "text/csv",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

interface TaskRow {
  id: string;
  tenant_id: string;
  atividade: string;
  responsavel_email: string;
  responsavel_nome: string;
  area: string;
  prazo: string | null;
  realizado: string | null;
  status: string;
  justification_blocked?: number;
  justification_blocked_at?: string | null;
  justification_blocked_by?: string | null;
}

interface JustificationRow {
  id: string;
  tenant_id: string;
  task_id: string;
  description: string;
  status: string;
  created_at: string;
  created_by: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_comment: string | null;
}

interface JustificationEvidenceRow {
  id: string;
  tenant_id: string;
  justification_id: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  file_size: number;
  uploaded_at: string;
  uploaded_by: string;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\-]/g, "_").slice(0, 120) || "arquivo";
}

function parseBase64Payload(input: string): string {
  const trimmed = input.trim();
  const idx = trimmed.indexOf("base64,");
  if (idx >= 0) return trimmed.slice(idx + 7);
  return trimmed;
}

type JustificationStatus = "none" | "pending" | "approved" | "refused" | "blocked";

function getJustificationStatus(
  task: TaskRow,
  latestJustification: JustificationRow | null
): JustificationStatus {
  if (task.justification_blocked) return "blocked";
  if (!latestJustification) return "none";
  if (latestJustification.status === "pending") return "pending";
  if (latestJustification.status === "approved") return "approved";
  return "refused";
}

// GET /api/justifications/mine — User: minhas tarefas concluídas em atraso no período
router.get("/mine", (req: Request, res: Response): void => {
  try {
    const user = req.user!;
    const tenantId = req.tenantId!;
    if (user.role !== "USER") {
      res.status(403).json({ error: "Acesso apenas para usuário.", code: "FORBIDDEN" });
      return;
    }
    const competenciaYm = typeof req.query.competenciaYm === "string" ? req.query.competenciaYm : null;
    let where = "tenant_id = ? AND deleted_at IS NULL AND responsavel_email = ? AND status = 'Concluído em Atraso' AND parent_task_id IS NULL";
    const params: (string | null)[] = [tenantId, user.email];
    if (competenciaYm) {
      where += " AND competencia_ym = ?";
      params.push(competenciaYm);
    }
    const tasks = db.prepare(`
      SELECT id, tenant_id, atividade, responsavel_email, responsavel_nome, area, prazo, realizado, status,
             justification_blocked, justification_blocked_at, justification_blocked_by, competencia_ym
      FROM tasks WHERE ${where}
      ORDER BY competencia_ym DESC, realizado DESC
    `).all(...params) as (TaskRow & { competencia_ym: string })[];
    const taskIds = tasks.map(t => t.id);
    const justificationMap = new Map<string, JustificationRow>();
    if (taskIds.length > 0) {
      const placeholders = taskIds.map(() => "?").join(",");
      const rows = db.prepare(`
        SELECT j.* FROM task_justifications j
        WHERE j.task_id IN (${placeholders}) AND j.tenant_id = ?
        ORDER BY j.created_at DESC
      `).all(...taskIds, tenantId) as JustificationRow[];
      for (const t of tasks) {
        const latest = rows.find(r => r.task_id === t.id);
        if (latest) justificationMap.set(t.id, latest);
      }
    }
    const evidencesByJust = new Map<string, JustificationEvidenceRow[]>();
    const justIds = [...justificationMap.values()].map(j => j.id);
    if (justIds.length > 0) {
      const ph = justIds.map(() => "?").join(",");
      const evRows = db.prepare(`
        SELECT * FROM justification_evidences WHERE justification_id IN (${ph}) ORDER BY uploaded_at DESC
      `).all(...justIds) as JustificationEvidenceRow[];
      for (const e of evRows) {
        const list = evidencesByJust.get(e.justification_id) || [];
        list.push(e);
        evidencesByJust.set(e.justification_id, list);
      }
    }
    const items = tasks.map(task => {
      const j = justificationMap.get(task.id) || null;
      const status = getJustificationStatus(task, j);
      const evidences = j ? (evidencesByJust.get(j.id) || []) : [];
      return {
        task: {
          id: task.id,
          tenantId: task.tenant_id,
          atividade: task.atividade,
          responsavelNome: task.responsavel_nome,
          area: task.area,
          prazo: task.prazo || "",
          realizado: task.realizado || "",
          status: task.status,
          competenciaYm: (task as TaskRow & { competencia_ym: string }).competencia_ym,
        },
        justificationStatus: status,
        justification: j ? {
          id: j.id,
          taskId: j.task_id,
          description: j.description,
          status: j.status,
          createdAt: j.created_at,
          createdBy: j.created_by,
          reviewedAt: j.reviewed_at,
          reviewedBy: j.reviewed_by,
          reviewComment: j.review_comment,
          evidences: evidences.map(e => ({
            id: e.id,
            fileName: e.file_name,
            mimeType: e.mime_type,
            fileSize: e.file_size,
            uploadedAt: e.uploaded_at,
            downloadUrl: `/api/justifications/${j.id}/evidences/${e.id}/download`,
          })),
        } : null,
      };
    });
    res.json({ items });
  } catch {
    res.status(500).json({ error: "Erro ao listar justificativas.", code: "INTERNAL" });
  }
});

// GET /api/justifications/pending — Leader: solicitações pendentes da sua área
router.get("/pending", (req: Request, res: Response): void => {
  try {
    const user = req.user!;
    const tenantId = req.tenantId!;
    if (user.role !== "LEADER" && user.role !== "ADMIN") {
      res.status(403).json({ error: "Acesso apenas para líder ou administrador.", code: "FORBIDDEN" });
      return;
    }
    const areaFilter = user.role === "LEADER" ? " AND t.area = ?" : "";
    const params: string[] = [tenantId];
    if (user.role === "LEADER") params.push(user.area);
    const rows = db.prepare(`
      SELECT j.id, j.task_id, j.description, j.status, j.created_at, j.created_by,
             t.atividade, t.responsavel_email, t.responsavel_nome, t.prazo, t.realizado, t.area
      FROM task_justifications j
      JOIN tasks t ON t.id = j.task_id AND t.tenant_id = j.tenant_id AND t.deleted_at IS NULL
      WHERE j.tenant_id = ? AND j.status = 'pending'${areaFilter}
      ORDER BY j.created_at ASC
    `).all(...params) as (JustificationRow & { atividade: string; responsavel_email: string; responsavel_nome: string; prazo: string | null; realizado: string | null; area: string })[];
    res.json({ items: rows.map(r => ({
      id: r.id,
      taskId: r.task_id,
      description: r.description,
      status: r.status,
      createdAt: r.created_at,
      createdBy: r.created_by,
      task: {
        atividade: r.atividade,
        responsavelEmail: r.responsavel_email,
        responsavelNome: r.responsavel_nome,
        prazo: r.prazo,
        realizado: r.realizado,
        area: r.area,
      },
    })) });
  } catch {
    res.status(500).json({ error: "Erro ao listar pendentes.", code: "INTERNAL" });
  }
});

// GET /api/justifications/approved — Leader: justificativas aprovadas da sua área
router.get("/approved", (req: Request, res: Response): void => {
  try {
    const user = req.user!;
    const tenantId = req.tenantId!;
    if (user.role !== "LEADER" && user.role !== "ADMIN") {
      res.status(403).json({ error: "Acesso apenas para líder ou administrador.", code: "FORBIDDEN" });
      return;
    }
    const areaFilter = user.role === "LEADER" ? " AND t.area = ?" : "";
    const params: string[] = [tenantId];
    if (user.role === "LEADER") params.push(user.area);
    const rows = db.prepare(`
      SELECT j.id, j.task_id, j.description, j.status, j.created_at, j.created_by,
             j.reviewed_at, j.reviewed_by,
             t.atividade, t.responsavel_email, t.responsavel_nome, t.prazo, t.realizado, t.area
      FROM task_justifications j
      JOIN tasks t ON t.id = j.task_id AND t.tenant_id = j.tenant_id AND t.deleted_at IS NULL
      WHERE j.tenant_id = ? AND j.status = 'approved'${areaFilter}
      ORDER BY j.reviewed_at DESC, j.created_at DESC
    `).all(...params) as (JustificationRow & { atividade: string; responsavel_email: string; responsavel_nome: string; prazo: string | null; realizado: string | null; area: string })[];
    res.json({ items: rows.map(r => ({
      id: r.id,
      taskId: r.task_id,
      description: r.description,
      status: r.status,
      createdAt: r.created_at,
      createdBy: r.created_by,
      reviewedAt: r.reviewed_at,
      reviewedBy: r.reviewed_by,
      task: {
        atividade: r.atividade,
        responsavelEmail: r.responsavel_email,
        responsavelNome: r.responsavel_nome,
        prazo: r.prazo,
        realizado: r.realizado,
        area: r.area,
      },
    })) });
  } catch {
    res.status(500).json({ error: "Erro ao listar aprovadas.", code: "INTERNAL" });
  }
});

// GET /api/justifications/blocked — Leader: tarefas com justificativa bloqueada
router.get("/blocked", (req: Request, res: Response): void => {
  try {
    const user = req.user!;
    const tenantId = req.tenantId!;
    if (user.role !== "LEADER" && user.role !== "ADMIN") {
      res.status(403).json({ error: "Acesso apenas para líder ou administrador.", code: "FORBIDDEN" });
      return;
    }
    const areaFilter = user.role === "LEADER" ? " AND area = ?" : "";
    const params: string[] = [tenantId];
    if (user.role === "LEADER") params.push(user.area);
    const rows = db.prepare(`
      SELECT id, tenant_id, atividade, responsavel_email, responsavel_nome, area, prazo, realizado,
             justification_blocked_at, justification_blocked_by
      FROM tasks
      WHERE tenant_id = ? AND deleted_at IS NULL AND justification_blocked = 1 AND parent_task_id IS NULL${areaFilter}
      ORDER BY justification_blocked_at DESC
    `).all(...params) as (TaskRow & { competencia_ym?: string; justification_blocked_at: string | null; justification_blocked_by: string | null })[];
    res.json({ items: rows.map(t => ({
      taskId: t.id,
      atividade: t.atividade,
      responsavelNome: t.responsavel_nome,
      area: t.area,
      blockedAt: t.justification_blocked_at,
      blockedBy: t.justification_blocked_by,
    })) });
  } catch {
    res.status(500).json({ error: "Erro ao listar bloqueadas.", code: "INTERNAL" });
  }
});

// PUT /api/justifications/task/:taskId/unblock — Leader: habilitar justificativa novamente
router.put("/task/:taskId/unblock", (req: Request, res: Response): void => {
  try {
    const user = req.user!;
    const tenantId = req.tenantId!;
    const { taskId } = req.params;
    if (user.role !== "LEADER" && user.role !== "ADMIN") {
      res.status(403).json({ error: "Apenas líder ou administrador.", code: "FORBIDDEN" });
      return;
    }
    const task = db.prepare("SELECT id, area FROM tasks WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL")
      .get(taskId, tenantId) as { id: string; area: string } | undefined;
    if (!task) {
      res.status(404).json({ error: "Tarefa não encontrada.", code: "NOT_FOUND" });
      return;
    }
    if (user.role === "LEADER" && task.area !== user.area) {
      res.status(403).json({ error: "Sem permissão.", code: "FORBIDDEN" });
      return;
    }
    db.prepare(`
      UPDATE tasks SET justification_blocked = 0, justification_blocked_at = NULL, justification_blocked_by = NULL
      WHERE id = ? AND tenant_id = ?
    `).run(taskId, tenantId);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro ao desbloquear.", code: "INTERNAL" });
  }
});

// POST /api/justifications — User: criar justificativa para tarefa concluída em atraso
router.post("/", (req: Request, res: Response): void => {
  try {
    const user = req.user!;
    const tenantId = req.tenantId!;
    if (user.role !== "USER") {
      res.status(403).json({ error: "Apenas o responsável pode justificar.", code: "FORBIDDEN" });
      return;
    }
    const body = req.body;
    const taskId = mustString(body.taskId, "taskId");
    const description = mustString(body.description, "Descrição da justificativa");
    if (description.length > 2000) {
      res.status(400).json({ error: "Descrição muito longa (máx 2000 caracteres).", code: "VALIDATION" });
      return;
    }
    const task = db.prepare(`
      SELECT id, responsavel_email, status, justification_blocked
      FROM tasks WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL AND parent_task_id IS NULL
    `).get(taskId, tenantId) as { id: string; responsavel_email: string; status: string; justification_blocked: number } | undefined;
    if (!task) {
      res.status(404).json({ error: "Tarefa não encontrada.", code: "NOT_FOUND" });
      return;
    }
    if (task.responsavel_email !== user.email) {
      res.status(403).json({ error: "Só o responsável pela tarefa pode justificar.", code: "FORBIDDEN" });
      return;
    }
    if (task.status !== "Concluído em Atraso") {
      res.status(400).json({ error: "Apenas tarefas concluídas em atraso podem ser justificadas.", code: "VALIDATION" });
      return;
    }
    if (task.justification_blocked) {
      res.status(400).json({ error: "Justificativa bloqueada para esta tarefa.", code: "BLOCKED" });
      return;
    }
    const existing = db.prepare("SELECT id FROM task_justifications WHERE task_id = ? AND tenant_id = ? AND status = 'pending'")
      .get(taskId, tenantId) as { id: string } | undefined;
    if (existing) {
      res.status(400).json({ error: "Já existe uma justificativa em análise para esta tarefa.", code: "PENDING_EXISTS" });
      return;
    }
    const id = uuidv4();
    const now = nowIso();
    db.prepare(`
      INSERT INTO task_justifications (id, tenant_id, task_id, description, status, created_at, created_by)
      VALUES (?, ?, ?, ?, 'pending', ?, ?)
    `).run(id, tenantId, taskId, description, now, user.email);
    const row = db.prepare("SELECT * FROM task_justifications WHERE id = ?").get(id) as JustificationRow;
    res.status(201).json({
      justification: {
        id: row.id,
        taskId: row.task_id,
        description: row.description,
        status: row.status,
        createdAt: row.created_at,
        createdBy: row.created_by,
        evidences: [],
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao criar justificativa.";
    res.status(400).json({ error: msg, code: "VALIDATION" });
  }
});

// GET /api/justifications/:id — detalhe de uma justificativa (User dono ou Leader área)
router.get("/:id", (req: Request, res: Response): void => {
  try {
    const user = req.user!;
    const tenantId = req.tenantId!;
    const { id } = req.params;
    const j = db.prepare("SELECT * FROM task_justifications WHERE id = ? AND tenant_id = ?")
      .get(id, tenantId) as JustificationRow | undefined;
    if (!j) {
      res.status(404).json({ error: "Justificativa não encontrada.", code: "NOT_FOUND" });
      return;
    }
    const task = db.prepare("SELECT * FROM tasks WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL")
      .get(j.task_id, tenantId) as TaskRow | undefined;
    if (!task) {
      res.status(404).json({ error: "Tarefa não encontrada.", code: "NOT_FOUND" });
      return;
    }
    const canRead = user.role === "ADMIN" ||
      (user.role === "LEADER" && task.area === user.area) ||
      (user.role === "USER" && task.responsavel_email === user.email);
    if (!canRead) {
      res.status(403).json({ error: "Sem permissão.", code: "FORBIDDEN" });
      return;
    }
    const evidences = db.prepare("SELECT * FROM justification_evidences WHERE justification_id = ? ORDER BY uploaded_at DESC")
      .all(id) as JustificationEvidenceRow[];
    res.json({
      justification: {
        id: j.id,
        taskId: j.task_id,
        description: j.description,
        status: j.status,
        createdAt: j.created_at,
        createdBy: j.created_by,
        reviewedAt: j.reviewed_at,
        reviewedBy: j.reviewed_by,
        reviewComment: j.review_comment,
        task: { id: task.id, atividade: task.atividade, responsavelNome: task.responsavel_nome, prazo: task.prazo, realizado: task.realizado },
        evidences: evidences.map(e => ({
          id: e.id,
          fileName: e.file_name,
          mimeType: e.mime_type,
          fileSize: e.file_size,
          uploadedAt: e.uploaded_at,
          downloadUrl: `/api/justifications/${j.id}/evidences/${e.id}/download`,
        })),
      },
    });
  } catch {
    res.status(500).json({ error: "Erro ao buscar justificativa.", code: "INTERNAL" });
  }
});

// POST /api/justifications/:id/evidences — anexar evidência (máx 1 por justificativa)
router.post("/:id/evidences", (req: Request, res: Response): void => {
  try {
    const user = req.user!;
    const tenantId = req.tenantId!;
    const { id: justificationId } = req.params;
    const { fileName: fileNameRaw, mimeType: mimeTypeRaw, contentBase64 } = req.body || {};
    const j = db.prepare("SELECT * FROM task_justifications WHERE id = ? AND tenant_id = ?")
      .get(justificationId, tenantId) as JustificationRow | undefined;
    if (!j) {
      res.status(404).json({ error: "Justificativa não encontrada.", code: "NOT_FOUND" });
      return;
    }
    if (j.status !== "pending") {
      res.status(400).json({ error: "Só é possível anexar evidência em justificativa pendente.", code: "VALIDATION" });
      return;
    }
    const task = db.prepare("SELECT responsavel_email FROM tasks WHERE id = ? AND tenant_id = ?")
      .get(j.task_id, tenantId) as { responsavel_email: string } | undefined;
    if (!task || task.responsavel_email !== user.email) {
      res.status(403).json({ error: "Sem permissão.", code: "FORBIDDEN" });
      return;
    }
    const existing = db.prepare("SELECT COUNT(*) as c FROM justification_evidences WHERE justification_id = ?").get(justificationId) as { c: number };
    if (existing.c >= 1) {
      res.status(400).json({ error: "Apenas uma evidência por justificativa.", code: "MAX_EVIDENCE" });
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
    const dir = path.join(uploadsBaseDir, tenantId, JUSTIFICATION_UPLOAD_DIR, justificationId);
    fs.mkdirSync(dir, { recursive: true });
    const diskName = `${evidenceId}_${safeName}`;
    const absolutePath = path.join(dir, diskName);
    fs.writeFileSync(absolutePath, fileBuffer);
    const relativePath = path.relative(process.cwd(), absolutePath).replaceAll("\\", "/");
    const now = nowIso();
    db.prepare(`
      INSERT INTO justification_evidences (id, tenant_id, justification_id, file_name, file_path, mime_type, file_size, uploaded_at, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(evidenceId, tenantId, justificationId, fileName, relativePath, mimeType, fileBuffer.length, now, user.email);
    const ev = db.prepare("SELECT * FROM justification_evidences WHERE id = ?").get(evidenceId) as JustificationEvidenceRow;
    res.status(201).json({
      evidence: {
        id: ev.id,
        fileName: ev.file_name,
        mimeType: ev.mime_type,
        fileSize: ev.file_size,
        uploadedAt: ev.uploaded_at,
        downloadUrl: `/api/justifications/${justificationId}/evidences/${ev.id}/download`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao anexar evidência.";
    res.status(400).json({ error: msg, code: "VALIDATION" });
  }
});

// GET /api/justifications/:id/evidences/:eid/download
router.get("/:id/evidences/:eid/download", (req: Request, res: Response): void => {
  try {
    const user = req.user!;
    const tenantId = req.tenantId!;
    const { id: justificationId, eid: evidenceId } = req.params;
    const j = db.prepare("SELECT * FROM task_justifications WHERE id = ? AND tenant_id = ?")
      .get(justificationId, tenantId) as JustificationRow | undefined;
    if (!j) {
      res.status(404).json({ error: "Justificativa não encontrada.", code: "NOT_FOUND" });
      return;
    }
    const task = db.prepare("SELECT * FROM tasks WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL")
      .get(j.task_id, tenantId) as TaskRow | undefined;
    if (!task) {
      res.status(404).json({ error: "Tarefa não encontrada.", code: "NOT_FOUND" });
      return;
    }
    const canRead = user.role === "ADMIN" ||
      (user.role === "LEADER" && task.area === user.area) ||
      (user.role === "USER" && task.responsavel_email === user.email);
    if (!canRead) {
      res.status(403).json({ error: "Sem permissão.", code: "FORBIDDEN" });
      return;
    }
    const ev = db.prepare(`
      SELECT * FROM justification_evidences WHERE id = ? AND justification_id = ? AND tenant_id = ?
    `).get(evidenceId, justificationId, tenantId) as JustificationEvidenceRow | undefined;
    if (!ev) {
      res.status(404).json({ error: "Evidência não encontrada.", code: "NOT_FOUND" });
      return;
    }
    const absolutePath = path.resolve(process.cwd(), ev.file_path);
    const baseDir = path.resolve(process.cwd(), "data", "uploads");
    if (!absolutePath.startsWith(baseDir + path.sep) && absolutePath !== baseDir) {
      res.status(400).json({ error: "Caminho inválido.", code: "INVALID_PATH" });
      return;
    }
    if (!fs.existsSync(absolutePath)) {
      res.status(404).json({ error: "Arquivo não encontrado.", code: "FILE_NOT_FOUND" });
      return;
    }
    const mime = ev.mime_type || "application/octet-stream";
    const inline = req.query.inline === "1" || String(req.query.inline).toLowerCase() === "true";
    res.setHeader("Content-Type", mime);
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (inline) {
      res.setHeader("Content-Disposition", "inline");
      res.sendFile(absolutePath);
    } else {
      res.download(absolutePath, ev.file_name);
    }
  } catch {
    res.status(500).json({ error: "Erro ao baixar.", code: "INTERNAL" });
  }
});

// DELETE /api/justifications/:id/evidences/:eid
router.delete("/:id/evidences/:eid", (req: Request, res: Response): void => {
  try {
    const user = req.user!;
    const tenantId = req.tenantId!;
    const { id: justificationId, eid: evidenceId } = req.params;
    const j = db.prepare("SELECT * FROM task_justifications WHERE id = ? AND tenant_id = ?")
      .get(justificationId, tenantId) as JustificationRow | undefined;
    if (!j) {
      res.status(404).json({ error: "Justificativa não encontrada.", code: "NOT_FOUND" });
      return;
    }
    if (j.status !== "pending") {
      res.status(400).json({ error: "Só é possível remover evidência de justificativa pendente.", code: "VALIDATION" });
      return;
    }
    const task = db.prepare("SELECT responsavel_email FROM tasks WHERE id = ? AND tenant_id = ?")
      .get(j.task_id, tenantId) as { responsavel_email: string } | undefined;
    if (!task || task.responsavel_email !== user.email) {
      res.status(403).json({ error: "Sem permissão.", code: "FORBIDDEN" });
      return;
    }
    const ev = db.prepare(`
      SELECT * FROM justification_evidences WHERE id = ? AND justification_id = ? AND tenant_id = ?
    `).get(evidenceId, justificationId, tenantId) as JustificationEvidenceRow | undefined;
    if (!ev) {
      res.status(404).json({ error: "Evidência não encontrada.", code: "NOT_FOUND" });
      return;
    }
    const absolutePath = path.resolve(process.cwd(), ev.file_path);
    if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
    db.prepare("DELETE FROM justification_evidences WHERE id = ? AND tenant_id = ?").run(evidenceId, tenantId);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro ao remover evidência.", code: "INTERNAL" });
  }
});

// PUT /api/justifications/:id/review — Leader: aprovar, recusar ou recusar e bloquear
router.put("/:id/review", (req: Request, res: Response): void => {
  try {
    const user = req.user!;
    const tenantId = req.tenantId!;
    const { id } = req.params;
    const body = req.body;
    const action = (optStr(body.action) || "").toLowerCase();
    if (!["approve", "refuse", "refuse_and_block"].includes(action)) {
      res.status(400).json({ error: "Ação inválida. Use approve, refuse ou refuse_and_block.", code: "VALIDATION" });
      return;
    }
    if (user.role !== "LEADER" && user.role !== "ADMIN") {
      res.status(403).json({ error: "Apenas líder ou administrador.", code: "FORBIDDEN" });
      return;
    }
    const j = db.prepare("SELECT * FROM task_justifications WHERE id = ? AND tenant_id = ?")
      .get(id, tenantId) as JustificationRow | undefined;
    if (!j) {
      res.status(404).json({ error: "Justificativa não encontrada.", code: "NOT_FOUND" });
      return;
    }
    if (j.status !== "pending") {
      res.status(400).json({ error: "Justificativa já foi analisada.", code: "ALREADY_REVIEWED" });
      return;
    }
    const task = db.prepare("SELECT id, area FROM tasks WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL")
      .get(j.task_id, tenantId) as { id: string; area: string } | undefined;
    if (!task) {
      res.status(404).json({ error: "Tarefa não encontrada.", code: "NOT_FOUND" });
      return;
    }
    if (user.role === "LEADER" && task.area !== user.area) {
      res.status(403).json({ error: "Sem permissão para esta área.", code: "FORBIDDEN" });
      return;
    }
    const reviewComment = optStr(body.reviewComment);
    if (action !== "approve" && reviewComment.length > 2000) {
      res.status(400).json({ error: "Comentário de recusa muito longo (máx 2000).", code: "VALIDATION" });
      return;
    }
    const now = nowIso();
    const newStatus = action === "approve" ? "approved" : "refused";
    db.prepare(`
      UPDATE task_justifications SET status = ?, reviewed_at = ?, reviewed_by = ?, review_comment = ?
      WHERE id = ? AND tenant_id = ?
    `).run(newStatus, now, user.email, action === "approve" ? null : reviewComment || null, id, tenantId);
    if (action === "refuse_and_block") {
      db.prepare(`
        UPDATE tasks SET justification_blocked = 1, justification_blocked_at = ?, justification_blocked_by = ?
        WHERE id = ? AND tenant_id = ?
      `).run(now, user.email, j.task_id, tenantId);
    }
    const updated = db.prepare("SELECT * FROM task_justifications WHERE id = ?").get(id) as JustificationRow;
    res.json({
      justification: {
        id: updated.id,
        taskId: updated.task_id,
        status: updated.status,
        reviewedAt: updated.reviewed_at,
        reviewedBy: updated.reviewed_by,
        reviewComment: updated.review_comment,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao analisar justificativa.";
    res.status(400).json({ error: msg, code: "VALIDATION" });
  }
});

export default router;
