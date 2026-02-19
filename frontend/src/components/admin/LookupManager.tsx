import React, { useState } from "react";
import { Plus, Edit2, Trash2, Check, X } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { lookupsApi } from "@/services/api";
import { useToast } from "@/contexts/ToastContext";
import type { LookupItem } from "@/types";

interface LookupManagerProps {
  items: LookupItem[];
  onRefresh: () => void;
  /** Chamado após rename com sucesso para atualizar a UI na hora (atualização otimista). */
  onLookupRenamed?: (id: string, newValue: string, category: string, oldValue: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  AREA: "Áreas",
  RECORRENCIA: "Recorrências",
  TIPO: "Tipos de Tarefa",
};

export default function LookupManager({ items, onRefresh, onLookupRenamed }: LookupManagerProps) {
  const { toast } = useToast();
  const [newValue, setNewValue] = useState<Record<string, string>>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; value: string } | null>(null);

  const grouped = items.reduce<Record<string, LookupItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const categories = Object.keys(grouped).sort();

  const handleAdd = async (category: string) => {
    const val = (newValue[category] || "").trim();
    if (!val) return;

    setLoading(`add-${category}`);
    try {
      await lookupsApi.add(category, val);
      setNewValue(p => ({ ...p, [category]: "" }));
      onRefresh();
      toast(`"${val}" adicionado com sucesso`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao adicionar", "error");
    } finally {
      setLoading(null);
    }
  };

  const handleRename = async (id: string) => {
    const val = editValue.trim();
    if (!val) return;

    const item = items.find(i => i.id === id);
    if (!item) return;

    setLoading(`rename-${id}`);
    try {
      await lookupsApi.rename(id, val);
      onLookupRenamed?.(id, val, item.category, item.value);
      setEditId(null);
      setEditValue("");
      onRefresh();
      toast("Renomeado com sucesso", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao renomear", "error");
    } finally {
      setLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setLoading(`delete-${deleteTarget.id}`);
    try {
      await lookupsApi.remove(deleteTarget.id);
      onRefresh();
      toast("Item removido", "success");
      setDeleteTarget(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao remover", "error");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      {categories.map(category => (
        <div key={category}>
          <h3 className="text-sm font-semibold text-slate-800 mb-3">{CATEGORY_LABELS[category] || category}</h3>

          {/* Grid layout for better visualization */}
          <div className="flex flex-wrap gap-2 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200 min-h-[60px]">
            {grouped[category].map(item => (
              <div
                key={item.id}
                className="group relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:border-slate-400 transition-all"
              >
                {editId === item.id ? (
                  <>
                    <Input
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") handleRename(item.id);
                        if (e.key === "Escape") setEditId(null);
                      }}
                      className="h-6 text-xs w-32"
                      autoFocus
                    />
                    <Button variant="ghost" size="sm" onClick={() => handleRename(item.id)} loading={loading === `rename-${item.id}`} className="p-0.5">
                      <Check size={12} className="text-emerald-700" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditId(null)} className="p-0.5">
                      <X size={12} />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="text-sm text-slate-800 font-medium">{item.value}</span>
                    <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => { setEditId(item.id); setEditValue(item.value); }}
                        className="p-1 h-6 w-6 rounded-md text-slate-600 hover:text-brand-700 hover:bg-brand-50 transition-colors flex items-center justify-center"
                        title="Editar"
                      >
                        <Edit2 size={14} className="text-current" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ id: item.id, value: item.value })}
                        disabled={loading === `delete-${item.id}`}
                        className="p-1 h-6 w-6 rounded-md text-slate-600 hover:text-rose-700 hover:bg-rose-50 transition-colors flex items-center justify-center disabled:opacity-50"
                        title="Remover"
                      >
                        {loading === `delete-${item.id}` ? (
                          <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Trash2 size={14} className="text-current" />
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {grouped[category].length === 0 && (
              <div className="text-xs text-slate-500 italic self-center">Nenhum valor cadastrado</div>
            )}
          </div>

          {/* Add new value */}
          <div className="flex gap-2">
            <Input
              value={newValue[category] || ""}
              onChange={e => setNewValue(p => ({ ...p, [category]: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && handleAdd(category)}
              placeholder={`Novo ${CATEGORY_LABELS[category]?.slice(0, -1).toLowerCase() || "valor"}...`}
              className="flex-1 h-9 text-sm"
            />
            <Button size="sm" onClick={() => handleAdd(category)} loading={loading === `add-${category}`} icon={<Plus size={14} />}>
              Adicionar
            </Button>
          </div>
        </div>
      ))}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remover item"
        message={`Deseja remover "${deleteTarget?.value}"? Esta ação pode afetar tarefas existentes.`}
        confirmLabel="Remover"
        variant="danger"
        loading={!!deleteTarget && loading === `delete-${deleteTarget.id}`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}