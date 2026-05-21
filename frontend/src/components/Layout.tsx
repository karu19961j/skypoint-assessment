import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "@/auth/useAuth";

export function Layout() {
  const { user, logout } = useAuth();

  const candidateLinks = [
    { to: "/jobs", label: "Browse jobs" },
    { to: "/me/applications", label: "My applications" },
    { to: "/me/bookmarks", label: "Saved" },
    { to: "/me/profile", label: "Profile" },
  ];
  const hrLinks = [
    { to: "/hr", label: "Dashboard" },
    { to: "/hr/jobs", label: "Jobs" },
    { to: "/hr/applicants", label: "Candidates" },
  ];

  const links = user?.role === "hr" ? hrLinks : candidateLinks;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <NavLink
            to={user?.role === "hr" ? "/hr" : "/jobs"}
            className="text-lg font-semibold text-brand-700"
          >
            Skypoint Jobs
          </NavLink>
          <nav className="flex items-center gap-1">
            {user && links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === "/hr"}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm ${
                    isActive
                      ? "bg-brand-50 text-brand-700"
                      : "text-slate-600 hover:bg-slate-100"
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            {user ? (
              <>
                <span className="hidden text-slate-600 sm:inline">
                  {user.full_name}{" "}
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs uppercase text-slate-500">
                    {user.role}
                  </span>
                </span>
                <button onClick={logout} className="btn-secondary text-xs">
                  Log out
                </button>
              </>
            ) : null}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
