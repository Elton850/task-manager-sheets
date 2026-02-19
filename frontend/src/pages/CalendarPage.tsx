import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Lock, CheckCircle } from "lucide-react";
import CalendarGrid from "@/components/calendar/CalendarGrid";
import DayPanel from "@/components/calendar/DayPanel";
import TaskModal from "@/components/tasks/TaskModal";
import Card from "@/components/ui/Card";
import Badge, { getStatusVariant } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { tasksApi, usersApi, lookupsApi, rulesApi } from "@/services/api";
import type { Task, Lookups, User } from "@/types";

function toYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toYm(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export default function CalendarPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [lookups, setLookups] = useState<Lookups>({});
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [createDate, setCreateDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [canCreateTask, setCanCreateTask] = useState(true);
  const [createBlockedReason, setCreateBlockedReason] = useState("");
  const [completeTarget, setCompleteTarget] = useState<Task | null>(null);
  const [completing, setCompleting] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const basePromises = [tasksApi.list(), usersApi.list(), lookupsApi.list()] as const;

      if (user?.role === "USER") {
        const [tasksRes, usersRes, lookupsRes, ruleRes] = await Promise.all([
          ...basePromises,
          rulesApi.byArea(user.area),
        ]);

        setAllTasks(tasksRes.tasks);
        setUsers(usersRes.users);
        setLookups(lookupsRes.lookups);

        const allowed = ruleRes.rule?.allowedRecorrencias || [];
        const canCreate = allowed.length > 0;
        setCanCreateTask(canCreate);
        setCreateBlockedReason(canCreate ? "" : "Sua area nao possui recorrencias permitidas para criacao de tarefas.");
      } else {
        const [tasksRes, usersRes, lookupsRes] = await Promise.all(basePromises);
        setAllTasks(tasksRes.tasks);
        setUsers(usersRes.users);
        setLookups(lookupsRes.lookups);
        setCanCreateTask(true);
        setCreateBlockedReason("");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao carregar dados", "error");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [toast, user?.role, user?.area]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const refresh = () => load(true);
    const id = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);

  useEffect(() => {
    const ymStr = `${year}-${String(month + 1).padStart(2, "0")}`;
    setTasks(allTasks.filter(t => t.competenciaYm === ymStr));
  }, [allTasks, year, month]);

  const goToPrev = () => {
    if (month === 0) {
      setYear(y => y - 1);
      setMonth(11);
    } else {
      setMonth(m => m - 1);
    }
    setSelectedDay(null);
  };

  const goToNext = () => {
    if (month === 11) {
      setYear(y => y + 1);
      setMonth(0);
    } else {
      setMonth(m => m + 1);
    }
    setSelectedDay(null);
  };

  const goToToday = () => {
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    setSelectedDay(null);
  };

  const dayTasks = useMemo(() => {
    if (!selectedDay) return [];
    return tasks.filter(t => {
      if (!t.prazo) return false;
      const d = new Date(t.prazo + "T00:00:00");
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === selectedDay;
    });
  }, [selectedDay, tasks, year, month]);

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const in7Days = new Date(today);
  in7Days.setDate(today.getDate() + 7);

  const todayYmd = toYmd(today);
  const tomorrowYmd = toYmd(tomorrow);
  const in7Ymd = toYmd(in7Days);

  const dueToday = allTasks.filter(t => t.status === "Em Andamento" && t.prazo === todayYmd);
  const dueTomorrow = allTasks.filter(t => t.status === "Em Andamento" && t.prazo === tomorrowYmd);
  const dueNextDays = allTasks.filter(
    t => t.status === "Em Andamento" && !!t.prazo && t.prazo > tomorrowYmd && t.prazo <= in7Ymd
  );
  const overdueTasks = allTasks.filter(t => t.status === "Em Atraso");

  const todayTasksAll = useMemo(
    () => allTasks.filter(t => t.prazo === todayYmd).sort((a, b) => a.status.localeCompare(b.status)),
    [allTasks, todayYmd]
  );

  const monthByType = useMemo(() => {
    const map = new Map<string, number>();
    for (const task of tasks) {
      map.set(task.tipo || "Sem tipo", (map.get(task.tipo || "Sem tipo") || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [tasks]);

  const upsertTask = (updated: Task) => {
    setAllTasks(prev => {
      const exists = prev.some(t => t.id === updated.id);
      if (exists) return prev.map(t => (t.id === updated.id ? updated : t));
      return [updated, ...prev];
    });
    setEditTask(prev => (prev?.id === updated.id ? updated : prev));
  };

  const handleSave = async (data: Partial<Task>) => {
    setSaving(true);
    try {
      if (editTask) {
        const { task } = await tasksApi.update(editTask.id, data);
        upsertTask(task);
        setEditTask(null);
        toast("Tarefa atualizada", "success");
        return task;
      }

      const { task } = await tasksApi.create(data);
      upsertTask(task);
      setCreateDate(null);
      toast("Tarefa criada", "success");
      return task;
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao salvar", "error");
      return undefined;
    } finally {
      setSaving(false);
    }
  };

  const openCreateForDay = (day: number) => {
    if (!canCreateTask) {
      toast(createBlockedReason || "Criacao de tarefas indisponivel para seu perfil.", "warning");
      return;
    }
    const date = new Date(year, month, day);
    setSelectedDay(day);
    setCreateDate(toYmd(date));
  };

  const handleMarkComplete = async () => {
    if (!completeTarget) return;
    setCompleting(true);
    try {
      const { task: updated } = await tasksApi.update(completeTarget.id, { realizado: todayYmd });
      upsertTask(updated);
      toast("Tarefa marcada como concluída", "success");
      setCompleteTarget(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao marcar como concluída", "error");
    } finally {
      setCompleting(false);
    }
  };

  const canMarkComplete = (task: Task) =>
    (task.status === "Em Andamento" || task.status === "Em Atraso");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner text="Carregando calendario..." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!canCreateTask && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-800 inline-flex items-center gap-2 shadow-sm">
          <Lock size={13} />
          {createBlockedReason}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-rose-50 border-rose-100 p-3">
          <p className="text-[11px] font-medium text-rose-600">Em atraso</p>
          <p className="text-lg font-semibold text-rose-700">{overdueTasks.length}</p>
        </Card>
        <Card className="bg-brand-50 border-brand-100 p-3">
          <p className="text-[11px] font-medium text-brand-700">Vencem hoje</p>
          <p className="text-lg font-semibold text-brand-800">{dueToday.length}</p>
        </Card>
        <Card className="bg-sky-50 border-sky-100 p-3">
          <p className="text-[11px] font-medium text-sky-700">Amanhã</p>
          <p className="text-lg font-semibold text-sky-800">{dueTomorrow.length}</p>
        </Card>
        <Card className="bg-emerald-50 border-emerald-100 p-3">
          <p className="text-[11px] font-medium text-emerald-700">Próximos 7 dias</p>
          <p className="text-lg font-semibold text-emerald-800">{dueNextDays.length}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
        <div className="xl:col-span-3">
          <CalendarGrid
            year={year}
            month={month}
            tasks={tasks}
            selectedDay={selectedDay}
            canCreateTask={canCreateTask}
            createBlockedReason={createBlockedReason}
            onDayClick={d => setSelectedDay(prev => (prev === d ? null : d))}
            onCreateInDay={openCreateForDay}
            onPrev={goToPrev}
            onNext={goToNext}
            onToday={goToToday}
          />
        </div>

        <div className="space-y-3">
          <Card className="bg-white border-slate-200">
            <h3 className="text-sm font-semibold text-slate-800 mb-2">Tipos no mês</h3>
            {monthByType.length === 0 ? (
              <p className="text-xs text-slate-500">Sem tarefas neste mês.</p>
            ) : (
              <div className="space-y-2">
                {monthByType.map(([tipo, count]) => (
                  <div key={tipo} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-700 truncate pr-2">{tipo}</span>
                      <span className="text-slate-500 font-medium">{count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{ width: `${Math.max(10, (count / (monthByType[0]?.[1] || 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {selectedDay && (
            <DayPanel
              day={selectedDay}
              month={month}
              year={year}
              tasks={dayTasks}
              canCreateTask={canCreateTask}
              createBlockedReason={createBlockedReason}
              onClose={() => setSelectedDay(null)}
              onCreateTask={() => openCreateForDay(selectedDay)}
              onEditTask={task => setEditTask(task)}
              onMarkComplete={task => setCompleteTarget(task)}
              canMarkComplete={canMarkComplete}
            />
          )}
        </div>
      </div>

      {todayTasksAll.length > 0 && (
        <Card className="bg-white border-slate-200">
          <h3 className="text-sm font-semibold text-slate-800 mb-2">Atividades de hoje</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {todayTasksAll.slice(0, 6).map(task => (
              <div
                key={task.id}
                className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:border-slate-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setEditTask(task)}
                    className="text-left flex-1 min-w-0"
                  >
                    <p className="text-xs font-medium text-slate-800 truncate">{task.atividade}</p>
                    <p className="text-[11px] text-slate-500 mt-1">{task.tipo} · {task.responsavelNome}</p>
                  </button>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Badge variant={getStatusVariant(task.status)} size="sm">
                      {task.status}
                    </Badge>
                    {canMarkComplete(task) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={e => { e.stopPropagation(); setCompleteTarget(task); }}
                        className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                        title="Marcar como concluída"
                      >
                        <CheckCircle size={16} />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

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

      {(editTask || createDate) && (
        <TaskModal
          open={!!editTask || !!createDate}
          task={editTask}
          initialData={
            createDate
              ? {
                  prazo: createDate,
                  competenciaYm: toYm(new Date(createDate + "T00:00:00")),
                }
              : undefined
          }
          lookups={lookups}
          users={users}
          onClose={() => {
            setEditTask(null);
            setCreateDate(null);
          }}
          onSave={handleSave}
          onTaskChange={upsertTask}
          loading={saving}
        />
      )}
    </div>
  );
}
