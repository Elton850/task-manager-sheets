import React from "react";
import { Edit2, Trash2, Copy, ChevronUp, ChevronDown, Paperclip, CheckCircle } from "lucide-react";
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

export default function TaskTable({ tasks, loading, onEdit, onDelete, onDuplicate, onMarkComplete }: TaskTableProps) {
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

  const sorted = [...tasks].sort((a, b) => {
    const va = a[sortField] || "";
    const vb = b[sortField] || "";
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

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
      className={`px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider cursor-pointer hover:text-slate-900 select-none ${className}`}
    >
      {label}
      <SortIcon field={field} />
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
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
          <span className="text-2xl">📋</span>
        </div>
        <p className="text-sm font-medium text-slate-700">Nenhuma tarefa encontrada</p>
        <p className="text-xs mt-1">Ajuste os filtros ou crie uma nova tarefa</p>
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
    <div className="overflow-x-auto -mx-4 sm:mx-0 sm:rounded-xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200" role="table" aria-label="Lista de tarefas">
        <thead className="bg-slate-100">
          <tr>
            <ThSortable field="competenciaYm" label="Competência" />
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Atividade</th>
            <ThSortable field="recorrencia" label="Recorrência" className="hidden md:table-cell" />
            <ThSortable field="area" label="Área" className="hidden lg:table-cell" />
            <ThSortable field="responsavelNome" label="Responsável" className="hidden sm:table-cell" />
            <ThSortable field="prazo" label="Prazo" className="hidden md:table-cell" />
            <ThSortable field="status" label="Status" />
            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {sorted.map(task => (
            <tr key={task.id} className="hover:bg-slate-50 transition-colors">
              <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap font-mono">{task.competenciaYm}</td>
              <td className="px-4 py-3 text-sm text-slate-800 max-w-xs">
                <div className="truncate" title={task.atividade}>
                  {task.atividade}
                </div>
                {task.observacoes && (
                  <div className="text-xs text-slate-600 truncate mt-0.5" title={task.observacoes}>
                    {task.observacoes}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-1">
                  {!!task.evidences?.length && (
                    <span className="inline-flex items-center gap-1 text-xs text-brand-800 bg-brand-50 border border-brand-200 rounded-full px-2 py-0.5">
                      <Paperclip size={11} />
                      {task.evidences.length}
                    </span>
                  )}
                  <div className="flex flex-wrap gap-1 sm:hidden">
                    <span className="text-xs text-slate-700 font-medium">{task.responsavelNome}</span>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap hidden md:table-cell">{task.recorrencia}</td>
              <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap hidden lg:table-cell">{task.area}</td>
              <td className="px-4 py-3 text-sm text-slate-800 font-medium whitespace-nowrap hidden sm:table-cell">{task.responsavelNome}</td>
              <td className="px-4 py-3 text-sm whitespace-nowrap hidden md:table-cell">
                {task.prazo ? (
                  <span className={task.status === "Em Atraso" ? "text-rose-600 font-medium" : "text-slate-700"}>
                    {new Date(task.prazo + "T00:00:00").toLocaleDateString("pt-BR")}
                  </span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <div className="flex items-center gap-2">
                  {canMarkComplete(task) && (
                    <button
                      type="button"
                      onClick={() => handleMarkComplete(task)}
                      disabled={!!markingId}
                      title="Marcar como concluída"
                      className="p-1 rounded-md text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                    >
                      {markingId === task.id ? (
                        <span className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin block" />
                      ) : (
                        <CheckCircle size={16} />
                      )}
                    </button>
                  )}
                  <Badge variant={getStatusVariant(task.status)} size="sm">
                    {task.status}
                  </Badge>
                </div>
                {task.realizado && (
                  <div className="text-xs text-slate-600 mt-0.5">
                    {new Date(task.realizado + "T00:00:00").toLocaleDateString("pt-BR")}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                <div className="flex items-center justify-end gap-1">
                  {canDuplicate && onDuplicate && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => onDuplicate(task)} 
                      aria-label={`Duplicar tarefa: ${task.atividade}`}
                      title="Duplicar"
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
                      className="hover:text-rose-600 hover:bg-rose-50"
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
