import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "@/api/client";
import { dashboardApi } from "@/api/endpoints";
import type { DashboardData } from "@/api/types";
import { APPLICATION_STAGES } from "@/api/types";
import { ErrorBanner } from "@/components/ErrorBanner";
import { stageColor, stageLabel } from "@/lib/format";

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

export function HrDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dashboardApi
      .hr()
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.detail : "Could not load dashboard"));
  }, []);

  if (!data) return <div className="text-slate-500">{error ?? "Loading…"}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Link to="/hr/jobs/new" className="btn-primary text-sm">+ Post a job</Link>
      </div>

      <ErrorBanner message={error} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Active jobs" value={data.jobs.active} />
        <StatCard label="Paused jobs" value={data.jobs.paused} />
        <StatCard label="Closed jobs" value={data.jobs.closed} />
        <StatCard label="Apps today" value={data.applications.today} />
        <StatCard label="Apps last 7 days" value={data.applications.this_week} />
      </div>

      {/* Aggregated funnel across all the HR's jobs — quick-glance volume by stage. */}
      <div className="card">
        <h2 className="mb-3 text-lg font-semibold">Pipeline volume across all your jobs</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
          {APPLICATION_STAGES.map((s) => {
            const sum = data.funnels.reduce((acc, f) => acc + (f.counts[s] ?? 0), 0);
            return (
              <div key={s} className={`rounded-md px-3 py-2 ${stageColor(s)}`}>
                <div className="text-[11px] uppercase tracking-wider opacity-80">{stageLabel(s)}</div>
                <div className="mt-0.5 text-xl font-semibold">{sum}</div>
              </div>
            );
          })}
        </div>
      </div>

      {data.top_jobs.length > 0 ? (
        <div className="card overflow-x-auto">
          <h2 className="mb-3 text-lg font-semibold">Top 5 jobs by applications</h2>
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th scope="col" className="px-2 py-2">#</th>
                <th scope="col" className="px-2 py-2">Job</th>
                {APPLICATION_STAGES.map((s) => (
                  <th scope="col" key={s} className="px-2 py-2 text-center">{stageLabel(s)}</th>
                ))}
                <th scope="col" className="px-2 py-2 text-center">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.top_jobs.map((f, idx) => (
                <tr key={f.job_id}>
                  <td className="px-2 py-2 font-mono text-xs text-slate-500">{idx + 1}</td>
                  <td className="px-2 py-2">
                    <Link to={`/hr/jobs/${f.job_id}/applicants`} className="font-medium text-slate-900 hover:text-brand-700">
                      {f.title}
                    </Link>
                  </td>
                  {APPLICATION_STAGES.map((s) => (
                    <td key={s} className="px-2 py-2 text-center text-slate-700">
                      {f.counts[s] ?? 0}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-center font-semibold text-slate-900">{f.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card text-slate-500">No jobs posted yet.</div>
      )}
    </div>
  );
}
