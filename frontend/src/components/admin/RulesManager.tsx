import React, { useState, useEffect } from "react";
import { Save, CheckSquare, Square } from "lucide-react";
import Button from "@/components/ui/Button";
import { rulesApi } from "@/services/api";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import type { Rule, Lookups } from "@/types";

interface RulesManagerProps {
  rules: Rule[];
  lookups: Lookups;
  onRefresh: () => void;
  /** Quando definido (Admin Mestre editando uma empresa), salva regras para essa empresa. */
  tenantSlug?: string;
}

export default function RulesManager({ rules, lookups, onRefresh, tenantSlug }: RulesManagerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const areas = user?.role === "ADMIN" ? lookups.AREA || [] : [user?.area || ""];
  const recorrencias = lookups.RECORRENCIA || [];

  useEffect(() => {
    const init: Record<string, Set<string>> = {};
    for (const area of areas) {
      const rule = rules.find(r => r.area === area);
      init[area] = new Set(rule?.allowedRecorrencias || []);
    }
    setSelected(init);
  }, [rules, areas.join(",")]);

  const toggleRecorrencia = (area: string, rec: string) => {
    setSelected(prev => {
      const set = new Set(prev[area] || []);
      if (set.has(rec)) set.delete(rec);
      else set.add(rec);
      return { ...prev, [area]: set };
    });
  };

  const handleSave = async (area: string) => {
    setSaving(area);
    try {
      const allowed = Array.from(selected[area] || []);
      if (tenantSlug) {
        await rulesApi.saveForTenant(tenantSlug, area, allowed);
      } else {
        await rulesApi.save(area, allowed);
      }
      onRefresh();
      toast(`Regras de "${area}" salvas com sucesso`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao salvar regras", "error");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-6">
      {areas.map(area => (
        <div key={area} className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900">{area}</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600 font-medium">
                {(selected[area]?.size || 0)} recorrência{(selected[area]?.size || 0) !== 1 ? "s" : ""} permitida{(selected[area]?.size || 0) !== 1 ? "s" : ""}
              </span>
              <Button size="sm" onClick={() => handleSave(area)} loading={saving === area} icon={<Save size={13} />}>
                Salvar
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {recorrencias.map(rec => {
              const isSelected = selected[area]?.has(rec) || false;
              return (
                <button
                  key={rec}
                  onClick={() => toggleRecorrencia(area, rec)}
                  className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                    ${
                      isSelected
                        ? "bg-brand-100 text-brand-900 border-2 border-brand-500 shadow-sm"
                        : "bg-slate-50 text-slate-700 border border-slate-300 hover:border-slate-400 hover:text-slate-900 hover:bg-white"
                    }
                  `}
                >
                  {isSelected ? <CheckSquare size={12} /> : <Square size={12} />}
                  {rec}
                </button>
              );
            })}
          </div>

          {(selected[area]?.size || 0) === 0 && (
            <p className="text-xs text-amber-700 mt-2">
              Nenhuma recorrência selecionada. Usuários desta área não poderão criar tarefas.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}