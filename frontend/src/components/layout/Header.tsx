import React from "react";
import { useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import logo from "@/assets/logo.jpeg";

interface HeaderProps {
  onMenuToggle: () => void;
}

const PAGE_TITLES: Record<string, string> = {
  "/tasks": "Tarefas",
  "/calendar": "Calendário",
  "/performance": "Performance",
  "/users": "Usuários",
  "/admin": "Configurações",
  "/empresas": "Cadastro de empresas",
  "/empresa": "Empresa",
};

export default function Header({ onMenuToggle }: HeaderProps) {
  const location = useLocation();
  const lastSegment = location.pathname.split("/").filter(Boolean).pop() || "";
  const title = PAGE_TITLES["/" + lastSegment] || "Task Manager";

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between px-4 lg:px-6 py-3 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onMenuToggle}
          className="text-slate-500 hover:text-slate-900 transition-colors p-1 rounded-lg hover:bg-slate-100 lg:hidden"
          aria-label="Abrir menu"
        >
          <Menu size={20} />
        </button>
        <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
          <div className="h-8 w-8 rounded-lg bg-white border border-slate-200 shadow-sm overflow-hidden flex items-center justify-center p-0.5">
            <img src={logo} alt="Task Manager" className="w-full h-full object-contain" />
          </div>
        </div>
        <h1 className="text-base font-semibold text-brand-900 truncate">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        <div className="text-xs text-slate-500 hidden sm:block">
          {new Date().toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}
        </div>
      </div>
    </header>
  );
}
