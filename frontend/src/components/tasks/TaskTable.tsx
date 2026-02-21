import React, { useMemo } from "react";
import { Edit2, Trash2, Copy, ChevronUp, ChevronDown, Paperclip, CheckCircle, Info, Layers } from "lucide-react";
import Badge, { getStatusVariant } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useAuth } from "@/contexts/AuthContext";
import type { Task } from "@/types";

type SortField = "competenciaYm" | "prazo" | "status" | "area" | "responsavelNome" | "recorrencia";

interface TaskTableProps {
  tasks: Task[];
  loading: boolean;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onDuplicate?: (task: Task) => void;
  onMarkComplete?: (task: Task) => void;
}

function TaskTableInner({ tasks, loading, onEdit, onDelete, onDuplicate, onMarkComplete }: TaskTableProps) {
  const { user } = useAuth();
  const [sortField, setSortField] = React.useState<SortField>("competenciaYm");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");
  const [markingId, setMarkingId] = React.useState<string | null>(null);

  const handleSort = (field: SortField) => {
    if (field === sortField) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const sorted = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const va = a[sortField] || "";
      const vb = b[sortField] || "";
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [tasks, sortField, sortDir]);

  const SortIcon = ({ field }: { field: SortField }) => (
    <span className="inline-flex flex-col ml-1 opacity-50">
      {sortField === field ? (
        sortDir === "asc" ? (
          <ChevronUp size={12} className="opacity-100 text-brand-700" />
        ) : (
          <ChevronDown size={12} className="opacity-100 text-brand-700" />
        )
      ) : (
        <ChevronUp size={10} />
      )}
    </span>
  );

  const ThSortable = ({ field, label, className = "" }: { field: SortField; label: string; className?: string }) => (
    <th
      onClick={() => handleSort(field)}
      className={`px-4 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:text-slate-900 hover:bg-slate-100/80 transition-colors select-none focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:ring-inset rounded-t ${className}`}
    >
      <span className="inline-flex items-center">
        {label}
        <SortIcon field={field} />
      </span>
    </th>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSpinner text="Carregando tarefas..." />
      </div>
    );
  }

  if (!sorted.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4 text-3xl">
          📋
        </div>
        <p className="text-base font-semibold text-slate-700">Nenhuma tarefa encontrada</p>
        <p className="text-sm text-slate-500 mt-1 max-w-xs">Ajuste os filtros ou crie uma nova tarefa para começar.</p>
      </div>
    );
  }

  const canDuplicate = user?.role === "ADMIN" || user?.role === "LEADER";

  const canMarkComplete = (task: Task) =>
    user && (task.responsavelEmail?.toLowerCase() === user.email?.toLowerCase()) &&
    (task.status === "Em Andamento" || task.status === "Em Atraso") &&
    onMarkComplete;

  const handleMarkComplete = async (task: Task) => {
    if (!onMarkComplete) return;
    setMarkingId(task.id);
    try {
      await onMarkComplete(task);
    } finally {
      setMarkingId(null);
    }
  };

  return (
    <div className="overflow-x-auto overflow-y-hidden -mx-4 sm:mx-0 rounded-xl border border-slate-200/80 bg-white shadow-sm touch-pan-x">
      <table className="min-w-full" role="table" aria-label="Lista de tarefas">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/90">
            <ThSortable field="competenciaYm" label="Competência" className="w-0 whitespace-nowrap pl-5 pr-3" />
            <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider min-w-[200px] max-w-[320px]">
              Atividade
            </th>
            <ThSortable field="recorrencia" label="Recorrência" className="hidden md:table-cell w-0 whitespace-nowrap" />
            <ThSortable field="area" label="Área" className="hidden lg:table-cell w-0 whitespace-nowrap" />
            <ThSortable field="responsavelNome" label="Responsável" className="hidden sm:table-cell w-0 whitespace-nowrap" />
            <ThSortable field="prazo" label="Prazo" className="hidden md:table-cell w-0 whitespace-nowrap" />
            <ThSortable field="status" label="Status" className="w-0 whitespace-nowrap text-center" />
            <th className="px-4 py-3.5 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider w-0 whitespace-nowrap pr-5">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map(task => (
            <tr
              key={task.id}
              className="group bg-white hover:bg-slate-50/70 transition-colors duration-150 align-middle focus-within:bg-slate-50/70"
            >
              <td className="pl-5 pr-3 py-4 text-sm text-slate-600 whitespace-nowrap font-mono tabular-nums align-middle border-l-4 border-transparent group-hover:border-slate-200 transition-colors">
                {task.competenciaYm}
              </td>
              <td className="px-4 py-4 align-middle">
                <div className="min-w-0 flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-3 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate flex-1 min-w-0 leading-snug" title={task.atividade}>
                      {task.atividade}
                    </p>
                    <div className="shrink-0 flex items-center gap-1.5">
                      {!task.parentTaskId && (task.subtaskCount ?? 0) > 0 && (
                        <span
                          className="inline-flex items-center gap-1 text-xs text-brand-700 bg-brand-50 border border-brand-200 rounded-md px-1.5 py-0.5 font-medium"
                          title={`${task.subtaskCount} subtarefa(s) vinculada(s)`}
                        >
                          <Layers size={12} />
                          {task.subtaskCount}
                        </span>
                      )}
                      {task.parentTaskId && (
                        <span
                          className="inline-flex items-center gap-1 text-xs text-slate-600 bg-slate-100 border border-slate-200 rounded-md px-1.5 py-0.5 font-medium"
                          title={task.parentTaskAtividade ? `Subtask da tarefa: ${task.parentTaskAtividade}` : "Subtask"}
                        >
                          Subtask
                        </span>
                      )}
                      {!!task.evidences?.length && (
                        <span className="inline-flex items-center gap-1 text-xs text-brand-700 bg-brand-50 border border-brand-100 rounded-full px-2 py-0.5 font-medium" title={`${task.evidences.length} anexo(s)`}>
                          <Paperclip size={12} strokeWidth={2} />
                          {task.evidences.length}
                        </span>
                      )}
                    </div>
                  </div>
                  {task.parentTaskAtividade && (
                    <p className="text-xs text-slate-500 truncate" title={`Tarefa principal: ${task.parentTaskAtividade}`}>
                      <span className="text-slate-400">↳ da tarefa:</span> {task.parentTaskAtividade}
                    </p>
                  )}
                  {task.observacoes && (
                    <p className="text-xs text-slate-500 truncate leading-relaxed" title={task.observacoes}>
                      <span className="text-slate-400 font-medium">Obs.:</span> {task.observacoes}
                    </p>
                  )}
                  <div className="sm:hidden mt-0.5">
                    <span className="text-xs text-slate-600">{task.responsavelNome}</span>
                  </div>
                </div>
              </td>
              <td className="px-4 py-4 text-sm text-slate-600 whitespace-nowrap hidden md:table-cell align-middle">{task.recorrencia}</td>
              <td className="px-4 py-4 text-sm text-slate-600 whitespace-nowrap hidden lg:table-cell align-middle">{task.area}</td>
              <td className="px-4 py-4 text-sm text-slate-700 font-medium whitespace-nowrap hidden sm:table-cell align-middle">{task.responsavelNome}</td>
              <td className="px-4 py-4 text-sm whitespace-nowrap hidden md:table-cell align-middle">
                <div className="flex items-center gap-1.5">
                  {task.prazo ? (
                    <span
                      className={`inline-flex items-center gap-1.5 ${task.status === "Em Atraso" ? "text-rose-600 font-semibold" : "text-slate-700"}`}
                      title={task.prazoModifiedByName || task.prazoModifiedBy ? `Prazo alterado por: ${task.prazoModifiedByName || task.prazoModifiedBy}` : undefined}
                    >
                      {task.status === "Em Atraso" && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" aria-hidden />}
                      {new Date(task.prazo + "T00:00:00").toLocaleDateString("pt-BR")}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                  {(task.prazoModifiedByName || task.prazoModifiedBy) && (
                    <span title={`Prazo modificado por: ${task.prazoModifiedByName || task.prazoModifiedBy}`} className="text-amber-600 cursor-help inline-flex">
                      <Info size={14} />
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-4 whitespace-nowrap align-middle">
                <div className="flex flex-col items-center justify-center gap-1 w-full">
                  <Badge variant={getStatusVariant(task.status)} size="sm">
                    {task.status}
                  </Badge>
                  {task.status === "Concluído em Atraso" && task.justificationStatus && (
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        task.justificationStatus === "approved"
                          ? "bg-emerald-100 text-emerald-700"
                          : task.justificationStatus === "pending"
                            ? "bg-amber-100 text-amber-700"
                            : task.justificationStatus === "refused"
                              ? "bg-rose-100 text-rose-700"
                              : task.justificationStatus === "blocked"
                                ? "bg-slate-200 text-slate-600"
                                : "bg-slate-100 text-slate-600"
                      }`}
                      title="Status da justificativa"
                    >
                      {task.justificationStatus === "none" && "Sem justificativa"}
                      {task.justificationStatus === "pending" && "Em aprovação"}
                      {task.justificationStatus === "approved" && "Justificativa aprovada"}
                      {task.justificationStatus === "refused" && "Justificativa recusada"}
                      {task.justificationStatus === "blocked" && "Justificativa bloqueada"}
                    </span>
                  )}
                  {task.realizado && (
                    <div
                      className="text-xs text-slate-500 flex items-center justify-center gap-1 tabular-nums"
                      title={task.realizadoPorNome || task.realizadoPor ? `Concluído por: ${task.realizadoPorNome || task.realizadoPor}` : undefined}
                    >
                      <span>{new Date(task.realizado + "T00:00:00").toLocaleDateString("pt-BR")}</span>
                      {(task.realizadoPorNome || task.realizadoPor) && (
                        <Info size={12} className="text-amber-600 shrink-0 cursor-help" title={`Concluído por: ${task.realizadoPorNome || task.realizadoPor}`} />
                      )}
                    </div>
                  )}
                </div>
              </td>
              <td className="px-4 py-4 text-right whitespace-nowrap align-middle pr-5">
                <div className="flex items-center justify-end gap-0.5">
                  {canMarkComplete(task) && (
                    <button
                      type="button"
                      onClick={() => handleMarkComplete(task)}
                      disabled={!!markingId}
                      title="Marcar como concluída"
                      className="inline-flex items-center justify-center p-2 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:ring-offset-1"
                      aria-label="Marcar como concluída"
                    >
                      {markingId === task.id ? (
                        <span className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin block" />
                      ) : (
                        <CheckCircle size={16} strokeWidth={2} />
                      )}
                    </button>
                  )}
                  {canDuplicate && onDuplicate && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDuplicate(task)}
                      aria-label={`Duplicar tarefa: ${task.atividade}`}
                      title="Duplicar"
                      className="opacity-70 hover:opacity-100"
                    >
                      <Copy size={14} />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(task)}
                    aria-label={`Editar tarefa: ${task.atividade}`}
                    title="Editar"
                    className="opacity-70 hover:opacity-100"
                  >
                    <Edit2 size={14} />
                  </Button>
                  {(user?.role !== "USER" || user.canDelete) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(task)}
                      aria-label={`Excluir tarefa: ${task.atividade}`}
                      title="Excluir"
                      className="opacity-70 hover:opacity-100 hover:text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default React.memo(TaskTableInner);
