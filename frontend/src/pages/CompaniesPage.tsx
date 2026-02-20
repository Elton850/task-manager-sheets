import React, { useState, useEffect, useCallback, useRef } from "react";
import { Building2, Plus, RefreshCw, CheckCircle, XCircle, ImagePlus, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useToast } from "@/contexts/ToastContext";
import { tenantApi } from "@/services/api";
import type { TenantListItem } from "@/types";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result || "");
    };
    reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
    reader.readAsDataURL(file);
  });
}

export default function CompaniesPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ slug: "", name: "" });
  const [logoUploadingId, setLogoUploadingId] = useState<string | null>(null);
  const [logoRemovingId, setLogoRemovingId] = useState<string | null>(null);
  const [logoTargetId, setLogoTargetId] = useState<string | null>(null);
  const [logoVersion, setLogoVersion] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await tenantApi.list();
      setTenants(res.tenants);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao carregar empresas", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const slug = form.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    if (!slug || !form.name.trim()) {
      toast("Preencha o identificador e o nome da empresa.", "error");
      return;
    }
    setCreating(true);
    try {
      await tenantApi.create({ slug, name: form.name.trim() });
      toast("Empresa criada. Cadastre os usuários na aba Usuários.", "success");
      setForm({ slug: "", name: "" });
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao criar empresa", "error");
    } finally {
      setCreating(false);
    }
  };

  const triggerLogoUpload = (tenantId: string) => {
    setLogoTargetId(tenantId);
    fileInputRef.current?.click();
  };

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const tenantId = logoTargetId;
    e.target.value = "";
    setLogoTargetId(null);
    if (!file || !tenantId) return;
    const mime = file.type || "image/jpeg";
    if (!/^image\/(jpeg|png|gif|webp)$/i.test(mime)) {
      toast("Use uma imagem JPEG, PNG, GIF ou WebP.", "error");
      return;
    }
    setLogoUploadingId(tenantId);
    try {
      const contentBase64 = await fileToBase64(file);
      await tenantApi.uploadLogo(tenantId, { fileName: file.name, mimeType: mime, contentBase64 });
      setLogoVersion((v) => ({ ...v, [tenantId]: Date.now() }));
      toast("Logo atualizada.", "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao enviar logo", "error");
    } finally {
      setLogoUploadingId(null);
    }
  };

  const handleRemoveLogo = async (tenantId: string) => {
    setLogoRemovingId(tenantId);
    try {
      await tenantApi.removeLogo(tenantId);
      toast("Logo removida.", "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao remover logo", "error");
    } finally {
      setLogoRemovingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-slate-800">
        <div className="p-2 rounded-lg bg-brand-100 border border-brand-200">
          <Building2 size={24} className="text-brand-700" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Cadastro de empresas</h1>
          <p className="text-sm text-slate-500">
            Cadastre as empresas. Depois, cadastre os usuários (Líderes e Usuários) na aba Usuários e vincule cada um à empresa. Cada usuário acessa pelo link da sua empresa (ex.: site.com/empresax).
          </p>
        </div>
      </div>

      <Card>
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Nova empresa</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Identificador (slug)"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              placeholder="empresax"
            />
            <Input
              label="Nome da empresa"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Empresa X Ltda"
            />
          </div>
          <p className="text-xs text-slate-600">
            Os usuários serão cadastrados na aba Usuários. Cada um acessa pelo link: <strong>site.com/{form.slug.trim() || "slug"}</strong>
          </p>
          <Button type="submit" icon={<Plus size={16} />} loading={creating}>
            Cadastrar empresa
          </Button>
        </form>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-800">Empresas cadastradas</h2>
          <Button variant="ghost" size="sm" onClick={load} icon={<RefreshCw size={14} />}>
            Atualizar
          </Button>
        </div>
        {loading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={handleLogoFileChange}
            />
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase w-24">Logo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Nome</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Identificador</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {tenants.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {t.hasLogo ? (
                          <img
                            key={t.logoUpdatedAt ?? logoVersion[t.id] ?? t.id}
                            src={`/api/tenants/logo/${t.slug}?tenant=system&v=${encodeURIComponent(t.logoUpdatedAt || logoVersion[t.id] || "")}`}
                            alt=""
                            className="h-10 w-10 rounded-lg border border-slate-200 object-cover bg-white"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-lg border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center">
                            <Building2 size={18} className="text-slate-400" />
                          </div>
                        )}
                        <div className="flex flex-col gap-0.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => triggerLogoUpload(t.id)}
                            disabled={!!logoUploadingId}
                            loading={logoUploadingId === t.id}
                            icon={<ImagePlus size={12} />}
                          >
                            {t.hasLogo ? "Trocar" : "Enviar"}
                          </Button>
                          {t.hasLogo && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs h-7 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                              onClick={() => handleRemoveLogo(t.id)}
                              disabled={!!logoRemovingId}
                              loading={logoRemovingId === t.id}
                              icon={<Trash2 size={12} />}
                            >
                              Remover
                            </Button>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-800">{t.name}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 font-mono">@{t.slug}</td>
                    <td className="px-4 py-3">
                      {t.active ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium">
                          <CheckCircle size={14} /> Ativa
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500 font-medium">
                          <XCircle size={14} /> Inativa
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tenants.length === 0 && (
              <div className="text-center py-8 text-slate-500 text-sm">
                Nenhuma empresa cadastrada. Use o formulário acima para cadastrar a primeira.
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
