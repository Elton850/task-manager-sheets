import React, { useState, useEffect, useCallback } from "react";
import { Plus, RefreshCw, UserCheck, UserX, Key, Edit2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Badge, { getRoleVariant } from "@/components/ui/Badge";
import UserModal from "@/components/admin/UserModal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/contexts/ToastContext";
import { usersApi, lookupsApi, authApi } from "@/services/api";
import type { User, Lookups } from "@/types";

export default function UsersPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [lookups, setLookups] = useState<Lookups>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);

  const [toggleTarget, setToggleTarget] = useState<User | null>(null);
  const [toggling, setToggling] = useState(false);

  const [resetUser, setResetUser] = useState<User | null>(null);
  const [resetCode, setResetCode] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, lookupsRes] = await Promise.all([usersApi.listAll(), lookupsApi.list()]);
      setUsers(usersRes.users);
      setLookups(lookupsRes.lookups);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao carregar", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = users.filter(u => {
    if (!search) return true;
    const s = search.toLowerCase();
    return u.nome.toLowerCase().includes(s) || u.email.toLowerCase().includes(s) || u.area.toLowerCase().includes(s);
  });

  const handleSave = async (data: Partial<User>) => {
    setSaving(true);
    try {
      if (editUser) {
        await usersApi.update(editUser.id, data);
        toast("Usuário atualizado", "success");
      } else {
        await usersApi.create(data);
        toast("Usuário criado. Gere um código de acesso para ele.", "success");
      }
      await load();
      setModalOpen(false);
      setEditUser(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao salvar", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!toggleTarget) return;
    setToggling(true);
    try {
      await usersApi.toggleActive(toggleTarget.id);
      await load();
      toast(`Usuário ${toggleTarget.active ? "desativado" : "ativado"}`, "success");
      setToggleTarget(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro", "error");
    } finally {
      setToggling(false);
    }
  };

  const handleGenerateReset = async () => {
    if (!resetUser) return;
    setResetting(true);
    try {
      const { code } = await authApi.generateReset(resetUser.email);
      setResetCode(code);
      toast("Código gerado!", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao gerar código", "error");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 max-w-xs">
          <Input placeholder="Buscar usuários..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={load} icon={<RefreshCw size={14} />} />
          <Button size="sm" icon={<Plus size={15} />} onClick={() => { setEditUser(null); setModalOpen(true); }}>
            Novo usuário
          </Button>
        </div>
      </div>

      <Card padding={false}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <LoadingSpinner text="Carregando usuários..." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-100">
                <tr>
                  {["Usuário", "Email", "Função", "Área", "Status", "Ações"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {filtered.map(u => (
                  <tr key={u.id} className={`hover:bg-slate-50 transition-colors ${!u.active ? "opacity-60" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand-100 border border-brand-200 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-brand-800">{u.nome.charAt(0).toUpperCase()}</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-800">{u.nome}</p>
                          {u.canDelete && (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium mt-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Pode excluir
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{u.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant={getRoleVariant(u.role)}>
                        {u.role === "ADMIN" ? "Administrador" : u.role === "LEADER" ? "Líder" : "Usuário"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{u.area}</td>
                    <td className="px-4 py-3">
                      <Badge variant={u.active ? "green" : "slate"}>{u.active ? "Ativo" : "Inativo"}</Badge>
                      {u.mustChangePassword && <div className="text-xs text-amber-700 mt-0.5">Aguardando senha</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => { setEditUser(u); setModalOpen(true); }} title="Editar">
                          <Edit2 size={13} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setResetUser(u); setResetCode(null); }}
                          title="Gerar código de acesso"
                          className="hover:text-amber-700 hover:bg-amber-50"
                        >
                          <Key size={13} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setToggleTarget(u)}
                          title={u.active ? "Desativar" : "Ativar"}
                          className={u.active ? "hover:text-rose-700 hover:bg-rose-50" : "hover:text-emerald-700 hover:bg-emerald-50"}
                        >
                          {u.active ? <UserX size={13} /> : <UserCheck size={13} />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="text-center py-12 text-slate-500 text-sm">
                {search ? "Nenhum usuário encontrado" : "Nenhum usuário cadastrado"}
              </div>
            )}
          </div>
        )}
      </Card>

      <UserModal
        open={modalOpen}
        user={editUser}
        lookups={lookups}
        onClose={() => { setModalOpen(false); setEditUser(null); }}
        onSave={handleSave}
        loading={saving}
      />

      <ConfirmDialog
        open={!!toggleTarget}
        title={toggleTarget?.active ? "Desativar usuário" : "Ativar usuário"}
        message={`Deseja ${toggleTarget?.active ? "desativar" : "ativar"} o usuário "${toggleTarget?.nome}"?`}
        confirmLabel={toggleTarget?.active ? "Desativar" : "Ativar"}
        variant={toggleTarget?.active ? "danger" : "primary"}
        loading={toggling}
        onConfirm={handleToggleActive}
        onCancel={() => setToggleTarget(null)}
      />

      <Modal
        open={!!resetUser}
        onClose={() => { setResetUser(null); setResetCode(null); }}
        title="Código de acesso"
        subtitle={resetUser?.email}
        size="sm"
        footer={
          resetCode ? (
            <Button onClick={() => { setResetUser(null); setResetCode(null); }}>Fechar</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setResetUser(null)}>Cancelar</Button>
              <Button onClick={handleGenerateReset} loading={resetting}>Gerar código</Button>
            </>
          )
        }
      >
        {resetCode ? (
          <div className="text-center">
            <p className="text-sm text-slate-600 mb-3">Código gerado (válido por 30 minutos):</p>
            <div className="inline-block px-6 py-3 rounded-xl bg-brand-50 border border-brand-200">
              <span className="text-2xl font-mono font-bold tracking-[0.3em] text-brand-800">{resetCode}</span>
            </div>
            <p className="text-xs text-slate-500 mt-3">Envie este código ao usuário para que ele possa definir sua senha.</p>
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            Gerar um código temporário para "{resetUser?.nome}".
            <br />
            O usuário precisará informar este código ao fazer login para definir uma nova senha.
          </p>
        )}
      </Modal>
    </div>
  );
}