import React from "react";
import { Search, X, SlidersHorizontal } from "lucide-react";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import type { TaskFilters as Filters, Lookups, User } from "@/types";

interface TaskFiltersProps {
  filters: Filters;
  lookups: Lookups;
  users: User[];
  onChange: (f: Partial<Filters>) => void;
  onClear: () => void;
  totalCount: number;
  filteredCount: number;
}

function getYmOptions() {
  const options = [];
  for (let i = -12; i <= 3; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() + i);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
    options.push({ value: ym, label });
  }
  return options;
}

const STATUS_OPTIONS = [
  { value: "Em Andamento", label: "Em Andamento" },
  { value: "Concluído", label: "Concluído" },
  { value: "Em Atraso", label: "Em Atraso" },
  { value: "Concluído em Atraso", label: "Concluído em Atraso" },
];

export default function TaskFilters({ filters, lookups, users, onChange, onClear, totalCount, filteredCount }: TaskFiltersProps) {
  const { user } = useAuth();
  const [expanded, setExpanded] = React.useState(false);

  const hasFilters = Object.values(filters).some(v => !!v);
  const areaOptions = (lookups.AREA || []).map(v => ({ value: v, label: v }));
  const userOptions = users.map(u => ({ value: u.email, label: u.nome }));

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Search */}
        <div className="flex-1">
          <Input
            placeholder="Buscar por atividade ou observações..."
            value={filters.search}
            onChange={e => onChange({ search: e.target.value })}
            leftIcon={<Search size={15} />}
          />
        </div>

        {/* Competência YM */}
        <div className="w-full sm:w-44">
          <Select
            value={filters.competenciaYm}
            onChange={e => onChange({ competenciaYm: e.target.value })}
            options={getYmOptions()}
            placeholder="Competência..."
          />
        </div>

        {/* More filters toggle */}
        <Button
          variant={expanded ? "secondary" : "outline"}
          onClick={() => setExpanded(e => !e)}
          icon={<SlidersHorizontal size={15} />}
          aria-expanded={expanded}
          aria-label={expanded ? "Ocultar filtros avançados" : "Mostrar filtros avançados"}
        >
          Filtros
          {hasFilters && !expanded && (
            <span 
              className="ml-1 w-4 h-4 rounded-full bg-brand-500 text-white text-[10px] flex items-center justify-center"
              aria-label={`${Object.values(filters).filter(Boolean).length} filtros ativos`}
            >
              {Object.values(filters).filter(Boolean).length}
            </span>
          )}
        </Button>

        {hasFilters && (
          <Button variant="ghost" onClick={onClear} icon={<X size={15} />} className="text-slate-500">
            Limpar
          </Button>
        )}
      </div>

      {/* Expanded filters */}
      {expanded && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <Select
            value={filters.status}
            onChange={e => onChange({ status: e.target.value })}
            options={STATUS_OPTIONS}
            placeholder="Status..."
          />

          {user?.role !== "USER" && (
            <>
              <Select
                value={filters.area}
                onChange={e => onChange({ area: e.target.value })}
                options={areaOptions}
                placeholder="Área..."
              />
              <Select
                value={filters.responsavel}
                onChange={e => onChange({ responsavel: e.target.value })}
                options={userOptions}
                placeholder="Responsável..."
              />
            </>
          )}
        </div>
      )}

      {/* Count */}
      {(hasFilters || totalCount > 0) && (
        <p className="text-xs text-slate-600 font-medium">
          {filteredCount === totalCount
            ? `${totalCount} tarefa${totalCount !== 1 ? "s" : ""}`
            : `${filteredCount} de ${totalCount} tarefa${totalCount !== 1 ? "s" : ""}`
          }
        </p>
      )}
    </div>
  );
}
