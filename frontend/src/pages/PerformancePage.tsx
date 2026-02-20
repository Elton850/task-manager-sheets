import React, { useState, useEffect, useCallback, useMemo } from "react";
import { RefreshCw, Download } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend
} from "recharts";
import Button from "@/components/ui/Button";
import Card, { CardHeader } from "@/components/ui/Card";
import Select from "@/components/ui/Select";
import Input from "@/components/ui/Input";
import KPICards from "@/components/performance/KPICards";
import ResponsibleTable from "@/components/performance/ResponsibleTable";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useToast } from "@/contexts/ToastContext";
import { tasksApi, usersApi, lookupsApi } from "@/services/api";
import type { Task, User, Lookups, PerformanceSummary, PerformanceFilters } from "@/types";

const STATUS_CHART_COLORS: Record<string, string> = {
  "Em Andamento": "#60a5fa",
  "Concluído": "#34d399",
  "Em Atraso": "#f87171",
  "Concluído em Atraso": "#fbbf24",
};

const DEFAULT_FILTERS: PerformanceFilters = {
  from: "", to: "", status: "", responsavel: "", recorrencia: "", tipo: "",
};

function getDefaultFrom(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 2);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getDefaultTo(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function PerformancePage() {
  const { toast } = useToast();
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [lookups, setLookups] = useState<Lookups>({});
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<PerformanceFilters>({
    ...DEFAULT_FILTERS,
    from: getDefaultFrom(),
    to: getDefaultTo(),
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksRes, usersRes, lookupsRes] = await Promise.all([
        tasksApi.list(),
        usersApi.list(),
        lookupsApi.list(),
      ]);
      setAllTasks(tasksRes.tasks);
      setUsers(usersRes.users);
      setLookups(lookupsRes.lookups);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao carregar dados", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const set = (field: keyof PerformanceFilters, value: string) =>
    setFilters(f => ({ ...f, [field]: value }));

  // Apply filters
  const filtered = useMemo(() => {
    return allTasks.filter(t => {
      if (filters.from && t.competenciaYm < filters.from) return false;
      if (filters.to && t.competenciaYm > filters.to) return false;
      if (filters.status && t.status !== filters.status) return false;
      if (filters.responsavel && t.responsavelEmail !== filters.responsavel) return false;
      if (filters.recorrencia && t.recorrencia !== filters.recorrencia) return false;
      if (filters.tipo && t.tipo !== filters.tipo) return false;
      return true;
    });
  }, [allTasks, filters]);

  // Compute summary
  const summary = useMemo((): PerformanceSummary => {
    const byResp = new Map<string, { nome: string; tasks: Task[] }>();

    for (const t of filtered) {
      if (!byResp.has(t.responsavelEmail)) {
        byResp.set(t.responsavelEmail, { nome: t.responsavelNome, tasks: [] });
      }
      byResp.get(t.responsavelEmail)!.tasks.push(t);
    }

    const byResponsavel = Array.from(byResp.entries()).map(([email, { nome, tasks }]) => ({
      email, nome,
      total: tasks.length,
      concluido: tasks.filter(t => t.status === "Concluído").length,
      emAndamento: tasks.filter(t => t.status === "Em Andamento").length,
      emAtraso: tasks.filter(t => t.status === "Em Atraso").length,
      concluidoEmAtraso: tasks.filter(t => t.status === "Concluído em Atraso").length,
    }));

    return {
      total: filtered.length,
      emAndamento: filtered.filter(t => t.status === "Em Andamento").length,
      concluido: filtered.filter(t => t.status === "Concluído").length,
      emAtraso: filtered.filter(t => t.status === "Em Atraso").length,
      concluidoEmAtraso: filtered.filter(t => t.status === "Concluído em Atraso").length,
      byResponsavel,
      lastUpdated: new Date().toISOString(),
    };
  }, [filtered]);

  const pieData = [
    { name: "Em Andamento", value: summary.emAndamento },
    { name: "Concluído", value: summary.concluido },
    { name: "Em Atraso", value: summary.emAtraso },
    { name: "Concluído em Atraso", value: summary.concluidoEmAtraso },
  ].filter(d => d.value > 0);

  const barData = summary.byResponsavel
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)
    .map(r => ({
      name: r.nome.split(" ")[0],
      fullName: r.nome,
      Concluído: r.concluido,
      "Em Andamento": r.emAndamento,
      "Em Atraso": r.emAtraso,
      "Concl. Atraso": r.concluidoEmAtraso,
    }));

  const recorrenciaOptions = (lookups.RECORRENCIA || []).map(v => ({ value: v, label: v }));
  const tipoOptions = (lookups.TIPO || []).map(v => ({ value: v, label: v }));
  const userOptions = users.map(u => ({ value: u.email, label: u.nome }));

  const statusOptions = [
    { value: "Em Andamento", label: "Em Andamento" },
    { value: "Concluído", label: "Concluído" },
    { value: "Em Atraso", label: "Em Atraso" },
    { value: "Concluído em Atraso", label: "Concluído em Atraso" },
  ];

  function getYmOptions() {
    const options = [];
    for (let i = -24; i <= 3; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() + i);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
      options.push({ value: ym, label });
    }
    return options;
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><LoadingSpinner text="Carregando performance..." /></div>;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Performance</h2>
          <p className="text-sm text-slate-600">Análise de desempenho das tarefas</p>
        </div>
        <Button variant="ghost" size="sm" onClick={load} icon={<RefreshCw size={14} />}>
          Atualizar
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader title="Filtros" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Select
            value={filters.from}
            onChange={e => set("from", e.target.value)}
            options={getYmOptions()}
            placeholder="De..."
          />
          <Select
            value={filters.to}
            onChange={e => set("to", e.target.value)}
            options={getYmOptions()}
            placeholder="Até..."
          />
          <Select
            value={filters.status}
            onChange={e => set("status", e.target.value)}
            options={statusOptions}
            placeholder="Status..."
          />
          <Select
            value={filters.responsavel}
            onChange={e => set("responsavel", e.target.value)}
            options={userOptions}
            placeholder="Responsável..."
          />
          <Select
            value={filters.recorrencia}
            onChange={e => set("recorrencia", e.target.value)}
            options={recorrenciaOptions}
            placeholder="Recorrência..."
          />
          <Select
            value={filters.tipo}
            onChange={e => set("tipo", e.target.value)}
            options={tipoOptions}
            placeholder="Tipo..."
          />
        </div>
        {Object.values(filters).some(Boolean) && (
          <button
            onClick={() => setFilters({ ...DEFAULT_FILTERS, from: getDefaultFrom(), to: getDefaultTo() })}
            className="mt-3 text-xs text-brand-600 hover:text-brand-700 font-medium"
          >
            Limpar filtros
          </button>
        )}
      </Card>

      {/* KPI Cards */}
      <KPICards data={summary} />

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Pie Chart */}
        <Card className="lg:col-span-2">
          <CardHeader title="Distribuição por Status" />
          {pieData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-slate-500 text-sm">Sem dados</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map(entry => (
                    <Cell key={entry.name} fill={STATUS_CHART_COLORS[entry.name] || "#94a3b8"} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", fontSize: "12px" }}
                  itemStyle={{ color: "#cbd5e1" }}
                />
                <Legend wrapperStyle={{ fontSize: "11px", color: "#94a3b8" }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Bar Chart */}
        <Card className="lg:col-span-3">
          <CardHeader title="Tarefas por Responsável" subtitle="Top 8 por volume" />
          {barData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-slate-600 text-sm">Sem dados</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", fontSize: "12px" }}
                  labelStyle={{ color: "#e2e8f0" }}
                  itemStyle={{ color: "#cbd5e1" }}
                  formatter={(value, name, props) => [value, name]}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ""}
                />
                <Bar dataKey="Concluído" stackId="a" fill="#34d399" radius={[0,0,0,0]} />
                <Bar dataKey="Em Andamento" stackId="a" fill="#60a5fa" />
                <Bar dataKey="Em Atraso" stackId="a" fill="#f87171" />
                <Bar dataKey="Concl. Atraso" stackId="a" fill="#fbbf24" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Responsible Table */}
      <Card>
        <CardHeader
          title="Detalhamento por Responsável"
          subtitle={`${summary.byResponsavel.length} colaborador${summary.byResponsavel.length !== 1 ? "es" : ""}`}
        />
        <ResponsibleTable data={summary.byResponsavel} />
      </Card>

      <p className="text-xs text-slate-600 text-right">
        Atualizado em: {new Date(summary.lastUpdated).toLocaleString("pt-BR")}
      </p>
    </div>
  );
}
