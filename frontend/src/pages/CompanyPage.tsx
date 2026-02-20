import React, { useState, useEffect } from "react";
import { Building2, Save } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import { tenantApi } from "@/services/api";

export default function CompanyPage() {
  const { toast } = useToast();
  const { tenant, refreshSession } = useAuth();
  const [name, setName] = useState(tenant?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    tenantApi
      .current()
      .then((res) => {
        if (!cancelled) setName(res.tenant.name);
      })
      .catch(() => {
        if (!cancelled) toast("Erro ao carregar dados da empresa", "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  useEffect(() => {
    if (tenant?.name) setName(tenant.name);
  }, [tenant?.name]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast("Informe o nome da empresa", "error");
      return;
    }
    setSaving(true);
    try {
      await tenantApi.updateCurrent(trimmed);
      await refreshSession();
      toast("Empresa atualizada", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao salvar", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSpinner text="Carregando..." />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div className="flex items-center gap-3 text-slate-800">
        <div className="p-2 rounded-lg bg-brand-100 border border-brand-200">
          <Building2 size={24} className="text-brand-700" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Dados da empresa</h1>
          <p className="text-sm text-slate-500">
            Atualize as informações da sua empresa. A visibilidade dos usuários é por empresa.
          </p>
        </div>
      </div>

      <Card>
        <div className="space-y-4">
          <Input
            label="Nome da empresa"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Minha Empresa Ltda"
          />
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <p className="text-xs font-medium text-slate-500 mb-1">Identificador (URL)</p>
            <p className="text-sm font-mono text-slate-700">
              {tenant?.slug ? `@${tenant.slug}` : "—"}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              O identificador não pode ser alterado. Ele define o acesso por subdomínio ou parâmetro.
            </p>
          </div>
          <div className="flex justify-end pt-2">
            <Button
              icon={<Save size={16} />}
              onClick={handleSave}
              loading={saving}
              disabled={name.trim() === (tenant?.name ?? "")}
            >
              Salvar
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
