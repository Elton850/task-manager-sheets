import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  FileText,
  RefreshCw,
  CheckCircle,
  XCircle,
  Lock,
  Unlock,
  Eye,
  MessageSquare,
  Paperclip,
  X,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { justificationsApi, type PendingJustificationItem, type ApprovedJustificationItem } from "@/services/api";
import type {
  JustificationMineItem,
  JustificationStatus,
  TaskJustification,
} from "@/types";

const MAX_EVIDENCE_SIZE = 10 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const idx = result.indexOf("base64,");
      resolve(idx >= 0 ? result.slice(idx + 7) : result);
    };
    reader.onerror = () => reject(new Error("Falha ao ler arquivo."));
    reader.readAsDataURL(file);
  });
}

function getYmOptions() {
  const options: { value: string; label: string }[] = [];
  for (let i = -12; i <= 3; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() + i);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
    options.push({ value: ym, label });
  }
  return options;
}

const JUSTIFICATION_STATUS_LABELS: Record<JustificationStatus, string> = {
  none: "Sem justificativa",
  pending: "Em aprovação",
  approved: "Aprovada",
  refused: "Recusada",
  blocked: "Bloqueada",
};

export default function JustificationsPage() {
  const { user, tenant } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<JustificationMineItem[]>([]);
  const [competenciaYm, setCompetenciaYm] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [modalJustifyOpen, setModalJustifyOpen] = useState(false);
  const [modalViewOpen, setModalViewOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<JustificationMineItem | null>(null);
  const [justifyDescription, setJustifyDescription] = useState("");
  const [justifyFile, setJustifyFile] = useState<File | null>(null);
  const [justifySaving, setJustifySaving] = useState(false);
  const justifyFileInputRef = useRef<HTMLInputElement | null>(null);

  const [pendingItems, setPendingItems] = useState<PendingJustificationItem[]>([]);
  const [approvedItems, setApprovedItems] = useState<ApprovedJustificationItem[]>([]);
  const [blockedItems, setBlockedItems] = useState<
    { taskId: string; atividade: string; responsavelNome: string; area: string; blockedAt: string | null; blockedBy: string | null }[]
  >([]);
  const [leaderTab, setLeaderTab] = useState<"pending" | "approved" | "blocked">("pending");
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<{ id: string; atividade: string } | null>(null);
  const [reviewAction, setReviewAction] = useState<"refuse" | "refuse_and_block">("refuse");
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [confirmReviewSubmit, setConfirmReviewSubmit] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [viewJustificationDetail, setViewJustificationDetail] = useState<TaskJustification | null>(null);

  const [confirmApprove, setConfirmApprove] = useState<{ open: boolean; id: string | null; atividade: string }>({ open: false, id: null, atividade: "" });
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [confirmUnblock, setConfirmUnblock] = useState<{ open: boolean; taskId: string | null; atividade: string }>({ open: false, taskId: null, atividade: "" });

  const loadUser = useCallback(async () => {
    setLoading(true);
    try {
      const res = await justificationsApi.mine(competenciaYm || undefined);
      setItems(res.items);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao carregar justificativas", "error");
    } finally {
      setLoading(false);
    }
  }, [competenciaYm, toast]);

  const loadLeader = useCallback(async () => {
    setLoading(true);
    try {
      const [pendingRes, approvedRes, blockedRes] = await Promise.all([
        justificationsApi.pending(),
        justificationsApi.approved(),
        justificationsApi.blocked(),
      ]);
      setPendingItems(pendingRes.items);
      setApprovedItems(approvedRes.items);
      setBlockedItems(blockedRes.items);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao carregar solicitações", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!user) return;
    if (user.role === "USER") loadUser();
    else loadLeader();
  }, [user, user?.role, loadUser, loadLeader]);

  const handleOpenJustify = (item: JustificationMineItem) => {
    setSelectedItem(item);
    setJustifyDescription("");
    setJustifyFile(null);
    if (justifyFileInputRef.current) justifyFileInputRef.current.value = "";
    setModalJustifyOpen(true);
  };

  const handleSubmitJustify = async () => {
    if (!selectedItem || !justifyDescription.trim()) {
      toast("Informe a descrição da justificativa.", "error");
      return;
    }
    setJustifySaving(true);
    try {
      const { justification } = await justificationsApi.create({
        taskId: selectedItem.task.id,
        description: justifyDescription.trim(),
      });
      if (justifyFile && justification) {
        const base64 = await fileToBase64(justifyFile);
        await justificationsApi.uploadEvidence(justification.id, {
          fileName: justifyFile.name,
          mimeType: justifyFile.type || "application/octet-stream",
          contentBase64: base64,
        });
      }
      toast("Justificativa enviada com sucesso.", "success");
      setModalJustifyOpen(false);
      setSelectedItem(null);
      loadUser();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao enviar justificativa", "error");
    } finally {
      setJustifySaving(false);
    }
  };

  const handleOpenView = async (item: JustificationMineItem) => {
    if (!item.justification) return;
    setSelectedItem(item);
    try {
      const res = await justificationsApi.get(item.justification.id);
      setViewJustificationDetail(res.justification);
      setModalViewOpen(true);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao carregar justificativa", "error");
    }
  };

  const handleApproveClick = (row: PendingJustificationItem) => {
    setConfirmApprove({ open: true, id: row.id, atividade: row.task.atividade });
  };

  const handleApproveConfirm = async () => {
    if (!confirmApprove.id) return;
    setApprovingId(confirmApprove.id);
    try {
      await justificationsApi.review(confirmApprove.id, "approve");
      toast("Justificativa aprovada.", "success");
      setConfirmApprove({ open: false, id: null, atividade: "" });
      loadLeader();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao aprovar", "error");
    } finally {
      setApprovingId(null);
    }
  };

  const openReviewModal = (id: string, atividade: string, action: "refuse" | "refuse_and_block") => {
    setReviewTarget({ id, atividade });
    setReviewAction(action);
    setReviewComment("");
    setReviewModalOpen(true);
  };

  const handleReviewSubmitConfirm = async () => {
    if (!reviewTarget) return;
    setConfirmReviewSubmit(false);
    setReviewSaving(true);
    try {
      await justificationsApi.review(reviewTarget.id, reviewAction, reviewComment.trim() || undefined);
      toast(reviewAction === "refuse_and_block" ? "Justificativa recusada e tarefa bloqueada." : "Justificativa recusada.", "success");
      setReviewModalOpen(false);
      setReviewTarget(null);
      loadLeader();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao processar", "error");
    } finally {
      setReviewSaving(false);
    }
  };

  const handleUnblockClick = (taskId: string, atividade: string) => {
    setConfirmUnblock({ open: true, taskId, atividade });
  };

  const handleUnblockConfirm = async () => {
    if (!confirmUnblock.taskId) return;
    setUnblockingId(confirmUnblock.taskId);
    try {
      await justificationsApi.unblockTask(confirmUnblock.taskId);
      toast("Justificativa habilitada novamente para esta tarefa.", "success");
      setConfirmUnblock({ open: false, taskId: null, atividade: "" });
      loadLeader();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao habilitar", "error");
    } finally {
      setUnblockingId(null);
    }
  };

  const isLeader = user?.role === "LEADER" || user?.role === "ADMIN";

  if (user?.role === "USER") {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Justificativas</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Atividades concluídas em atraso: visualize e envie justificativas.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600 whitespace-nowrap">Período:</label>
            <select
              value={competenciaYm}
              onChange={e => setCompetenciaYm(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            >
              <option value="">Todos</option>
              {getYmOptions().map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <Button variant="secondary" size="sm" onClick={loadUser} disabled={loading}>
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              Atualizar
            </Button>
          </div>
        </div>

        <Card>
          {loading ? (
            <div className="py-16 text-center text-slate-500">Carregando...</div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center">
              <FileText className="mx-auto h-12 w-12 text-slate-300" />
              <p className="mt-3 text-slate-600 font-medium">Nenhuma atividade concluída em atraso</p>
              <p className="text-sm text-slate-500 mt-1">Altere o período ou não há tarefas concluídas em atraso no período escolhido.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    <th className="pb-3 pr-4">Atividade</th>
                    <th className="pb-3 pr-4 whitespace-nowrap">Prazo</th>
                    <th className="pb-3 pr-4 whitespace-nowrap">Realizado</th>
                    <th className="pb-3 pr-4 whitespace-nowrap">Status justificativa</th>
                    <th className="pb-3 pr-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map(item => (
                    <tr key={item.task.id} className="hover:bg-slate-50/70">
                      <td className="py-3 pr-4 font-medium text-slate-800">{item.task.atividade}</td>
                      <td className="py-3 pr-4 text-slate-600">
                        {item.task.prazo ? new Date(item.task.prazo + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                      </td>
                      <td className="py-3 pr-4 text-slate-600">
                        {item.task.realizado ? new Date(item.task.realizado + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            item.justificationStatus === "approved"
                              ? "bg-emerald-100 text-emerald-800"
                              : item.justificationStatus === "pending"
                                ? "bg-amber-100 text-amber-800"
                                : item.justificationStatus === "refused"
                                  ? "bg-rose-100 text-rose-800"
                                  : item.justificationStatus === "blocked"
                                    ? "bg-slate-200 text-slate-700"
                                    : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {JUSTIFICATION_STATUS_LABELS[item.justificationStatus]}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right">
                        {item.justificationStatus === "blocked" ? (
                          <span className="text-xs text-slate-500">Bloqueada</span>
                        ) : item.justificationStatus === "none" || item.justificationStatus === "refused" ? (
                          <Button variant="secondary" size="sm" onClick={() => handleOpenJustify(item)}>
                            <MessageSquare size={14} />
                            Justificar
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => handleOpenView(item)}>
                            <Eye size={14} />
                            Ver
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Modal Justificar */}
        {modalJustifyOpen && selectedItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50" onClick={() => !justifySaving && setModalJustifyOpen(false)}>
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">Justificar atividade</h3>
                <button type="button" onClick={() => !justifySaving && setModalJustifyOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500">
                  <X size={20} />
                </button>
              </div>
              <p className="text-sm text-slate-600">{selectedItem.task.atividade}</p>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Descrição *</label>
                <textarea
                  value={justifyDescription}
                  onChange={e => setJustifyDescription(e.target.value)}
                  placeholder="Motivo pelo qual a atividade não foi concluída no prazo..."
                  rows={4}
                  maxLength={2000}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
                <p className="text-xs text-slate-500 mt-1">{justifyDescription.length}/2000</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Evidência (opcional)</label>
                <input
                  ref={justifyFileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) {
                      if (f.size > MAX_EVIDENCE_SIZE) {
                        toast(`Arquivo deve ter no máximo ${formatBytes(MAX_EVIDENCE_SIZE)}.`, "error");
                        return;
                      }
                      setJustifyFile(f);
                    }
                  }}
                  className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-800"
                />
                {justifyFile && (
                  <p className="mt-1 text-xs text-slate-600 flex items-center gap-1">
                    <Paperclip size={12} />
                    {justifyFile.name} ({formatBytes(justifyFile.size)})
                    <button type="button" onClick={() => { setJustifyFile(null); if (justifyFileInputRef.current) justifyFileInputRef.current.value = ""; }} className="text-rose-600 hover:underline ml-1">
                      Remover
                    </button>
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => !justifySaving && setModalJustifyOpen(false)}>Cancelar</Button>
                <Button onClick={handleSubmitJustify} disabled={justifySaving || !justifyDescription.trim()}>
                  {justifySaving ? "Enviando..." : "Enviar justificativa"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Ver justificativa */}
        {modalViewOpen && viewJustificationDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50" onClick={() => setModalViewOpen(false)}>
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">Justificativa</h3>
                <button type="button" onClick={() => setModalViewOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500">
                  <X size={20} />
                </button>
              </div>
              {viewJustificationDetail.task && (
                <p className="text-sm text-slate-600">{viewJustificationDetail.task.atividade}</p>
              )}
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Descrição</p>
                <p className="text-sm text-slate-800 whitespace-pre-wrap">{viewJustificationDetail.description}</p>
              </div>
              {viewJustificationDetail.reviewComment && (
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Comentário da análise</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{viewJustificationDetail.reviewComment}</p>
                </div>
              )}
              {viewJustificationDetail.evidences && viewJustificationDetail.evidences.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Evidência</p>
                  <ul className="space-y-2">
                    {viewJustificationDetail.evidences.map(ev => {
                      const downloadUrl = `${ev.downloadUrl}${tenant?.slug ? `?tenant=${encodeURIComponent(tenant.slug)}` : ""}`;
                      return (
                        <li key={ev.id} className="flex items-center gap-2 text-sm">
                          <a href={downloadUrl} download={ev.fileName} className="text-brand-600 hover:underline flex items-center gap-1">
                            <Paperclip size={14} />
                            {ev.fileName}
                          </a>
                          <span className="text-slate-500">({formatBytes(ev.fileSize)})</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              <div className="flex justify-end pt-2">
                <Button variant="secondary" onClick={() => setModalViewOpen(false)}>Fechar</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (isLeader) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Justificativas</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Aprovar, recusar ou bloquear solicitações de justificativas da sua área.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={loadLeader} disabled={loading}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Atualizar
          </Button>
        </div>

        <div className="flex gap-2 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setLeaderTab("pending")}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              leaderTab === "pending" ? "bg-white border border-slate-200 border-b-0 text-brand-700 -mb-px" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Pendentes ({pendingItems.length})
          </button>
          <button
            type="button"
            onClick={() => setLeaderTab("approved")}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              leaderTab === "approved" ? "bg-white border border-slate-200 border-b-0 text-brand-700 -mb-px" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Aprovadas ({approvedItems.length})
          </button>
          <button
            type="button"
            onClick={() => setLeaderTab("blocked")}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              leaderTab === "blocked" ? "bg-white border border-slate-200 border-b-0 text-brand-700 -mb-px" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Bloqueadas ({blockedItems.length})
          </button>
        </div>

        <Card>
          {loading ? (
            <div className="py-16 text-center text-slate-500">Carregando...</div>
          ) : leaderTab === "pending" ? (
            pendingItems.length === 0 ? (
              <div className="py-16 text-center">
                <CheckCircle className="mx-auto h-12 w-12 text-slate-300" />
                <p className="mt-3 text-slate-600 font-medium">Nenhuma solicitação pendente</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      <th className="pb-3 pr-4">Atividade</th>
                      <th className="pb-3 pr-4">Responsável</th>
                      <th className="pb-3 pr-4 whitespace-nowrap">Prazo / Realizado</th>
                      <th className="pb-3 pr-4">Data justificativa</th>
                      <th className="pb-3 pr-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pendingItems.map(row => (
                      <tr key={row.id} className="hover:bg-slate-50/70">
                        <td className="py-3 pr-4">
                          <p className="font-medium text-slate-800">{row.task.atividade}</p>
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{row.description}</p>
                        </td>
                        <td className="py-3 pr-4 text-slate-600">{row.task.responsavelNome}</td>
                        <td className="py-3 pr-4 text-slate-600 whitespace-nowrap">
                          {row.task.prazo ? new Date(row.task.prazo + "T00:00:00").toLocaleDateString("pt-BR") : "—"} /{" "}
                          {row.task.realizado ? new Date(row.task.realizado + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                        </td>
                        <td className="py-3 pr-4 text-slate-600">
                          {new Date(row.createdAt).toLocaleString("pt-BR")}
                        </td>
                        <td className="py-3 pr-4 text-right">
                          <div className="flex items-center justify-end gap-1 flex-wrap">
                            <Button variant="secondary" size="sm" onClick={() => handleApproveClick(row)} className="text-emerald-700 hover:bg-emerald-50">
                              <CheckCircle size={14} />
                              Aprovar
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => openReviewModal(row.id, row.task.atividade, "refuse")} className="text-rose-600 hover:bg-rose-50">
                              <XCircle size={14} />
                              Recusar
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => openReviewModal(row.id, row.task.atividade, "refuse_and_block")} className="text-slate-700 hover:bg-slate-100">
                              <Lock size={14} />
                              Recusar e bloquear
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : leaderTab === "approved" ? (
            approvedItems.length === 0 ? (
              <div className="py-16 text-center">
                <CheckCircle className="mx-auto h-12 w-12 text-slate-300" />
                <p className="mt-3 text-slate-600 font-medium">Nenhuma justificativa aprovada</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      <th className="pb-3 pr-4">Atividade</th>
                      <th className="pb-3 pr-4">Responsável</th>
                      <th className="pb-3 pr-4 whitespace-nowrap">Prazo / Realizado</th>
                      <th className="pb-3 pr-4">Data justificativa</th>
                      <th className="pb-3 pr-4">Aprovada em</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {approvedItems.map(row => (
                      <tr key={row.id} className="hover:bg-slate-50/70">
                        <td className="py-3 pr-4">
                          <p className="font-medium text-slate-800">{row.task.atividade}</p>
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{row.description}</p>
                        </td>
                        <td className="py-3 pr-4 text-slate-600">{row.task.responsavelNome}</td>
                        <td className="py-3 pr-4 text-slate-600 whitespace-nowrap">
                          {row.task.prazo ? new Date(row.task.prazo + "T00:00:00").toLocaleDateString("pt-BR") : "—"} /{" "}
                          {row.task.realizado ? new Date(row.task.realizado + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                        </td>
                        <td className="py-3 pr-4 text-slate-600">
                          {new Date(row.createdAt).toLocaleString("pt-BR")}
                        </td>
                        <td className="py-3 pr-4 text-slate-600">
                          {row.reviewedAt ? new Date(row.reviewedAt).toLocaleString("pt-BR") : "—"}
                          {row.reviewedBy && <span className="text-slate-500 text-xs block">por {row.reviewedBy}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            blockedItems.length === 0 ? (
              <div className="py-16 text-center">
                <Unlock className="mx-auto h-12 w-12 text-slate-300" />
                <p className="mt-3 text-slate-600 font-medium">Nenhuma tarefa bloqueada</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      <th className="pb-3 pr-4">Atividade</th>
                      <th className="pb-3 pr-4">Responsável</th>
                      <th className="pb-3 pr-4">Área</th>
                      <th className="pb-3 pr-4">Bloqueada em</th>
                      <th className="pb-3 pr-4 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {blockedItems.map(row => (
                      <tr key={row.taskId} className="hover:bg-slate-50/70">
                        <td className="py-3 pr-4 font-medium text-slate-800">{row.atividade}</td>
                        <td className="py-3 pr-4 text-slate-600">{row.responsavelNome}</td>
                        <td className="py-3 pr-4 text-slate-600">{row.area}</td>
                        <td className="py-3 pr-4 text-slate-600">
                          {row.blockedAt ? new Date(row.blockedAt).toLocaleString("pt-BR") : "—"}
                          {row.blockedBy && <span className="text-slate-500 text-xs block">por {row.blockedBy}</span>}
                        </td>
                        <td className="py-3 pr-4 text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleUnblockClick(row.taskId, row.atividade)}
                            disabled={unblockingId === row.taskId}
                            className="text-emerald-700 hover:bg-emerald-50"
                          >
                            {unblockingId === row.taskId ? (
                              <span className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin inline-block" />
                            ) : (
                              <>
                                <Unlock size={14} />
                                Habilitar
                              </>
                            )}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </Card>

        {/* Modal Recusar / Recusar e bloquear */}
        {reviewModalOpen && reviewTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50" onClick={() => !reviewSaving && setReviewModalOpen(false)}>
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">
                  {reviewAction === "refuse_and_block" ? "Recusar e bloquear" : "Recusar justificativa"}
                </h3>
                <button type="button" onClick={() => !reviewSaving && setReviewModalOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500">
                  <X size={20} />
                </button>
              </div>
              <p className="text-sm text-slate-600">{reviewTarget.atividade}</p>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Motivo da recusa (opcional)</label>
                <textarea
                  value={reviewComment}
                  onChange={e => setReviewComment(e.target.value)}
                  placeholder="Informe o motivo da recusa..."
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => !reviewSaving && setReviewModalOpen(false)}>Cancelar</Button>
                <Button variant="secondary" onClick={() => setConfirmReviewSubmit(true)} disabled={reviewSaving} className="bg-rose-50 text-rose-700 hover:bg-rose-100">
                  {reviewSaving ? "Processando..." : reviewAction === "refuse_and_block" ? "Recusar e bloquear" : "Recusar"}
                </Button>
              </div>
            </div>
          </div>
        )}

        <ConfirmDialog
          open={confirmApprove.open}
          title="Aprovar justificativa"
          message={`Confirma a aprovação da justificativa da atividade "${confirmApprove.atividade}"?`}
          confirmLabel="Aprovar"
          cancelLabel="Cancelar"
          variant="primary"
          loading={approvingId !== null}
          onConfirm={handleApproveConfirm}
          onCancel={() => !approvingId && setConfirmApprove({ open: false, id: null, atividade: "" })}
        />
        <ConfirmDialog
          open={confirmReviewSubmit}
          title={reviewAction === "refuse_and_block" ? "Recusar e bloquear" : "Recusar justificativa"}
          message={
            reviewAction === "refuse_and_block"
              ? "Confirma a recusa e o bloqueio? O responsável não poderá justificar esta tarefa novamente até você habilitar."
              : "Confirma a recusa desta justificativa? O responsável poderá enviar uma nova justificativa."
          }
          confirmLabel={reviewAction === "refuse_and_block" ? "Recusar e bloquear" : "Recusar"}
          cancelLabel="Voltar"
          variant="danger"
          loading={reviewSaving}
          onConfirm={handleReviewSubmitConfirm}
          onCancel={() => setConfirmReviewSubmit(false)}
        />
        <ConfirmDialog
          open={confirmUnblock.open}
          title="Habilitar justificativa"
          message={`Confirma que deseja habilitar a justificativa da atividade "${confirmUnblock.atividade}"? O responsável poderá enviar uma nova justificativa.`}
          confirmLabel="Habilitar"
          cancelLabel="Cancelar"
          variant="primary"
          loading={unblockingId !== null}
          onConfirm={handleUnblockConfirm}
          onCancel={() => !unblockingId && setConfirmUnblock({ open: false, taskId: null, atividade: "" })}
        />
      </div>
    );
  }

  return null;
}
