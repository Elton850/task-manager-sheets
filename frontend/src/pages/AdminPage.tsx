import React, { useState, useEffect, useCallback } from "react";
import { List, Shield } from "lucide-react";
import Card, { CardHeader } from "@/components/ui/Card";
import LookupManager from "@/components/admin/LookupManager";
import RulesManager from "@/components/admin/RulesManager";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import { lookupsApi, rulesApi, tenantApi } from "@/services/api";
import type { Lookups, LookupItem, Rule, TenantListItem } from "@/types";

type Tab = "lookups" | "rules";

const isMasterAdmin = (user: { role: string } | null, tenant: { slug: string } | null) =>
  !!(user?.role === "ADMIN" && tenant?.slug === "system");

export default function AdminPage() {
  const { user, tenant } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>(user?.role === "ADMIN" ? "lookups" : "rules");
  const [lookupItems, setLookupItems] = useState<LookupItem[]>([]);
  const [lookups, setLookups] = useState<Lookups>({});
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<TenantListItem[]>([]);
  const [selectedTenantSlug, setSelectedTenantSlug] = useState<string>("");

  const masterAdmin = isMasterAdmin(user, tenant);

  const load = useCallback(async () => {
    if (masterAdmin && !selectedTenantSlug) {
      setLookupItems([]);
      setLookups({});
      setRules([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      if (masterAdmin && selectedTenantSlug) {
        const [itemsRes, lookupsRes, rulesRes] = await Promise.all([
          lookupsApi.listAllByTenant(selectedTenantSlug),
          lookupsApi.listByTenant(selectedTenantSlug),
          rulesApi.listByTenant(selectedTenantSlug),
        ]);
        setLookupItems(itemsRes.lookups);
        setLookups(lookupsRes.lookups);
        setRules(rulesRes.rules);
      } else if (user?.role === "ADMIN") {
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
  }, [user?.role, masterAdmin, selectedTenantSlug, toast]);

  useEffect(() => {
    if (masterAdmin) {
      tenantApi.list().then(res => setCompanies(res.tenants)).catch(() => setCompanies([]));
    }
  }, [masterAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  /** Atualiza só a lista de lookups (sem loading da página) para refletir rename/add/delete na hora. */
  const refreshLookups = useCallback(async () => {
    if (user?.role !== "ADMIN") return;
    try {
      if (masterAdmin && selectedTenantSlug) {
        const [itemsRes, lookupsRes] = await Promise.all([
          lookupsApi.listAllByTenant(selectedTenantSlug),
          lookupsApi.listByTenant(selectedTenantSlug),
        ]);
        setLookupItems(itemsRes.lookups);
        setLookups(lookupsRes.lookups);
      } else {
        const [itemsRes, lookupsRes] = await Promise.all([lookupsApi.listAll(), lookupsApi.list()]);
        setLookupItems(itemsRes.lookups);
        setLookups(lookupsRes.lookups);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao atualizar listas", "error");
    }
  }, [user?.role, masterAdmin, selectedTenantSlug, toast]);

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

  const showCompanyContent = masterAdmin ? !!selectedTenantSlug : true;
  const companyOptions = companies.map(c => ({ value: c.slug, label: `${c.name} (${c.slug})` }));

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-1">Configurações</h2>
        <p className="text-sm text-slate-600">
          {masterAdmin
            ? "Gerencie listas de valores e regras por empresa (selecione uma empresa abaixo)"
            : user?.role === "ADMIN"
              ? "Gerencie listas de valores e regras por área"
              : "Gerencie as regras de recorrência da sua área"}
        </p>
      </div>

      {masterAdmin && (
        <Card>
          <CardHeader title="Empresa" subtitle="Selecione a empresa para gerenciar listas e regras" />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedTenantSlug}
              onChange={e => setSelectedTenantSlug(e.target.value)}
              className="rounded-lg border-2 border-slate-400 bg-white px-3 py-2 text-sm font-medium text-slate-900 min-w-[200px] focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
            >
              <option value="">Selecione uma empresa</option>
              {companyOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </Card>
      )}

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

      {!showCompanyContent && masterAdmin && (
        <p className="text-sm text-slate-500 py-4">Selecione uma empresa acima para gerenciar listas de valores e regras por área.</p>
      )}

      {showCompanyContent && tab === "lookups" && user?.role === "ADMIN" && (
        <Card>
          <CardHeader
            title="Listas de Valores"
            subtitle={masterAdmin ? `Opções para a empresa selecionada (${companies.find(c => c.slug === selectedTenantSlug)?.name ?? selectedTenantSlug})` : "Gerencie as opções disponíveis nos formulários de tarefas"}
          />
          <LookupManager
            items={lookupItems}
            onRefresh={refreshLookups}
            onLookupRenamed={handleLookupRenamed}
            tenantSlug={masterAdmin ? selectedTenantSlug : undefined}
            companies={masterAdmin ? companies.map(c => ({ slug: c.slug, name: c.name })) : undefined}
          />
        </Card>
      )}

      {showCompanyContent && tab === "rules" && (
        <Card>
          <CardHeader
            title="Regras por Área"
            subtitle={
              masterAdmin
                ? `Defina quais recorrências cada área pode usar na empresa selecionada`
                : user?.role === "ADMIN"
                  ? "Defina quais recorrências são permitidas por área"
                  : `Defina as recorrências permitidas para a área: ${user?.area}`
            }
          />
          <RulesManager
            rules={rules}
            lookups={lookups}
            onRefresh={load}
            tenantSlug={masterAdmin ? selectedTenantSlug : undefined}
          />
        </Card>
      )}
    </div>
  );
}