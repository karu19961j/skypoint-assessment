import { Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";

import { AuthProvider } from "@/auth/AuthContext";
import { useAuth } from "@/auth/useAuth";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Layout } from "@/components/Layout";
import { LoginPage } from "@/pages/Login";
import { RegisterPage } from "@/pages/Register";
import { BookmarksPage } from "@/pages/candidate/Bookmarks";
import { CandidateJobDetailPage } from "@/pages/candidate/JobDetail";
import { CandidateJobsPage } from "@/pages/candidate/JobsBrowse";
import { MyApplicationsPage } from "@/pages/candidate/MyApplications";
import { CandidateProfilePage } from "@/pages/candidate/Profile";
import { HrAllApplicantsPage } from "@/pages/hr/AllApplicants";
import { HrDashboardPage } from "@/pages/hr/Dashboard";
import { HrJobApplicantsPage } from "@/pages/hr/JobApplicants";
import { HrJobFormPage } from "@/pages/hr/JobForm";
import { HrJobsListPage } from "@/pages/hr/JobsList";

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center text-slate-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "hr" ? "/hr" : "/jobs"} replace />;
}

export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppRoutes />
        {/* Sonner sits at the document root, outside route content, so
            toasts persist across navigation and live above the app's
            stacked layouts (drawer, modals). `richColors` honors the
            success/error/info palette we already use elsewhere. */}
        <Toaster position="top-right" richColors closeButton />
      </AuthProvider>
    </ErrorBoundary>
  );
}

function AppRoutes() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<HomeRedirect />} />

            <Route element={<ProtectedRoute roles={["candidate"]} />}>
              <Route path="/jobs" element={<CandidateJobsPage />} />
              <Route path="/jobs/:id" element={<CandidateJobDetailPage />} />
              <Route path="/me/applications" element={<MyApplicationsPage />} />
              <Route path="/me/bookmarks" element={<BookmarksPage />} />
              <Route path="/me/profile" element={<CandidateProfilePage />} />
            </Route>

            <Route element={<ProtectedRoute roles={["hr"]} />}>
              <Route path="/hr" element={<HrDashboardPage />} />
              <Route path="/hr/applicants" element={<HrAllApplicantsPage />} />
              <Route path="/hr/jobs" element={<HrJobsListPage />} />
              <Route path="/hr/jobs/new" element={<HrJobFormPage />} />
              <Route path="/hr/jobs/:id/edit" element={<HrJobFormPage />} />
              <Route path="/hr/jobs/:id/applicants" element={<HrJobApplicantsPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
