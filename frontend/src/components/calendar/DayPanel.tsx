import React from "react";
import { X, Clock, CheckCircle, AlertCircle, AlertTriangle, Plus, Lock } from "lucide-react";
import Badge, { getStatusVariant } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import type { Task } from "@/types";

interface DayPanelProps {
  day: number;
  month: number;
  year: number;
  tasks: Task[];
  canCreateTask: boolean;
  createBlockedReason?: string;
  onClose: () => void;
  onCreateTask: () => void;
  onEditTask: (task: Task) => void;
  onMarkComplete?: (task: Task) => void;
  canMarkComplete?: (task: Task) => boolean;
}

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export default function DayPanel({
  day,
  month,
  year,
  tasks,
  canCreateTask,
  createBlockedReason,
  onClose,
  onCreateTask,
  onEditTask,
  onMarkComplete,
  canMarkComplete,
}: DayPanelProps) {
  const dateStr = `${String(day).padStart(2, "0")} de ${MONTHS_PT[month]} de ${year}`;

  const grouped = tasks.reduce<Record<string, Task[]>>((acc, t) => {
    if (!acc[t.status]) acc[t.status] = [];
    acc[t.status].push(t);
    return acc;
  }, {});

  const statusOrder = ["Em Atraso", "Em Andamento", "Concluído em Atraso", "Concluído"];

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col h-full min-h-[420px]">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{dateStr}</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {tasks.length} tarefa{tasks.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCreateTask}
            disabled={!canCreateTask}
            title={!canCreateTask ? createBlockedReason : "Nova atividade neste dia"}
          >
            {canCreateTask ? <Plus size={16} /> : <Lock size={16} />}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>
      </div>

      {!canCreateTask && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-800">
          {createBlockedReason || "Criação de tarefas desabilitada para sua área."}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <CheckCircle size={32} className="mb-3 opacity-30" />
            <p className="text-sm">Nenhuma tarefa com prazo neste dia</p>
            <Button className="mt-4" size="sm" onClick={onCreateTask} icon={<Plus size={14} />} disabled={!canCreateTask}>
              Criar atividade
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {statusOrder.map(status => {
              const items = grouped[status];
              if (!items?.length) return null;

              const icons: Record<string, React.ReactNode> = {
                "Em Atraso": <AlertCircle size={14} className="text-rose-600" />,
                "Em Andamento": <Clock size={14} className="text-blue-600" />,
                "Concluído em Atraso": <AlertTriangle size={14} className="text-amber-600" />,
                "Concluído": <CheckCircle size={14} className="text-emerald-600" />,
              };

              return (
                <div key={status}>
                  <div className="flex items-center gap-2 mb-2">
                    {icons[status]}
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      {status} ({items.length})
                    </span>
                  </div>
                  <div className="space-y-2">
                    {items.map(task => (
                      <div
                        key={task.id}
                        className="flex items-start gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 hover:border-slate-300 transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => onEditTask(task)}
                          className="flex-1 text-left min-w-0"
                        >
                          <p className="text-sm text-slate-800">{task.atividade}</p>
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
                            <span>{task.responsavelNome}</span>
                            <span>·</span>
                            <span>{task.area}</span>
                            {task.realizado && (
                              <>
                                <span>·</span>
                                <span className="text-emerald-700">
                                  Realizado: {new Date(task.realizado + "T00:00:00").toLocaleDateString("pt-BR")}
                                </span>
                              </>
                            )}
                          </div>
                        </button>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <Badge variant={getStatusVariant(task.status)} size="sm">
                            {task.tipo}
                          </Badge>
                          {onMarkComplete && canMarkComplete?.(task) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onMarkComplete(task)}
                              className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              title="Marcar como concluída"
                            >
                              <CheckCircle size={14} />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}