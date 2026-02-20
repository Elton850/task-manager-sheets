import React, { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useBasePath } from "@/contexts/BasePathContext";
import { authApi, tenantApi } from "@/services/api";
import TenantLogo from "@/components/ui/TenantLogo";

type Mode = "login" | "requestReset" | "reset";

export default function LoginPage() {
  const { user, loading, login, refreshSession, tenant } = useAuth();
  const { toast } = useToast();
  const basePath = useBasePath();
  const [currentTenant, setCurrentTenant] = useState<{ name: string; logoUpdatedAt?: string | null } | null>(null);
  const isSystemContext = basePath === "";

  useEffect(() => {
    tenantApi.current().then((r) => setCurrentTenant({ name: r.tenant.name, logoUpdatedAt: r.tenant.logoUpdatedAt })).catch(() => setCurrentTenant(null));
  }, []);

  const [mode, setMode] = useState<Mode>("login");
  const [form, setForm] = useState({ email: "", password: "", code: "", newPassword: "" });
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resetInfo, setResetInfo] = useState<{ firstAccess: boolean } | null>(null);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  if (!loading && user) return <Navigate to={`${basePath}/calendar`} replace />;

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
      const code = e?.code;
      const msg = (e?.message ?? "") as string;

      // Prioridade: 1) Inativado, 2) Login incorreto, 3) Senha incorreta, 4) Reset obrigatório, 5) genérico
      if (code === "INACTIVE" || /inativo/i.test(msg)) {
        toast("Sua conta está desativada. Entre em contato com o administrador.", "error");
      } else if (code === "NO_USER" || /não cadastrado|não encontrado/i.test(msg)) {
        toast("E-mail não encontrado ou incorreto. Verifique e tente novamente.", "error");
      } else if (code === "BAD_CREDENTIALS" || /credenciais inválidas/i.test(msg)) {
        toast("Senha incorreta. Tente novamente.", "error");
      } else if (code === "RESET_REQUIRED" && !isSystemContext) {
        setMode("reset");
        setResetInfo({ firstAccess: !!e.meta?.firstAccess });
        toast("Você precisa definir sua senha antes de continuar", "warning");
      } else if (code === "RESET_REQUIRED" && isSystemContext) {
        toast("Não foi possível entrar. Entre em contato com o suporte.", "error");
      } else {
        toast(msg || "Não foi possível entrar. Tente novamente.", "error");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = form.email?.trim();
    if (!email) {
      toast("Informe o e-mail", "warning");
      return;
    }
    setSubmitting(true);
    try {
      const data = await authApi.requestReset(email);
      toast(data?.message ?? "Se o e-mail estiver cadastrado e ativo, você receberá o código em instantes. Verifique sua caixa de entrada.", "success");
      setResetEmailSent(true);
      setMode("reset");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao solicitar código", "error");
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
      await authApi.reset(form.email, form.code, form.newPassword);
      await refreshSession();
      toast("Senha definida com sucesso! Bem-vindo(a).", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Código inválido ou expirado", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const isAdminLogin = isSystemContext;
  const showRequestResetForm = mode === "requestReset" && !isAdminLogin;
  const showResetForm = mode === "reset" && !isAdminLogin;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-brand-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {!isAdminLogin && (
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center mb-4">
              <TenantLogo
                tenantSlug={basePath ? basePath.replace(/^\//, "") : null}
                logoVersion={currentTenant?.logoUpdatedAt}
                alt="Task Manager"
                size="h-16 w-16"
                className="rounded-xl shadow-sm"
              />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Task Manager</h1>
            <p className="text-sm text-slate-500 mt-1 truncate max-w-[18rem] mx-auto">
              {currentTenant?.name ?? (tenant?.name || "Carregando…")}
            </p>
          </div>
        )}

        <div className={`bg-white border border-slate-200 rounded-2xl p-6 shadow-xl shadow-brand-100/60 ${isAdminLogin ? "mt-8" : ""}`}>
          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="mb-2">
                <h2 className="text-lg font-semibold text-slate-900">
                  {isAdminLogin ? "Acesso" : "Entrar"}
                </h2>
                {!isAdminLogin && (
                  <p className="text-sm text-slate-500">Faça login na sua conta</p>
                )}
              </div>

              <Input
                label="E-mail"
                type="email"
                required
                value={form.email}
                onChange={e => set("email", e.target.value)}
                placeholder={isAdminLogin ? "" : "email@empresa.com"}
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

              {!isAdminLogin && (
                <p className="text-xs text-center text-slate-500">
                  Esqueceu a senha?{" "}
                  <button
                    type="button"
                    onClick={() => { setMode("requestReset"); setResetEmailSent(false); }}
                    className="text-brand-700 hover:text-brand-800 transition-colors"
                  >
                    Redefinir acesso
                  </button>
                </p>
              )}
            </form>
          ) : showRequestResetForm ? (
            <form onSubmit={handleRequestReset} className="space-y-4">
              <div className="mb-2">
                <h2 className="text-lg font-semibold text-slate-900">Redefinir acesso</h2>
                <p className="text-sm text-slate-500">
                  Informe o e-mail da conta. Enviaremos um código de verificação (válido por 30 minutos).
                </p>
              </div>

              <Input
                label="E-mail"
                type="email"
                required
                value={form.email}
                onChange={e => set("email", e.target.value)}
                placeholder="email@empresa.com"
                autoComplete="email"
                autoFocus
              />

              <Button type="submit" className="w-full" size="lg" loading={submitting}>
                Enviar código por e-mail
              </Button>

              <button
                type="button"
                onClick={() => setMode("login")}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-slate-600 hover:text-brand-700 hover:bg-slate-50 rounded-lg transition-colors border border-transparent hover:border-slate-200"
              >
                <ArrowLeft size={16} />
                Voltar
              </button>
            </form>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <div className="mb-2">
                <h2 className="text-lg font-semibold text-slate-900">
                  {resetInfo?.firstAccess ? "Primeiro acesso" : "Redefinir senha"}
                </h2>
                <p className="text-sm text-slate-500">
                  Código de verificação e nova senha
                </p>
              </div>

              <Input
                label="E-mail"
                type="email"
                required
                value={form.email}
                onChange={e => set("email", e.target.value)}
                placeholder="email@empresa.com"
                readOnly={resetEmailSent}
                className={resetEmailSent ? "bg-slate-50" : undefined}
              />

              <Input
                label="Código"
                required
                value={form.code}
                onChange={e => set("code", e.target.value.toUpperCase())}
                placeholder="••••••••"
                className="font-mono tracking-wider text-center"
                maxLength={8}
              />

              <Input
                label="Nova senha"
                type="password"
                required
                value={form.newPassword}
                onChange={e => set("newPassword", e.target.value)}
                placeholder="••••••••"
                minLength={6}
              />

              <Button type="submit" className="w-full" size="lg" loading={submitting}>
                Definir senha e entrar
              </Button>

              <button
                type="button"
                onClick={() => { setMode("login"); setResetEmailSent(false); }}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-slate-600 hover:text-brand-700 hover:bg-slate-50 rounded-lg transition-colors border border-transparent hover:border-slate-200"
              >
                <ArrowLeft size={16} />
                Voltar
              </button>
            </form>
          )}
        </div>

        {!isAdminLogin && (
          <p className="text-center text-xs text-slate-500 mt-6">
            Task Manager v2.0 · Multi-tenant
          </p>
        )}
      </div>
    </div>
  );
}
