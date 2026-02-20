import React, { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { SyncTenantAndBasePath, useBasePath } from "@/contexts/BasePathContext";
import Layout from "@/components/layout/Layout";
import LoginPage from "@/pages/LoginPage";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import ToastContainer from "@/components/ui/ToastContainer";
import { setTenantSlug, getTenantSlugFromUrl } from "@/services/api";

const TasksPage = lazy(() => import("@/pages/TasksPage"));
const CalendarPage = lazy(() => import("@/pages/CalendarPage"));
const PerformancePage = lazy(() => import("@/pages/PerformancePage"));
const UsersPage = lazy(() => import("@/pages/UsersPage"));
const AdminPage = lazy(() => import("@/pages/AdminPage"));
const CompanyPage = lazy(() => import("@/pages/CompanyPage"));
const CompaniesPage = lazy(() => import("@/pages/CompaniesPage"));

setTenantSlug(getTenantSlugFromUrl());

function IndexRedirect() {
  const basePath = useBasePath();
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner fullPage />;
  return <Navigate to={user ? `${basePath}/calendar` : `${basePath}/login`} replace />;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const basePath = useBasePath();
  if (loading) return <LoadingSpinner fullPage />;
  if (!user) return <Navigate to={`${basePath}/login`} replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const basePath = useBasePath();
  if (loading) return <LoadingSpinner fullPage />;
  if (!user) return <Navigate to={`${basePath}/login`} replace />;
  if (user.role !== "ADMIN") return <Navigate to={`${basePath}/calendar`} replace />;
  return <>{children}</>;
}

function AdminLeaderRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const basePath = useBasePath();
  if (loading) return <LoadingSpinner fullPage />;
  if (!user) return <Navigate to={`${basePath}/login`} replace />;
  if (user.role === "USER") return <Navigate to={`${basePath}/calendar`} replace />;
  return <>{children}</>;
}

function SystemAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, tenant, loading } = useAuth();
  const basePath = useBasePath();
  if (loading) return <LoadingSpinner fullPage />;
  if (!user) return <Navigate to={`${basePath}/login`} replace />;
  if (tenant?.slug !== "system" || user.role !== "ADMIN") return <Navigate to={`${basePath}/calendar`} replace />;
  return <>{children}</>;
}

function NotFoundRedirect() {
  const basePath = useBasePath();
  return <Navigate to={`${basePath}/calendar`} replace />;
}

/** Rotas para sistema (/) e para tenant (/:tenant) — mesmo conteúdo, basePath vem do pathname em SyncTenantAndBasePath. */
const appRouteChildren = (
  <>
    <Route index element={<IndexRedirect />} />
    <Route path="login" element={<LoginPage />} />
    <Route
      element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }
    >
      <Route index element={<Navigate to="calendar" replace />} />
      <Route path="tasks" element={<Suspense fallback={<LoadingSpinner fullPage />}><TasksPage /></Suspense>} />
      <Route path="calendar" element={<Suspense fallback={<LoadingSpinner fullPage />}><CalendarPage /></Suspense>} />
      <Route path="performance" element={<Suspense fallback={<LoadingSpinner fullPage />}><PerformancePage /></Suspense>} />
      <Route path="users" element={<AdminLeaderRoute><Suspense fallback={<LoadingSpinner fullPage />}><UsersPage /></Suspense></AdminLeaderRoute>} />
      <Route path="admin" element={<AdminLeaderRoute><Suspense fallback={<LoadingSpinner fullPage />}><AdminPage /></Suspense></AdminLeaderRoute>} />
      <Route path="empresas" element={<SystemAdminRoute><Suspense fallback={<LoadingSpinner fullPage />}><CompaniesPage /></Suspense></SystemAdminRoute>} />
      <Route path="empresa" element={<AdminRoute><Suspense fallback={<LoadingSpinner fullPage />}><CompanyPage /></Suspense></AdminRoute>} />
    </Route>
    <Route path="*" element={<NotFoundRedirect />} />
  </>
);

export default function App() {
  return (
    <ToastProvider>
      <ToastContainer />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<SyncTenantAndBasePath />}>
              {appRouteChildren}
              {/* /:tenant (ex.: /empresax/login) — tenant como segmento filho para não ser engolido por path="/" */}
              <Route path=":tenant" element={<Outlet />}>
                {appRouteChildren}
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}
