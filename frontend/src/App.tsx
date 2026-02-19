import React, { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ToastProvider } from "@/contexts/ToastContext";
import Layout from "@/components/layout/Layout";
import LoginPage from "@/pages/LoginPage";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { setTenantSlug, getTenantSlugFromUrl } from "@/services/api";

// Lazy load pages for better performance
const TasksPage = lazy(() => import("@/pages/TasksPage"));
const CalendarPage = lazy(() => import("@/pages/CalendarPage"));
const PerformancePage = lazy(() => import("@/pages/PerformancePage"));
const UsersPage = lazy(() => import("@/pages/UsersPage"));
const AdminPage = lazy(() => import("@/pages/AdminPage"));

// Initialize tenant slug from URL
setTenantSlug(getTenantSlugFromUrl());

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner fullPage />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner fullPage />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "ADMIN") return <Navigate to="/calendar" replace />;
  return <>{children}</>;
}

function AdminLeaderRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner fullPage />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "USER") return <Navigate to="/calendar" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/calendar" replace />} />
              <Route 
                path="/tasks" 
                element={
                  <Suspense fallback={<LoadingSpinner fullPage />}>
                    <TasksPage />
                  </Suspense>
                } 
              />
              <Route 
                path="/calendar" 
                element={
                  <Suspense fallback={<LoadingSpinner fullPage />}>
                    <CalendarPage />
                  </Suspense>
                } 
              />
              <Route 
                path="/performance" 
                element={
                  <Suspense fallback={<LoadingSpinner fullPage />}>
                    <PerformancePage />
                  </Suspense>
                } 
              />
              <Route
                path="/users"
                element={
                  <AdminRoute>
                    <Suspense fallback={<LoadingSpinner fullPage />}>
                      <UsersPage />
                    </Suspense>
                  </AdminRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <AdminLeaderRoute>
                    <Suspense fallback={<LoadingSpinner fullPage />}>
                      <AdminPage />
                    </Suspense>
                  </AdminLeaderRoute>
                }
              />
            </Route>

            <Route path="*" element={<Navigate to="/calendar" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}
