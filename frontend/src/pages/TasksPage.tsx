import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, RefreshCw, Lock, FileDown } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import TaskTable from "@/components/tasks/TaskTable";
import TaskFilters from "@/components/tasks/TaskFilters";
import TaskModal from "@/components/tasks/TaskModal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { tasksApi, usersApi, lookupsApi, rulesApi } from "@/services/api";
import { exportTasksToCsv, exportTasksToPdf } from "@/utils/exportTasks";
import type { Task, TaskFilters as Filters, Lookups, User } from "@/types";

const DEFAULT_FILTERS: Filters = {
  search: "",
  status: "",
  area: "",
  responsavel: "",
  competenciaYm: "",
};

export default function TasksPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [lookups, setLookups] = useState<Lookups>({});
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<Task | null>(null);
  const [completing, setCompleting] = useState(false);
  const [duplicateTarget, setDuplicateTarget] = useState<Task | null>(null);
  const [duplicating, setDuplicating] = useState(false);

  const [canCreateTask, setCanCreateTask] = useState(true);
  const [createBlockedReason, setCreateBlockedReason] = useState("");
  const [allowedRecorrencias, setAllowedRecorrencias] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const basePromises = [tasksApi.list(), usersApi.list(), lookupsApi.list()] as const;

      if (user?.role === "USER") {
        const [tasksRes, usersRes, lookupsRes, ruleRes] = await Promise.all([
          ...basePromises,
          rulesApi.byArea(user.area),
        ]);
        setTasks(tasksRes.tasks);
        setUsers(usersRes.users);
        setLookups(lookupsRes.lookups);

        const allowed = ruleRes.rule?.allowedRecorrencias || [];
        setAllowedRecorrencias(allowed);
        const canCreate = allowed.length > 0;
        setCanCreateTask(canCreate);
        setCreateBlockedReason(canCreate ? "" : "Sua área não possui recorrências permitidas para criação de tarefas.");
      } else {
        const [tasksRes, usersRes, lookupsRes] = await Promise.all(basePromises);
        setTasks(tasksRes.tasks);
        setUsers(usersRes.users);
        setLookups(lookupsRes.lookups);
        setCanCreateTask(true);
        setCreateBlockedReason("");
        setAllowedRecorrencias([]);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao carregar dados", "error");
    } finally {
      setLoading(false);
    }
  }, [toast, user?.role, user?.area]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (filters.search) {
        const s = filters.search.toLowerCase();
        if (!t.atividade.toLowerCase().includes(s) && !t.observacoes?.toLowerCase().includes(s)) return false;
      }
      if (filters.status && t.status !== filters.status) return false;
      if (filters.area && t.area !== filters.area) return false;
      if (filters.responsavel && t.responsavelEmail !== filters.responsavel) return false;
      if (filters.competenciaYm && t.competenciaYm !== filters.competenciaYm) return false;
      return true;
    });
  }, [tasks, filters]);

  const handleSave = async (data: Partial<Task>) => {
    setSaving(true);
    try {
      if (editTask) {
        const { task } = await tasksApi.update(editTask.id, data);
        setTasks(prev => prev.map(t => (t.id === task.id ? task : t)));
        toast("Tarefa atualizada", "success");
        setModalOpen(false);
        setEditTask(null);
        return task;
      }

      const { task } = await tasksApi.create(data);
      setTasks(prev => [task, ...prev]);
      toast("Tarefa criada", "success");
      setModalOpen(false);
      setEditTask(null);
      return task;
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao salvar tarefa", "error");
      return undefined;
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await tasksApi.delete(deleteTarget.id);
      setTasks(prev => prev.filter(t => t.id !== deleteTarget.id));
      toast("Tarefa excluída", "success");
      setDeleteTarget(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao excluir", "error");
    } finally {
      setDeleting(false);
    }
  };

  const handleDuplicate = async () => {
    if (!duplicateTarget) return;
    setDuplicating(true);
    try {
      const { task: dup } = await tasksApi.duplicate(duplicateTarget.id);
      setTasks(prev => [dup, ...prev]);
      toast("Tarefa duplicada", "success");
      setDuplicateTarget(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao duplicar", "error");
    } finally {
      setDuplicating(false);
    }
  };

  const todayYmd = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const handleMarkComplete = async () => {
    if (!completeTarget) return;
    setCompleting(true);
    try {
      const { task: updated } = await tasksApi.update(completeTarget.id, { realizado: todayYmd() });
      setTasks(prev => prev.map(t => (t.id === updated.id ? updated : t)));
      toast("Tarefa marcada como concluída", "success");
      setCompleteTarget(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao marcar como concluída", "error");
    } finally {
      setCompleting(false);
    }
  };

  const openCreateModal = () => {
    if (!canCreateTask) {
      toast(createBlockedReason || "Criação de tarefas indisponível para seu perfil.", "warning");
      return;
    }
    setEditTask(null);
    setModalOpen(true);
  };

  return (
    <div className="space-y-4 max-w-full">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
          </p>
          {!canCreateTask && (
            <p className="text-xs text-amber-700 mt-1 inline-flex items-center gap-1">
              <Lock size={12} />
              {createBlockedReason}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={load} icon={<RefreshCw size={14} />}>
            Atualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<FileDown size={14} />}
            onClick={() => {
              if (!filteredTasks.length) {
                toast("Nenhuma tarefa para exportar. Ajuste os filtros.", "warning");
                return;
              }
              exportTasksToCsv(filteredTasks);
              toast("Download CSV iniciado", "success");
            }}
            title="Baixar tabela em CSV"
          >
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<FileDown size={14} />}
            onClick={() => {
              if (!filteredTasks.length) {
                toast("Nenhuma tarefa para exportar. Ajuste os filtros.", "warning");
                return;
              }
              exportTasksToPdf(filteredTasks);
              toast("Download PDF iniciado", "success");
            }}
            title="Baixar tabela em PDF"
          >
            PDF
          </Button>
          <Button
            size="sm"
            icon={<Plus size={15} />}
            onClick={openCreateModal}
            disabled={!canCreateTask}
            title={!canCreateTask ? createBlockedReason : "Nova tarefa"}
          >
            Nova tarefa
          </Button>
        </div>
      </div>

      <Card>
        <TaskFilters
          filters={filters}
          lookups={lookups}
          users={users}
          onChange={f => setFilters(p => ({ ...p, ...f }))}
          onClear={() => setFilters(DEFAULT_FILTERS)}
          totalCount={tasks.length}
          filteredCount={filteredTasks.length}
        />
      </Card>

      <Card padding={false}>
        <TaskTable
          tasks={filteredTasks}
          loading={loading}
          onEdit={task => {
            setEditTask({
              ...task,
              subtasks: filteredTasks.filter(t => t.parentTaskId === task.id),
            });
            setModalOpen(true);
          }}
          onDelete={task => setDeleteTarget(task)}
          onDuplicate={task => setDuplicateTarget(task)}
          onMarkComplete={task => setCompleteTarget(task)}
        />
      </Card>

      <TaskModal
        open={modalOpen}
        task={editTask}
        lookups={lookups}
        users={users}
        allowedRecorrencias={user?.role === "USER" ? allowedRecorrencias : undefined}
        onClose={() => {
          setModalOpen(false);
          setEditTask(null);
        }}
        onSave={handleSave}
        onTaskChange={updatedTask => {
          setTasks(prev => prev.map(t => (t.id === updatedTask.id ? updatedTask : t)));
          setEditTask(prev => (prev && prev.id === updatedTask.id ? updatedTask : prev));
        }}
        onSubtaskCreated={subtask => {
          setTasks(prev => [...prev, subtask]);
          setEditTask(prev => (prev ? { ...prev, subtasks: [...(prev.subtasks || []), subtask] } : null));
        }}
        loading={saving}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Excluir tarefa"
        message={`Deseja excluir a tarefa "${deleteTarget?.atividade}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={!!completeTarget}
        title="Marcar como concluída"
        message={completeTarget ? `Deseja marcar a tarefa "${completeTarget.atividade}" como concluída? A data de realização será definida como hoje.` : ""}
        confirmLabel="Concluir"
        variant="primary"
        loading={completing}
        onConfirm={handleMarkComplete}
        onCancel={() => setCompleteTarget(null)}
      />

      <ConfirmDialog
        open={!!duplicateTarget}
        title="Duplicar tarefa"
        message={duplicateTarget ? `Deseja duplicar a tarefa "${duplicateTarget.atividade}"? Uma nova tarefa será criada com os mesmos dados (sem data de conclusão).` : ""}
        confirmLabel="Duplicar"
        variant="primary"
        loading={duplicating}
        onConfirm={handleDuplicate}
        onCancel={() => setDuplicateTarget(null)}
      />
    </div>
  );
}