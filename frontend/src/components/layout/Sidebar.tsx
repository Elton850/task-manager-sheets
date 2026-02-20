import React from "react";
import { NavLink } from "react-router-dom";
import { useBasePath } from "@/contexts/BasePathContext";
import {
  LayoutDashboard,
  Calendar,
  BarChart2,
  Users,
  Building2,
  Settings,
  LogOut,
  ChevronLeft,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import Badge, { getRoleVariant } from "@/components/ui/Badge";
import logo from "@/assets/logo.jpeg";

interface SidebarProps {
  open: boolean;
  onToggle: () => void;
}

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
  roles?: string[];
  /** Mostrar apenas quando o tenant for "system" (administrador do sistema). */
  systemOnly?: boolean;
  /** Ocultar quando o tenant for "system". */
  notSystem?: boolean;
}

const navItems: NavItem[] = [
  { to: "/calendar", icon: <Calendar size={18} />, label: "Calendário" },
  { to: "/tasks", icon: <LayoutDashboard size={18} />, label: "Tarefas" },
  { to: "/performance", icon: <BarChart2 size={18} />, label: "Performance" },
  { to: "/users", icon: <Users size={18} />, label: "Usuários", roles: ["ADMIN", "LEADER"] },
  { to: "/empresas", icon: <Building2 size={18} />, label: "Cadastro de empresas", roles: ["ADMIN"], systemOnly: true },
  { to: "/empresa", icon: <Building2 size={18} />, label: "Empresa", roles: ["ADMIN"], notSystem: true },
  { to: "/admin", icon: <Settings size={18} />, label: "Configurações", roles: ["ADMIN", "LEADER"] },
];

export default function Sidebar({ open, onToggle }: SidebarProps) {
  const { user, tenant, logout } = useAuth();
  const basePath = useBasePath();
  const isSystemAdmin = tenant?.slug === "system" && user?.role === "ADMIN";

  const visibleItems = navItems.filter(item => {
    if (item.roles && !item.roles.includes(user?.role || "")) return false;
    if (item.systemOnly && !isSystemAdmin) return false;
    if (item.notSystem && isSystemAdmin) return false;
    return true;
  });

  return (
    <>
      {open && <div className="fixed inset-0 z-20 bg-slate-900/55 lg:hidden" onClick={onToggle} />}

      <aside
        className={`
        fixed top-0 left-0 h-full z-30 flex flex-col
        bg-white border-r border-slate-200
        transition-all duration-300 ease-in-out
        ${open ? "w-64" : "w-0 lg:w-64"}
        overflow-hidden
      `}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {!isSystemAdmin && (
              <div className="h-9 w-9 flex-shrink-0 rounded-lg border border-slate-200 overflow-hidden bg-white flex items-center justify-center p-0.5">
                <img src={logo} alt="Task Manager" className="w-full h-full object-contain" />
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-semibold text-brand-900 truncate">{tenant?.name || "Task Manager"}</div>
              <div className="text-xs text-slate-500 truncate">{tenant?.slug ? `@${tenant.slug}` : "v2.0"}</div>
            </div>
          </div>
          <button 
            onClick={onToggle} 
            className="text-slate-400 hover:text-slate-700 transition-colors lg:hidden ml-2"
            aria-label="Fechar menu"
            aria-expanded={open}
          >
            <ChevronLeft size={16} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleItems.map(item => (
            <NavLink
              key={item.to}
              to={`${basePath}${item.to}`}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium
                transition-all duration-150
                ${
                  isActive
                    ? "bg-brand-100 text-brand-900 border border-brand-200"
                    : "text-slate-600 hover:text-brand-900 hover:bg-slate-50 border border-transparent"
                }
              `}
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        {user && (
          <div className="px-3 pb-4 flex-shrink-0 border-t border-slate-200 pt-3">
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-50 mb-2">
              <div className="w-8 h-8 rounded-full bg-brand-100 border border-brand-200 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-brand-800">{user.nome.charAt(0).toUpperCase()}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-800 truncate">{user.nome}</p>
                <p className="text-xs text-slate-500 truncate">{user.area}</p>
              </div>
              <Badge variant={getRoleVariant(user.role)} size="sm">
                {user.role}
              </Badge>
            </div>
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-all"
            >
              <LogOut size={15} />
              Sair
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
