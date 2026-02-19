import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { authApi } from "@/services/api";
import logo from "@/assets/logo.jpeg";

type Mode = "login" | "reset";

export default function LoginPage() {
  const { user, loading, login, setUser, tenant } = useAuth();
  const { toast } = useToast();

  const [mode, setMode] = useState<Mode>("login");
  const [form, setForm] = useState({ email: "", password: "", code: "", newPassword: "" });
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resetInfo, setResetInfo] = useState<{ firstAccess: boolean } | null>(null);

  if (!loading && user) return <Navigate to="/calendar" replace />;

  const set = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      toast("Preencha email e senha", "warning");
      return;
    }

    setSubmitting(true);
    try {
      await login(form.email, form.password);
    } catch (err: unknown) {
      const e = err as Error & { code?: string; meta?: { firstAccess?: boolean } };
      if (e.code === "RESET_REQUIRED") {
        setMode("reset");
        setResetInfo({ firstAccess: !!e.meta?.firstAccess });
        toast("Você precisa definir sua senha antes de continuar", "warning");
      } else {
        toast(e.message || "Credenciais inválidas", "error");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.code || !form.newPassword) {
      toast("Preencha todos os campos", "warning");
      return;
    }
    if (form.newPassword.length < 6) {
      toast("Senha deve ter pelo menos 6 caracteres", "warning");
      return;
    }

    setSubmitting(true);
    try {
      const { user: u } = await authApi.reset(form.email, form.code, form.newPassword);
      setUser(u);
      toast("Senha definida com sucesso! Bem-vindo(a).", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Código inválido ou expirado", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-brand-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <div className="h-14 w-14 rounded-full bg-white border border-slate-200 shadow-sm overflow-hidden flex items-center justify-center">
              <img src={logo} alt="Task Manager" className="h-10 w-10 object-cover" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Task Manager</h1>
          {tenant && <p className="text-sm text-slate-500 mt-1 truncate max-w-[18rem] mx-auto">{tenant.name}</p>}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xl shadow-brand-100/60">
          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="mb-2">
                <h2 className="text-lg font-semibold text-slate-900">Entrar</h2>
                <p className="text-sm text-slate-500">Faça login na sua conta</p>
              </div>

              <Input
                label="Email"
                type="email"
                required
                value={form.email}
                onChange={e => set("email", e.target.value)}
                placeholder="email@empresa.com"
                autoComplete="email"
                autoFocus
              />

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-700">
                  Senha <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    required
                    value={form.password}
                    onChange={e => set("password", e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="w-full rounded-lg bg-white border border-slate-300 text-slate-900 px-3 py-2 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800"
                    aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full" size="lg" loading={submitting}>
                Entrar
              </Button>

              <p className="text-xs text-center text-slate-500">
                Esqueceu a senha?{" "}
                <button
                  type="button"
                  onClick={() => setMode("reset")}
                  className="text-brand-700 hover:text-brand-800 transition-colors"
                >
                  Redefinir acesso
                </button>
              </p>
            </form>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <div className="mb-2">
                <h2 className="text-lg font-semibold text-slate-900">
                  {resetInfo?.firstAccess ? "Primeiro acesso" : "Redefinir senha"}
                </h2>
                <p className="text-sm text-slate-500">
                  {resetInfo?.firstAccess
                    ? "Insira o código fornecido pelo administrador"
                    : "Insira o código de redefinição e sua nova senha"}
                </p>
              </div>

              <Input
                label="Email"
                type="email"
                required
                value={form.email}
                onChange={e => set("email", e.target.value)}
                placeholder="email@empresa.com"
              />

              <Input
                label="Código de acesso"
                required
                value={form.code}
                onChange={e => set("code", e.target.value.toUpperCase())}
                placeholder="Ex: AB3X9K2P"
                className="font-mono tracking-wider text-center"
                maxLength={8}
              />

              <Input
                label="Nova senha"
                type="password"
                required
                value={form.newPassword}
                onChange={e => set("newPassword", e.target.value)}
                placeholder="Mínimo 6 caracteres"
                minLength={6}
              />

              <Button type="submit" className="w-full" size="lg" loading={submitting}>
                Definir senha e entrar
              </Button>

              <button
                type="button"
                onClick={() => setMode("login")}
                className="w-full text-xs text-slate-500 hover:text-slate-800 transition-colors"
              >
                ? Voltar ao login
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">Task Manager v2.0 · Multi-tenant</p>
      </div>
    </div>
  );
}
