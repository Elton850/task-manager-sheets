import React, { useState, useEffect, useRef } from "react";
import { Paperclip, Upload, Trash2, ExternalLink, Download, FileText, Layers, Plus } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import Badge, { getStatusVariant } from "@/components/ui/Badge";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { tasksApi } from "@/services/api";
import type { Task, Lookups, User, TaskEvidence } from "@/types";

interface TaskModalProps {
  open: boolean;
  task?: Task | null;
  initialData?: Partial<Task>;
  lookups: Lookups;
  users: User[];
  /** Quando definido (ex: USER), apenas essas recorrências são oferecidas na criação */
  allowedRecorrencias?: string[];
  onClose: () => void;
  onSave: (data: Partial<Task>) => Promise<Task | void>;
  onTaskChange?: (task: Task) => void;
  /** Chamado quando uma sub tarefa é criada (Leader/Admin na tarefa principal) */
  onSubtaskCreated?: (subtask: Task) => void;
  loading?: boolean;
}

const MAX_EVIDENCE_SIZE = 10 * 1024 * 1024;

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Falha ao ler arquivo."));
    reader.readAsDataURL(file);
  });
}

export default function TaskModal({
  open,
  task,
  initialData,
  lookups,
  users,
  allowedRecorrencias,
  onClose,
  onSave,
  onTaskChange,
  onSubtaskCreated,
  loading,
}: TaskModalProps) {
  const { user, tenant } = useAuth();
  const { toast } = useToast();
  const isEdit = !!task;
  const isUserOnlyObservacoes = user?.role === "USER" && isEdit;
  const taskConcluida = task?.status === "Concluído" || task?.status === "Concluído em Atraso";
  const evidenceInputRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState({
    competenciaYm: task?.competenciaYm || initialData?.competenciaYm || currentYearMonth(),
    recorrencia: task?.recorrencia || initialData?.recorrencia || "",
    tipo: task?.tipo || initialData?.tipo || "",
    atividade: task?.atividade || initialData?.atividade || "",
    responsavelEmail: task?.responsavelEmail || initialData?.responsavelEmail || (user?.role === "USER" ? user.email : ""),
    prazo: task?.prazo || initialData?.prazo || "",
    realizado: task?.realizado || initialData?.realizado || "",
    observacoes: task?.observacoes || initialData?.observacoes || "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [evidences, setEvidences] = useState<TaskEvidence[]>(task?.evidences || []);
  const [selectedEvidence, setSelectedEvidence] = useState<File | null>(null);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [deleteEvidenceTarget, setDeleteEvidenceTarget] = useState<TaskEvidence | null>(null);
  const [deletingEvidence, setDeletingEvidence] = useState(false);
  const [pendingCompletePayload, setPendingCompletePayload] = useState<Partial<Task> | null>(null);
  const [subAtividade, setSubAtividade] = useState("");
  const [subResponsavelEmail, setSubResponsavelEmail] = useState("");
  const [addingSubtask, setAddingSubtask] = useState(false);

  useEffect(() => {
    if (!open) setPendingCompletePayload(null);
  }, [open]);

  useEffect(() => {
    if (open) {
      setForm({
        competenciaYm: task?.competenciaYm || initialData?.competenciaYm || currentYearMonth(),
        recorrencia: task?.recorrencia || initialData?.recorrencia || "",
        tipo: task?.tipo || initialData?.tipo || "",
        atividade: task?.atividade || initialData?.atividade || "",
        responsavelEmail: task?.responsavelEmail || initialData?.responsavelEmail || (user?.role === "USER" ? user.email : ""),
        prazo: task?.prazo || initialData?.prazo || "",
        realizado: task?.realizado || initialData?.realizado || "",
        observacoes: task?.observacoes || initialData?.observacoes || "",
      });
      setErrors({});
      setSelectedEvidence(null);
      setEvidences(task?.evidences || []);
      setSubAtividade("");
      setSubResponsavelEmail("");
    }
  }, [open, task, user, initialData]);

  useEffect(() => {
    const loadEvidences = async () => {
      if (!open || !task?.id) return;
      try {
        const { evidences: list } = await tasksApi.listEvidences(task.id);
        setEvidences(list);
      } catch {
        // Keep UI resilient; task editing should still work if evidence loading fails.
      }
    };
    loadEvidences();
  }, [open, task?.id]);

  const set = (field: string, value: string) => {
    setForm(f => ({ ...f, [field]: value }));
    if (errors[field]) setErrors(e => ({ ...e, [field]: "" }));
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (isUserOnlyObservacoes) {
      if (form.observacoes.length > 1000) errs.observacoes = "Máximo 1000 caracteres";
    } else {
      if (!form.competenciaYm) errs.competenciaYm = "Competência é obrigatória";
      if (!form.recorrencia) errs.recorrencia = "Recorrência é obrigatória";
      if (!form.tipo) errs.tipo = "Tipo é obrigatório";
      if (!form.atividade.trim()) errs.atividade = "Descrição da atividade é obrigatória";
      if (form.atividade.length > 200) errs.atividade = "Máximo 200 caracteres";
      if (user?.role !== "USER" && !form.responsavelEmail) errs.responsavelEmail = "Responsável é obrigatório";
      if (form.observacoes.length > 1000) errs.observacoes = "Máximo 1000 caracteres";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    // USER em edição só envia observações (backend ignora o resto)
    const payload: Partial<Task> = isUserOnlyObservacoes
      ? { observacoes: form.observacoes }
      : {
          ...form,
          responsavelEmail: user?.role === "USER" ? user.email : form.responsavelEmail,
        };

    const vaiConcluir = isEdit && !taskConcluida && !isUserOnlyObservacoes && !!String(payload.realizado ?? "").trim();
    if (vaiConcluir) {
      setPendingCompletePayload(payload);
      return;
    }

    const saved = await onSave(payload);
    if (saved?.evidences) {
      setEvidences(saved.evidences);
      onTaskChange?.(saved);
    }
  };

  const handleConfirmComplete = async () => {
    if (!pendingCompletePayload) return;
    const payload = pendingCompletePayload;
    setPendingCompletePayload(null);
    const saved = await onSave(payload);
    if (saved?.evidences) {
      setEvidences(saved.evidences);
      onTaskChange?.(saved);
    }
  };

  const handleUploadEvidence = async () => {
    if (!task?.id) {
      toast("Salve a tarefa antes de anexar evidências.", "warning");
      return;
    }
    if (!selectedEvidence) {
      toast("Selecione um arquivo para anexar.", "warning");
      return;
    }
    if (selectedEvidence.size > MAX_EVIDENCE_SIZE) {
      toast("Arquivo excede 10MB.", "warning");
      return;
    }

    setUploadingEvidence(true);
    try {
      const contentBase64 = await fileToBase64(selectedEvidence);
      const { task: updatedTask } = await tasksApi.uploadEvidence(task.id, {
        fileName: selectedEvidence.name,
        mimeType: selectedEvidence.type || "application/octet-stream",
        contentBase64,
      });

      setEvidences(updatedTask.evidences || []);
      onTaskChange?.(updatedTask);
      setSelectedEvidence(null);
      if (evidenceInputRef.current) evidenceInputRef.current.value = "";
      toast("Evidência anexada com sucesso.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao anexar evidência", "error");
    } finally {
      setUploadingEvidence(false);
    }
  };

  const handleDeleteEvidence = async () => {
    if (!task?.id || !deleteEvidenceTarget) return;

    setDeletingEvidence(true);
    try {
      const { task: updatedTask } = await tasksApi.deleteEvidence(task.id, deleteEvidenceTarget.id);
      setEvidences(updatedTask.evidences || []);
      onTaskChange?.(updatedTask);
      toast("Evidência removida.", "success");
      setDeleteEvidenceTarget(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao remover evidência", "error");
    } finally {
      setDeletingEvidence(false);
    }
  };

  const selectableUsers = user?.role === "LEADER" ? users.filter(u => u.area === user.area) : users;

  const allRecorrencias = lookups.RECORRENCIA || [];
  const recorrenciaOptions = (allowedRecorrencias && allowedRecorrencias.length > 0
    ? allRecorrencias.filter(r => allowedRecorrencias.includes(r))
    : allRecorrencias
  ).map(v => ({ value: v, label: v }));
  const tipoOptions = (lookups.TIPO || []).map(v => ({ value: v, label: v }));
  const userOptions = selectableUsers.map(u => ({ value: u.email, label: `${u.nome} (${u.area})` }));

  const ymOptions = Array.from({ length: 13 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6 + i);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return { value: ym, label };
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar Tarefa" : "Nova Tarefa"}
      size="lg"
      footer={
        <>
          {isEdit && task?.status && (
            <div className="flex-1">
              <Badge variant={getStatusVariant(task.status)}>{task.status}</Badge>
            </div>
          )}
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} loading={loading}>
            {isEdit ? "Salvar alterações" : "Criar tarefa"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {isUserOnlyObservacoes && (
          <p className="text-sm text-slate-600 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2">
            Como usuário, você só pode editar as <strong>Observações</strong> desta tarefa. Para marcar como concluída, use o ícone ✓ na lista.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Competência"
            required
            value={form.competenciaYm}
            onChange={e => set("competenciaYm", e.target.value)}
            options={ymOptions}
            error={errors.competenciaYm}
            disabled={isUserOnlyObservacoes}
          />

          <Select
            label="Recorrência"
            required
            value={form.recorrencia}
            onChange={e => set("recorrencia", e.target.value)}
            options={recorrenciaOptions}
            placeholder="Selecione..."
            error={errors.recorrencia}
            disabled={isUserOnlyObservacoes}
          />

          <Select
            label="Tipo"
            required
            value={form.tipo}
            onChange={e => set("tipo", e.target.value)}
            options={tipoOptions}
            placeholder="Selecione..."
            error={errors.tipo}
            disabled={isUserOnlyObservacoes}
          />

          {user?.role !== "USER" ? (
            <Select
              label="Responsável"
              required
              value={form.responsavelEmail}
              onChange={e => set("responsavelEmail", e.target.value)}
              options={userOptions}
              placeholder="Selecione..."
              error={errors.responsavelEmail}
            />
          ) : (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">Responsável</label>
              <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-sm text-slate-700">
                {user.nome} <span className="text-slate-500">(você)</span>
              </div>
            </div>
          )}
        </div>

        <Textarea
          label="Descrição da atividade"
          required
          value={form.atividade}
          onChange={e => set("atividade", e.target.value)}
          placeholder="Descreva a atividade..."
          rows={3}
          error={errors.atividade}
          hint={!isUserOnlyObservacoes ? `${form.atividade.length}/200 caracteres` : undefined}
          disabled={isUserOnlyObservacoes}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Prazo" type="date" value={form.prazo} onChange={e => set("prazo", e.target.value)} disabled={isUserOnlyObservacoes} />
          <Input
            label="Data realizado"
            type="date"
            value={form.realizado}
            onChange={e => set("realizado", e.target.value)}
            hint={form.realizado && !isUserOnlyObservacoes ? "Status será recalculado automaticamente" : undefined}
            disabled={isUserOnlyObservacoes}
          />
        </div>

        <Textarea
          label="Observações"
          value={form.observacoes}
          onChange={e => set("observacoes", e.target.value)}
          placeholder="Observações opcionais..."
          rows={2}
          error={errors.observacoes}
          hint={form.observacoes ? `${form.observacoes.length}/1000 caracteres` : undefined}
        />

        {isEdit && !task?.parentTaskId && (user?.role === "LEADER" || user?.role === "ADMIN") && (
          <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Layers size={16} className="text-violet-600" />
              Sub tarefas
            </div>
            <p className="text-xs text-slate-600">
              A tarefa principal só será concluída quando você marcar como concluída <strong>e</strong> todas as sub tarefas estiverem concluídas pelos envolvidos.
            </p>
            {(task?.subtasks?.length ?? 0) > 0 && (
              <ul className="space-y-2">
                {task?.subtasks?.map(st => (
                  <li
                    key={st.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-violet-100 bg-white px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-800 truncate">{st.atividade}</p>
                      <p className="text-xs text-slate-500">
                        {st.responsavelNome} · <Badge variant={getStatusVariant(st.status)} size="sm" className="inline">{st.status}</Badge>
                      </p>
                    </div>
                    <span className="text-xs text-slate-400 shrink-0">Na lista do envolvido</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="Descrição da sub tarefa"
                value={subAtividade}
                onChange={e => setSubAtividade(e.target.value)}
                className="flex-1"
              />
              <Select
                value={subResponsavelEmail}
                onChange={e => setSubResponsavelEmail(e.target.value)}
                options={userOptions}
                placeholder="Envolvido"
                className="sm:w-48"
              />
              <Button
                type="button"
                variant="primary"
                size="sm"
                icon={<Plus size={14} />}
                loading={addingSubtask}
                disabled={!subAtividade.trim() || !subResponsavelEmail}
                onClick={async () => {
                  if (!task?.id || !subAtividade.trim() || !subResponsavelEmail) return;
                  setAddingSubtask(true);
                  try {
                    const { task: created } = await tasksApi.create({
                      parentTaskId: task.id,
                      atividade: subAtividade.trim(),
                      responsavelEmail: subResponsavelEmail,
                    });
                    onSubtaskCreated?.(created);
                    setSubAtividade("");
                    setSubResponsavelEmail("");
                    toast("Sub tarefa criada. Ela aparecerá na lista do envolvido.", "success");
                  } catch (err) {
                    toast(err instanceof Error ? err.message : "Erro ao criar sub tarefa", "error");
                  } finally {
                    setAddingSubtask(false);
                  }
                }}
              >
                Adicionar
              </Button>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Paperclip size={16} />
            Evidências
          </div>

          {!isEdit && (
            <p className="text-xs text-slate-500">Salve a tarefa para habilitar anexos de evidências.</p>
          )}

          {isEdit && (
            <>
              {taskConcluida && (
                <p className="text-xs text-amber-700">Atividade concluída. Não é possível anexar novas evidências.</p>
              )}
              {!taskConcluida && (
                <>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      ref={evidenceInputRef}
                      type="file"
                      className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-900 hover:file:bg-brand-200"
                      onChange={e => setSelectedEvidence(e.target.files?.[0] || null)}
                    />
                    <Button
                      type="button"
                      onClick={handleUploadEvidence}
                      loading={uploadingEvidence}
                      icon={<Upload size={14} />}
                      className="sm:w-auto w-full"
                    >
                      Anexar
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">Formatos livres, tamanho máximo de 10MB por arquivo.</p>
                </>
              )}

              <div className="space-y-2">
                {evidences.length === 0 && <p className="text-xs text-slate-500">Nenhuma evidência anexada.</p>}
                {evidences.map(evidence => {
                  const isImage = /^image\/(jpeg|png|gif|webp)$/i.test(evidence.mimeType || "");
                  const tenantParam = tenant?.slug ? `&tenant=${encodeURIComponent(tenant.slug)}` : "";
                  const viewUrl = `${evidence.downloadUrl}?inline=1${tenantParam}`;
                  const downloadUrl = `${evidence.downloadUrl}${tenant?.slug ? `?tenant=${encodeURIComponent(tenant.slug)}` : ""}`;
                  return (
                    <div
                      key={evidence.id}
                      className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
                    >
                      {isImage ? (
                        <a
                          href={viewUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-shrink-0 rounded-lg border border-slate-200 overflow-hidden bg-slate-100 h-14 w-14 flex items-center justify-center"
                          title="Abrir em nova guia"
                        >
                          <img
                            src={viewUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </a>
                      ) : (
                        <div className="h-14 w-14 flex-shrink-0 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center">
                          <FileText size={24} className="text-slate-400" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-800 truncate">{evidence.fileName}</p>
                        <p className="text-xs text-slate-500">
                          {formatBytes(evidence.fileSize)} · {new Date(evidence.uploadedAt).toLocaleString("pt-BR")}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <a href={viewUrl} target="_blank" rel="noreferrer" title="Abrir em nova guia">
                          <Button type="button" variant="ghost" size="sm" aria-label={`Abrir: ${evidence.fileName}`}>
                            <ExternalLink size={14} />
                          </Button>
                        </a>
                        <a href={downloadUrl} download={evidence.fileName} title="Baixar">
                          <Button type="button" variant="ghost" size="sm" aria-label={`Baixar: ${evidence.fileName}`}>
                            <Download size={14} />
                          </Button>
                        </a>
                        {!isUserOnlyObservacoes && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Remover evidência: ${evidence.fileName}`}
                            title="Remover"
                            onClick={() => setDeleteEvidenceTarget(evidence)}
                            className="hover:text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {isEdit && task && (
          <div className="pt-2 border-t border-slate-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-500">
              <span>
                Criado por: <span className="text-slate-700">{task.createdBy}</span>
              </span>
              <span>
                Em: <span className="text-slate-700">{new Date(task.createdAt).toLocaleDateString("pt-BR")}</span>
              </span>
              {task.updatedBy && (
                <>
                  <span>
                    Editado por: <span className="text-slate-700">{task.updatedBy}</span>
                  </span>
                  <span>
                    Em: <span className="text-slate-700">{new Date(task.updatedAt).toLocaleDateString("pt-BR")}</span>
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteEvidenceTarget}
        title="Remover evidência"
        message={`Deseja remover a evidência "${deleteEvidenceTarget?.fileName}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Remover"
        variant="danger"
        loading={deletingEvidence}
        onConfirm={handleDeleteEvidence}
        onCancel={() => setDeleteEvidenceTarget(null)}
      />

      <ConfirmDialog
        open={!!pendingCompletePayload}
        title="Marcar como concluída"
        message="Deseja marcar esta tarefa como concluída? A data de realização será registrada."
        confirmLabel="Concluir e salvar"
        variant="primary"
        loading={loading}
        onConfirm={handleConfirmComplete}
        onCancel={() => setPendingCompletePayload(null)}
      />
    </Modal>
  );
}
