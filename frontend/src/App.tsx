import { Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider, useAuth } from "@/auth/AuthContext";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { Layout } from "@/components/Layout";
import { LoginPage } from "@/pages/Login";
import { RegisterPage } from "@/pages/Register";
import { BookmarksPage } from "@/pages/candidate/Bookmarks";
import { CandidateJobDetailPage } from "@/pages/candidate/JobDetail";
import { CandidateJobsPage } from "@/pages/candidate/JobsBrowse";
import { MyApplicationsPage } from "@/pages/candidate/MyApplications";
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
    <AuthProvider>
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
            </Route>

            <Route element={<ProtectedRoute roles={["hr"]} />}>
              <Route path="/hr" element={<HrDashboardPage />} />
              <Route path="/hr/jobs" element={<HrJobsListPage />} />
              <Route path="/hr/jobs/new" element={<HrJobFormPage />} />
              <Route path="/hr/jobs/:id/edit" element={<HrJobFormPage />} />
              <Route path="/hr/jobs/:id/applicants" element={<HrJobApplicantsPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
