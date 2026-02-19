import React, { useState, useEffect } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import type { User, Lookups } from "@/types";

interface UserModalProps {
  open: boolean;
  user?: User | null;
  lookups: Lookups;
  onClose: () => void;
  onSave: (data: Partial<User>) => Promise<void>;
  loading?: boolean;
}

export default function UserModal({ open, user, lookups, onClose, onSave, loading }: UserModalProps) {
  const isEdit = !!user;

  const [form, setForm] = useState({
    nome: user?.nome || "",
    email: user?.email || "",
    role: user?.role || "USER",
    area: user?.area || "",
    canDelete: user?.canDelete || false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setForm({
        nome: user?.nome || "",
        email: user?.email || "",
        role: user?.role || "USER",
        area: user?.area || "",
        canDelete: user?.canDelete || false,
      });
      setErrors({});
    }
  }, [open, user]);

  const set = (field: string, value: string | boolean) => {
    setForm(f => ({ ...f, [field]: value }));
    if (errors[field]) setErrors(e => ({ ...e, [field]: "" }));
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.nome.trim()) errs.nome = "Nome é obrigatório";
    if (!isEdit && !form.email.trim()) errs.email = "Email é obrigatório";
    if (!isEdit && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = "Email inválido";
    if (!form.role) errs.role = "Role é obrigatório";
    if (!form.area) errs.area = "Área é obrigatória";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    await onSave(form as Partial<User>);
  };

  const areaOptions = (lookups.AREA || []).map(v => ({ value: v, label: v }));
  const roleOptions = [
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
