import React, { useState, useEffect, useCallback } from "react";
import { List, Shield } from "lucide-react";
import Card, { CardHeader } from "@/components/ui/Card";
import LookupManager from "@/components/admin/LookupManager";
import RulesManager from "@/components/admin/RulesManager";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import { lookupsApi, rulesApi } from "@/services/api";
import type { Lookups, LookupItem, Rule } from "@/types";

type Tab = "lookups" | "rules";

export default function AdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>(user?.role === "ADMIN" ? "lookups" : "rules");
  const [lookupItems, setLookupItems] = useState<LookupItem[]>([]);
  const [lookups, setLookups] = useState<Lookups>({});
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (user?.role === "ADMIN") {
        const [itemsRes, lookupsRes, rulesRes] = await Promise.all([
          lookupsApi.listAll(),
          lookupsApi.list(),
          rulesApi.list(),
        ]);
        setLookupItems(itemsRes.lookups);
        setLookups(lookupsRes.lookups);
        setRules(rulesRes.rules);
      } else {
        const [lookupsRes, rulesRes] = await Promise.all([lookupsApi.list(), rulesApi.list()]);
        setLookups(lookupsRes.lookups);
        setRules(rulesRes.rules);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao carregar", "error");
    } finally {
      setLoading(false);
    }
  }, [user?.role, toast]);

  /** Atualiza só a lista de lookups (sem loading da página) para refletir rename/add/delete na hora. */
  const refreshLookups = useCallback(async () => {
    if (user?.role !== "ADMIN") return;
    try {
      const [itemsRes, lookupsRes] = await Promise.all([lookupsApi.listAll(), lookupsApi.list()]);
      setLookupItems(itemsRes.lookups);
      setLookups(lookupsRes.lookups);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao atualizar listas", "error");
    }
  }, [user?.role, toast]);

  /** Atualização otimista: reflete o rename na UI na hora, sem depender do refetch. */
  const handleLookupRenamed = useCallback((id: string, newValue: string, category: string, oldValue: string) => {
    setLookupItems(prev => prev.map(it => (it.id === id ? { ...it, value: newValue } : it)));
    setLookups(prev => {
      const next = { ...prev };
      next[category] = (next[category] ?? []).map(v => (v === oldValue ? newValue : v));
      return next;
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const tabs = [
    ...(user?.role === "ADMIN" ? [{ id: "lookups" as Tab, label: "Listas de Valores", icon: <List size={15} /> }] : []),
    { id: "rules" as Tab, label: "Regras de Área", icon: <Shield size={15} /> },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner text="Carregando configurações..." />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-1">Configurações</h2>
        <p className="text-sm text-slate-600">
          {user?.role === "ADMIN"
            ? "Gerencie listas de valores e regras por área"
            : "Gerencie as regras de recorrência da sua área"}
        </p>
      </div>

      {tabs.length > 1 && (
        <div className="flex gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg w-fit">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all
                ${tab === t.id ? "bg-white text-brand-800 border border-brand-200 shadow-sm" : "text-slate-700 hover:text-slate-900"}
              `}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === "lookups" && user?.role === "ADMIN" && (
        <Card>
          <CardHeader title="Listas de Valores" subtitle="Gerencie as opções disponíveis nos formulários de tarefas" />
          <LookupManager items={lookupItems} onRefresh={refreshLookups} onLookupRenamed={handleLookupRenamed} />
        </Card>
      )}

      {tab === "rules" && (
        <Card>
          <CardHeader
            title="Regras por Área"
            subtitle={
              user?.role === "ADMIN"
                ? "Defina quais recorrências são permitidas por área"
                : `Defina as recorrências permitidas para a área: ${user?.area}`
            }
          />
          <RulesManager rules={rules} lookups={lookups} onRefresh={load} />
        </Card>
      )}
    </div>
  );
}