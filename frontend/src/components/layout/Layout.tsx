import React, { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import Sidebar from "./Sidebar";
import Header from "./Header";
import Button from "@/components/ui/Button";
import { Eye, ArrowLeft } from "lucide-react";

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, isImpersonating, stopImpersonation } = useAuth();
  const navigate = useNavigate();

  const handleStopImpersonation = async () => {
    await stopImpersonation();
    navigate("/users");
  };

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} />

      <div className="flex-1 flex flex-col lg:ml-64 min-w-0 transition-all duration-300">
        {isImpersonating && user && (
          <div className="flex items-center justify-between gap-3 px-4 py-2 bg-amber-100 border-b border-amber-300 text-amber-900 text-sm">
            <span className="flex items-center gap-2">
              <Eye size={16} />
              Visualizando como <strong>{user.nome}</strong> (somente leitura)
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleStopImpersonation}
              icon={<ArrowLeft size={14} />}
              className="border-amber-400 text-amber-800 hover:bg-amber-200"
            >
              Voltar à minha conta
            </Button>
          </div>
        )}
        <Header onMenuToggle={() => setSidebarOpen(o => !o)} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 bg-gradient-to-b from-slate-100 to-white">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
