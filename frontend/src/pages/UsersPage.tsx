import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus,
  RefreshCw,
  UserCheck,
  UserX,
  Key,
  Edit2,
  Search,
  Users,
  LogIn,
  Building2,
  UserCog,
  Filter,
  Eye,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { setTenantSlug } from "@/services/api";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Badge, { getRoleVariant } from "@/components/ui/Badge";
import UserModal from "@/components/admin/UserModal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import { usersApi, lookupsApi, authApi, tenantApi } from "@/services/api";
import type { User, Lookups, UserFilters } from "@/types";

function getDefaultFrom(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 2);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getDefaultTo(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const DEFAULT_FILTERS: UserFilters = {
  search: "",
  area: "",
  role: "",
  status: "",
  tenantSlug: "",
  from: getDefaultFrom(),
  to: getDefaultTo(),
};

const ROLE_OPTIONS = [
  { value: "", label: "Todas as funções" },
  { value: "ADMIN", label: "Administrador" },
  { value: "LEADER", label: "Líder" },
  { value: "USER", label: "Usuário" },
];

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "active", label: "Ativos" },
  { value: "inactive", label: "Inativos" },
];

function getYmOptions() {
  const options = [];
  for (let i = -12; i <= 3; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() + i);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
    options.push({ value: ym, label });
  }
  return options;
}

export default function UsersPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user: authUser, tenant, startImpersonation } = useAuth();
  const isAdmin = authUser?.role === "ADMIN";
  const isMasterAdmin = tenant?.slug === "system" && authUser?.role === "ADMIN";

  const [users, setUsers] = useState<User[]>([]);
  const [tenants, setTenants] = useState<{ id: string; slug: string; name: string }[]>([]);
  const [lookups, setLookups] = useState<Lookups>({});
  const [loginCounts, setLoginCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<UserFilters>({ ...DEFAULT_FILTERS });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);

  const [toggleTarget, setToggleTarget] = useState<User | null>(null);
  const [toggling, setToggling] = useState(false);

  const [resetUser, setResetUser] = useState<User | null>(null);
  const [resetCode, setResetCode] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const [bulkInactivateTarget, setBulkInactivateTarget] = useState<number | null>(null);
  const [bulkReactivateTarget, setBulkReactivateTarget] = useState<number | null>(null);
  const [bulking, setBulking] = useState(false);
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);

  const set = (field: keyof UserFilters, value: string) =>
    setFilters((f) => ({ ...f, [field]: value }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, lookupsRes] = await Promise.all([
        usersApi.listAll(isMasterAdmin ? (filters.tenantSlug || undefined) : undefined),
        lookupsApi.list(),
      ]);
      setUsers(usersRes.users);
      setLookups(lookupsRes.lookups);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao carregar", "error");
    } finally {
      setLoading(false);
    }
  }, [toast, isMasterAdmin, filters.tenantSlug]);

  useEffect(() => {
    if (isMasterAdmin) {
      tenantApi.list().then((r) => setTenants(r.tenants.map((t) => ({ id: t.id, slug: t.slug, name: t.name })))).catch(() => {});
    }
  }, [isMasterAdmin]);

  const loadLoginCounts = useCallback(async () => {
    if (!filters.from || !filters.to) return;
    try {
      const { counts } = await usersApi.getLoginCounts(filters.from, filters.to);
      setLoginCounts(counts);
    } catch {
      setLoginCounts({});
    }
  }, [filters.from, filters.to]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadLoginCounts();
  }, [loadLoginCounts]);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (filters.search) {
        const s = filters.search.toLowerCase();
        if (
          !u.nome.toLowerCase().includes(s) &&
          !u.email.toLowerCase().includes(s) &&
          !u.area.toLowerCase().includes(s)
        )
          return false;
      }
      if (filters.area && u.area !== filters.area) return false;
      if (filters.role && u.role !== filters.role) return false;
      if (filters.status === "active" && !u.active) return false;
      if (filters.status === "inactive" && u.active) return false;
      return true;
    });
  }, [users, filters.search, filters.area, filters.role, filters.status]);

  const activeFiltered = useMemo(
    () => filtered.filter((u) => u.active),
    [filtered]
  );
  const inactiveFiltered = useMemo(
    () => filtered.filter((u) => !u.active),
    [filtered]
  );
  const totalLoginsInPeriod = useMemo(
    () =>
      filtered.reduce((acc, u) => acc + (loginCounts[u.id] ?? 0), 0),
    [filtered, loginCounts]
  );
  const usersWithLoginInPeriod = useMemo(
    () => filtered.filter((u) => (loginCounts[u.id] ?? 0) > 0).length,
    [filtered, loginCounts]
  );

  const selectedActiveCount = useMemo(
    () => filtered.filter((u) => selectedIds.has(u.id) && u.active).length,
    [filtered, selectedIds]
  );
  const selectedInactiveCount = useMemo(
    () => filtered.filter((u) => selectedIds.has(u.id) && !u.active).length,
    [filtered, selectedIds]
  );

  const toggleSelectAll = () => {
    if (!isAdmin) return;
    if (selectedIds.size >= filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((u) => u.id)));
    }
  };
  const toggleSelectAllActive = () => {
    if (!isAdmin) return;
    const activeIds = new Set(activeFiltered.map((u) => u.id));
    if (selectedIds.size === activeFiltered.length && activeFiltered.every((u) => selectedIds.has(u.id))) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        activeIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => new Set([...prev, ...activeIds]));
    }
  };
  const toggleSelectAllInactive = () => {
    if (!isAdmin) return;
    const inactiveIds = new Set(inactiveFiltered.map((u) => u.id));
    if (selectedIds.size >= inactiveFiltered.length && inactiveFiltered.every((u) => selectedIds.has(u.id))) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        inactiveIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => new Set([...prev, ...inactiveIds]));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async (data: Partial<User> & { tenantSlug?: string }) => {
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
      toast(
        `Usuário ${toggleTarget.active ? "desativado" : "ativado"}`,
        "success"
      );
      setToggleTarget(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(toggleTarget.id);
        return next;
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro", "error");
    } finally {
      setToggling(false);
    }
  };

  const handleBulkInactivate = async () => {
    const ids = filtered.filter((u) => selectedIds.has(u.id) && u.active).map((u) => u.id);
    if (ids.length === 0) return;
    setBulking(true);
    try {
      const { updated } = await usersApi.bulkToggleActive(ids, false);
      await load();
      toast(`${updated} usuário(s) inativado(s)`, "success");
      setSelectedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      setBulkInactivateTarget(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro na inativação em massa", "error");
    } finally {
      setBulking(false);
    }
  };

  const handleBulkReactivate = async () => {
    const ids = filtered.filter((u) => selectedIds.has(u.id) && !u.active).map((u) => u.id);
    if (ids.length === 0) return;
    setBulking(true);
    try {
      const { updated } = await usersApi.bulkToggleActive(ids, true);
      await load();
      toast(`${updated} usuário(s) reativado(s)`, "success");
      setSelectedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      setBulkReactivateTarget(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro na reativação em massa", "error");
    } finally {
      setBulking(false);
    }
  };

  const handleViewAs = async (u: User) => {
    if (!isMasterAdmin) return;
    setImpersonatingId(u.id);
    try {
      const { tenant: targetTenant } = await startImpersonation(u.id);
      setTenantSlug(targetTenant.slug);
      navigate(`/${targetTenant.slug}/calendar`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao acessar como usuário", "error");
    } finally {
      setImpersonatingId(null);
    }
  };

  const handleGenerateReset = async () => {
    if (!resetUser) return;
    setResetting(true);
    try {
      const { code } = await authApi.generateReset(resetUser.email, resetUser.tenantSlug);
      setResetCode(code);
      toast("Código gerado!", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao gerar código", "error");
    } finally {
      setResetting(false);
    }
  };

  const areaOptions = useMemo(() => {
    const areas = lookups.AREA || [];
    return [
      { value: "", label: "Todas as áreas" },
      ...areas.map((a) => ({ value: a, label: a })),
    ];
  }, [lookups.AREA]);

  const ymOptions = useMemo(() => getYmOptions(), []);

  return (
    <div className="space-y-4">
      {/* Filtros e período */}
      <Card>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1 min-w-0">
              <label className="block text-sm font-medium text-slate-700 mb-1">Buscar</label>
              <Input
                placeholder="Nome, email ou área..."
                value={filters.search}
                onChange={(e) => set("search", e.target.value)}
                leftIcon={<Search size={15} />}
                className="min-w-0"
              />
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={load}
                icon={<RefreshCw size={14} />}
                title="Atualizar"
              />
              {isAdmin && (
                <Button
                  size="sm"
                  icon={<Plus size={15} />}
                  onClick={() => {
                    setEditUser(null);
                    setModalOpen(true);
                  }}
                >
                  Novo usuário
                </Button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="min-w-0">
              <label className="block text-sm font-medium text-slate-700 mb-1">Área</label>
              <Select
                options={areaOptions}
                value={filters.area}
                onChange={(e) => set("area", e.target.value)}
                placeholder="Todas as áreas"
                className="w-full min-w-0"
              />
            </div>
            <div className="min-w-0">
              <label className="block text-sm font-medium text-slate-700 mb-1">Função</label>
              <Select
                options={ROLE_OPTIONS}
                value={filters.role}
                onChange={(e) => set("role", e.target.value)}
                className="w-full min-w-0"
              />
            </div>
            <div className="min-w-0">
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <Select
                options={STATUS_OPTIONS}
                value={filters.status}
                onChange={(e) => set("status", e.target.value)}
                className="w-full min-w-0"
              />
            </div>
            {isMasterAdmin && (
              <div className="min-w-0">
                <label className="block text-sm font-medium text-slate-700 mb-1">Empresa</label>
                <Select
                  options={[
                    { value: "", label: "Todas" },
                    ...tenants.map((t) => ({ value: t.slug, label: t.name })),
                  ]}
                  value={filters.tenantSlug}
                  onChange={(e) => set("tenantSlug", e.target.value)}
                  className="w-full min-w-0"
                />
              </div>
            )}
            <div className="min-w-0 flex items-end gap-2">
              <div className="flex-1 min-w-0">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  <span className="inline-flex items-center gap-1">
                    <Filter size={14} />
                    Período (logins)
                  </span>
                </label>
                <div className="flex gap-2">
                  <Select
                    options={ymOptions}
                    value={filters.from}
                    onChange={(e) => set("from", e.target.value)}
                    placeholder="De"
                    className="flex-1 min-w-0"
                  />
                  <Select
                    options={ymOptions}
                    value={filters.to}
                    onChange={(e) => set("to", e.target.value)}
                    placeholder="Até"
                    className="flex-1 min-w-0"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Cards indicadores (adaptados ao período/filtro) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-slate-100 border border-slate-300 rounded-xl p-4">
          <div className="text-slate-700 mb-2">
            <Users size={18} />
          </div>
          <div className="text-2xl font-bold text-slate-700">{filtered.length}</div>
          <div className="text-xs text-slate-600 mt-0.5 font-medium">
            Usuários (filtro)
          </div>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
          <div className="text-emerald-600 mb-2">
            <UserCheck size={18} />
          </div>
          <div className="text-2xl font-bold text-emerald-700">{activeFiltered.length}</div>
          <div className="text-xs text-slate-600 mt-0.5 font-medium">Ativos</div>
        </div>
        <div className="bg-slate-200/80 border border-slate-400/30 rounded-xl p-4">
          <div className="text-slate-600 mb-2">
            <UserX size={18} />
          </div>
          <div className="text-2xl font-bold text-slate-700">{inactiveFiltered.length}</div>
          <div className="text-xs text-slate-600 mt-0.5 font-medium">Inativos</div>
        </div>
        <div className="bg-brand-500/10 border border-brand-500/20 rounded-xl p-4">
          <div className="text-brand-600 mb-2">
            <LogIn size={18} />
          </div>
          <div className="text-2xl font-bold text-brand-700">{totalLoginsInPeriod}</div>
          <div className="text-xs text-slate-600 mt-0.5 font-medium">
            Logins no período
          </div>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
          <div className="text-amber-600 mb-2">
            <UserCog size={18} />
          </div>
          <div className="text-2xl font-bold text-amber-700">
            {usersWithLoginInPeriod}
          </div>
          <div className="text-xs text-slate-600 mt-0.5 font-medium">
            Acessaram no período
          </div>
        </div>
      </div>

      {/* Ações em massa (só ADMIN) */}
      {isAdmin && filtered.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleSelectAll}
            className={selectedIds.size >= filtered.length ? "bg-brand-100 border-brand-300" : ""}
          >
            {selectedIds.size >= filtered.length ? "Desmarcar todos" : `Selecionar todos (${filtered.length})`}
          </Button>
          {activeFiltered.length > 0 && (
            <Button variant="outline" size="sm" onClick={toggleSelectAllActive}>
              {activeFiltered.every((u) => selectedIds.has(u.id))
                ? "Desmarcar ativos"
                : `Selecionar ativos (${activeFiltered.length})`}
            </Button>
          )}
          {inactiveFiltered.length > 0 && (
            <Button variant="outline" size="sm" onClick={toggleSelectAllInactive}>
              {inactiveFiltered.every((u) => selectedIds.has(u.id))
                ? "Desmarcar inativos"
                : `Selecionar inativos (${inactiveFiltered.length})`}
            </Button>
          )}
          {selectedActiveCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-rose-700 border-rose-300 hover:bg-rose-50"
              onClick={() => setBulkInactivateTarget(selectedActiveCount)}
            >
              Inativar selecionados ({selectedActiveCount})
            </Button>
          )}
          {selectedInactiveCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-emerald-700 border-emerald-300 hover:bg-emerald-50"
              onClick={() => setBulkReactivateTarget(selectedInactiveCount)}
            >
              Reativar selecionados ({selectedInactiveCount})
            </Button>
          )}
        </div>
      )}

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
                  {isAdmin && (
                    <th className="px-4 py-3 text-left w-10">
                      <span className="sr-only">Selecionar</span>
                    </th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Empresa
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Usuário
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Função
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Área
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Logins (período)
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {filtered.map((u) => (
                  <tr
                    key={u.id}
                    className={`hover:bg-slate-50 transition-colors ${
                      !u.active ? "opacity-60" : ""
                    }`}
                  >
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(u.id)}
                          onChange={() => toggleSelectOne(u.id)}
                          className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          aria-label={u.nome}
                        />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-sm text-slate-700">
                        <Building2 size={14} className="text-slate-400 flex-shrink-0" />
                        {(u.tenantName ?? tenant?.name) || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand-100 border border-brand-200 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-brand-800">
                            {u.nome.charAt(0).toUpperCase()}
                          </span>
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
                        {u.role === "ADMIN"
                          ? "Administrador"
                          : u.role === "LEADER"
                            ? "Líder"
                            : "Usuário"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{u.area}</td>
                    <td className="px-4 py-3">
                      <Badge variant={u.active ? "green" : "slate"}>
                        {u.active ? "Ativo" : "Inativo"}
                      </Badge>
                      {u.mustChangePassword && (
                        <div className="text-xs text-amber-700 mt-0.5">
                          Aguardando senha
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-slate-700">
                        {filters.from && filters.to
                          ? loginCounts[u.id] ?? 0
                          : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {isMasterAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewAs(u)}
                            disabled={!!impersonatingId}
                            loading={impersonatingId === u.id}
                            title="Ver como este usuário (somente leitura)"
                            className="hover:text-brand-700 hover:bg-brand-50"
                          >
                            <Eye size={13} />
                          </Button>
                        )}
                        {isAdmin && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditUser(u);
                                setModalOpen(true);
                              }}
                              title="Editar"
                            >
                              <Edit2 size={13} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setResetUser(u);
                                setResetCode(null);
                              }}
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
                              className={
                                u.active
                                  ? "hover:text-rose-700 hover:bg-rose-50"
                                  : "hover:text-emerald-700 hover:bg-emerald-50"
                              }
                            >
                              {u.active ? (
                                <UserX size={13} />
                              ) : (
                                <UserCheck size={13} />
                              )}
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="text-center py-12 text-slate-500 text-sm">
                {filters.search || filters.area || filters.role || filters.status
                  ? "Nenhum usuário encontrado com os filtros aplicados"
                  : "Nenhum usuário cadastrado"}
              </div>
            )}
          </div>
        )}
      </Card>

      <UserModal
        open={modalOpen}
        user={editUser}
        lookups={lookups}
        companyName={!isMasterAdmin ? tenant?.name : undefined}
        companies={isMasterAdmin ? tenants : undefined}
        onClose={() => {
          setModalOpen(false);
          setEditUser(null);
        }}
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

      <ConfirmDialog
        open={bulkInactivateTarget !== null}
        title="Inativar usuários em massa"
        message={`Deseja inativar ${bulkInactivateTarget} usuário(s) selecionado(s)? Eles não poderão mais acessar o sistema até serem reativados.`}
        confirmLabel="Inativar"
        variant="danger"
        loading={bulking}
        onConfirm={handleBulkInactivate}
        onCancel={() => setBulkInactivateTarget(null)}
      />

      <ConfirmDialog
        open={bulkReactivateTarget !== null}
        title="Reativar usuários em massa"
        message={`Deseja reativar ${bulkReactivateTarget} usuário(s) selecionado(s)? Eles voltarão a poder acessar o sistema.`}
        confirmLabel="Reativar"
        variant="primary"
        loading={bulking}
        onConfirm={handleBulkReactivate}
        onCancel={() => setBulkReactivateTarget(null)}
      />

      <Modal
        open={!!resetUser}
        onClose={() => {
          setResetUser(null);
          setResetCode(null);
        }}
        title="Código de acesso"
        subtitle={resetUser?.email}
        size="sm"
        footer={
          resetCode ? (
            <Button
              onClick={() => {
                setResetUser(null);
                setResetCode(null);
              }}
            >
              Fechar
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setResetUser(null)}>
                Cancelar
              </Button>
              <Button onClick={handleGenerateReset} loading={resetting}>
                Gerar código
              </Button>
            </>
          )
        }
      >
        {resetCode ? (
          <div className="text-center">
            <p className="text-sm text-slate-600 mb-3">
              Código gerado (válido por 30 minutos):
            </p>
            <div className="inline-block px-6 py-3 rounded-xl bg-brand-50 border border-brand-200">
              <span className="text-2xl font-mono font-bold tracking-[0.3em] text-brand-800">
                {resetCode}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-3">
              Envie este código ao usuário para que ele possa definir sua senha.
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            Gerar um código temporário para &quot;{resetUser?.nome}&quot;.
            <br />
            O usuário precisará informar este código ao fazer login para definir
            uma nova senha.
          </p>
        )}
      </Modal>
    </div>
  );
}
