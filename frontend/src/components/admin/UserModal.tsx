import React, { useState, useEffect } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { lookupsApi } from "@/services/api";
import type { User, Lookups } from "@/types";

interface UserModalProps {
  open: boolean;
  user?: User | null;
  lookups: Lookups;
  companyName?: string;
  /** Admin Mestre: lista de empresas para vincular o novo usuário */
  companies?: { slug: string; name: string }[];
  onClose: () => void;
  onSave: (data: Partial<User> & { tenantSlug?: string }) => Promise<void>;
  loading?: boolean;
}

export default function UserModal({ open, user, lookups, companyName, companies, onClose, onSave, loading }: UserModalProps) {
  const isEdit = !!user;

  const [form, setForm] = useState({
    nome: user?.nome || "",
    email: user?.email || "",
    role: user?.role || "USER",
    area: user?.area || "",
    canDelete: user?.canDelete || false,
    tenantSlug: (user as User & { tenantSlug?: string })?.tenantSlug || "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  /** Lookups da empresa selecionada (Admin Mestre criando/editando usuário de empresa) */
  const [companyLookups, setCompanyLookups] = useState<Lookups | null>(null);

  useEffect(() => {
    if (open) {
      setForm({
        nome: user?.nome || "",
        email: user?.email || "",
        role: user?.role || "USER",
        area: user?.area || "",
        canDelete: user?.canDelete || false,
        tenantSlug: (user as User & { tenantSlug?: string })?.tenantSlug || "",
      });
      setErrors({});
      setCompanyLookups(null);
    }
  }, [open, user]);

  /** Carrega áreas da empresa quando Admin Mestre seleciona uma empresa (criar/editar usuário). */
  useEffect(() => {
    if (!open || !form.tenantSlug || form.tenantSlug === "system" || !companies?.length) {
      setCompanyLookups(null);
      return;
    }
    let cancelled = false;
    lookupsApi.listByTenant(form.tenantSlug).then((res) => {
      if (!cancelled) setCompanyLookups(res.lookups);
    }).catch(() => {
      if (!cancelled) setCompanyLookups({});
    });
    return () => { cancelled = true; };
  }, [open, form.tenantSlug, companies?.length]);

  const set = (field: string, value: string | boolean) => {
    setForm(f => ({ ...f, [field]: value }));
    if (errors[field]) setErrors(e => ({ ...e, [field]: "" }));
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.nome.trim()) errs.nome = "Nome é obrigatório";
    if (!isEdit && !form.email.trim()) errs.email = "Email é obrigatório";
    if (!isEdit && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = "Email inválido";
    if (!form.role) errs.role = "Função é obrigatória";
    if (!form.area) errs.area = "Área é obrigatória";
    if (!isEdit && companies && companies.length > 0 && !form.tenantSlug) errs.tenantSlug = "Selecione a empresa";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    const payload: Partial<User> & { tenantSlug?: string } = { nome: form.nome, email: form.email, role: form.role as User["role"], area: form.area, canDelete: form.canDelete };
    if (!isEdit && form.tenantSlug) payload.tenantSlug = form.tenantSlug;
    await onSave(payload);
  };

  const areasForOptions = (companyLookups?.AREA ?? lookups.AREA ?? []);
  const areaOptions = areasForOptions.map(v => ({ value: v, label: v }));
  const isCompanyUser = companies && form.tenantSlug && form.tenantSlug !== "system";
  const roleOptions = isCompanyUser
    ? [
        { value: "USER", label: "Usuário" },
        { value: "LEADER", label: "Líder" },
      ]
    : [
        { value: "USER", label: "Usuário" },
        { value: "LEADER", label: "Líder" },
        { value: "ADMIN", label: "Administrador" },
      ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar Usuário" : "Novo Usuário"}
      subtitle={isEdit ? `Editando: ${user?.email}` : "O usuário receberá um código de acesso inicial"}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={loading}>
            {isEdit ? "Salvar" : "Criar usuário"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {companyName && !companies?.length && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
            <p className="text-xs font-medium text-slate-500 mb-0.5">Empresa</p>
            <p className="text-sm font-medium text-slate-800">{companyName}</p>
            <p className="text-xs text-slate-500 mt-0.5">O usuário será vinculado a esta empresa.</p>
          </div>
        )}
        {!isEdit && companies && companies.length > 0 && (
          <Select
            label="Empresa"
            required
            value={form.tenantSlug}
            onChange={(e) => set("tenantSlug", e.target.value)}
            options={companies.map((c) => ({ value: c.slug, label: c.name }))}
            placeholder="Selecione a empresa"
            error={errors.tenantSlug}
          />
        )}
        <Input
          label="Nome completo"
          required
          value={form.nome}
          onChange={e => set("nome", e.target.value)}
          placeholder="Nome do usuário"
          error={errors.nome}
        />

        {!isEdit && (
          <Input
            label="Email"
            required
            type="email"
            value={form.email}
            onChange={e => set("email", e.target.value)}
            placeholder="email@empresa.com"
            error={errors.email}
          />
        )}

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Função"
            required
            value={form.role}
            onChange={e => set("role", e.target.value)}
            options={roleOptions}
            error={errors.role}
          />
          <Select
            label="Área"
            required
            value={form.area}
            onChange={e => set("area", e.target.value)}
            options={areaOptions}
            placeholder="Selecione..."
            error={errors.area}
          />
        </div>

        <div className="flex items-start gap-3 p-4 rounded-lg bg-emerald-50 border border-emerald-200">
          <div className="flex items-center h-5 mt-0.5">
            <input
              type="checkbox"
              id="can-delete"
              checked={form.canDelete}
              onChange={e => set("canDelete", e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 focus:ring-2 cursor-pointer"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="can-delete" className="text-sm font-medium text-slate-800 cursor-pointer block">
              Pode excluir tarefas
            </label>
            <p className="text-xs text-slate-600 mt-0.5">Permite que este usuário exclua suas próprias tarefas</p>
          </div>
        </div>

        {!isEdit && (
          <div className="p-3 rounded-lg bg-brand-50 border border-brand-200">
            <p className="text-xs text-brand-800">
              Após criar o usuário, use "Gerar código de acesso" para enviar a ele um código temporário para definir sua senha.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
