import React, { useState, useEffect, useCallback } from "react";
import { FileText, RefreshCw } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useToast } from "@/contexts/ToastContext";
import { systemApi, tenantApi } from "@/services/api";
import type { TenantListItem } from "@/types";

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function getYmOptions() {
  const options: { value: string; label: string }[] = [];
  for (let i = -6; i <= 0; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() + i);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
    options.push({ value: ym, label });
  }
  return options;
}

export default function SystemLogsPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<{ loggedAt: string; tenantSlug: string; tenantName: string; userEmail: string; userName: string }[]>([]);
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromYm, setFromYm] = useState("");
  const [toYm, setToYm] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");

  const loadTenants = useCallback(async () => {
    try {
      const res = await tenantApi.list();
      setTenants(res.tenants);
    } catch {
      setTenants([]);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await systemApi.loginLogs({
        from: fromYm || undefined,
        to: toYm || undefined,
        tenant: tenantSlug || undefined,
        limit: 200,
      });
      setItems(res.items);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao carregar logs", "error");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [fromYm, toYm, tenantSlug, toast]);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Logs de acesso</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Registro de logins no sistema. Filtre por período e empresa.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={loadLogs} disabled={loading}>
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Atualizar
        </Button>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">De (competência)</label>
            <select
              value={fromYm}
              onChange={e => setFromYm(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            >
              <option value="">Todas</option>
              {getYmOptions().map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Até (competência)</label>
            <select
              value={toYm}
              onChange={e => setToYm(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            >
              <option value="">Todas</option>
              {getYmOptions().map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Empresa</label>
            <select
              value={tenantSlug}
              onChange={e => setTenantSlug(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 min-w-[180px]"
            >
              <option value="">Todas</option>
              {tenants.map(t => (
                <option key={t.id} value={t.slug}>{t.name} ({t.slug})</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center">
            <LoadingSpinner text="Carregando logs..." />
          </div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-slate-500">
            <FileText className="mx-auto h-10 w-10 text-slate-300 mb-2" />
            <p>Nenhum registro encontrado para os filtros selecionados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="pb-3 pr-4">Data e hora</th>
                  <th className="pb-3 pr-4">Empresa</th>
                  <th className="pb-3 pr-4">Usuário</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((log, i) => (
                  <tr key={`${log.loggedAt}-${log.userEmail}-${i}`} className="hover:bg-slate-50/70">
                    <td className="py-3 pr-4 text-slate-700 whitespace-nowrap">{formatDateTime(log.loggedAt)}</td>
                    <td className="py-3 pr-4">
                      <span className="font-medium text-slate-800">{log.tenantName}</span>
                      <span className="text-slate-500 text-xs ml-1">({log.tenantSlug})</span>
                    </td>
                    <td className="py-3 pr-4 text-slate-700">{log.userName} ({log.userEmail})</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
