import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "@/api/client";
import { jobsApi } from "@/api/endpoints";
import type { Job, JobStatus } from "@/api/types";
import { ErrorBanner } from "@/components/ErrorBanner";
import {
  employmentLabel,
  formatCtcRange,
  formatExp,
  locationLabel,
} from "@/lib/format";

const STATUS_COLOR: Record<JobStatus, string> = {
  active: "bg-emerald-100 text-emerald-800",
  paused: "bg-amber-100 text-amber-800",
  closed: "bg-slate-200 text-slate-700",
};

export function HrJobsListPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    jobsApi
      .list({ mine: true })
      .then(setJobs)
      .catch((err) => setError(err instanceof ApiError ? err.detail : "Failed to load"));
  };

  useEffect(() => {
    refresh();
  }, []);

  const setStatus = async (id: number, status: JobStatus) => {
    try {
      await jobsApi.setStatus(id, status);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Could not update status");
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this job? This also deletes its applications.")) return;
    try {
      await jobsApi.remove(id);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Could not delete job");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-semibold">Your jobs</h1>
        <Link to="/hr/jobs/new" className="btn-primary text-sm">+ Post a job</Link>
      </div>

      <ErrorBanner message={error} />

      {jobs.length === 0 ? (
        <div className="card text-slate-500">No jobs yet. Create your first posting.</div>
      ) : (
        jobs.map((j) => (
          <div key={j.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Link
                    to={`/hr/jobs/${j.id}/applicants`}
                    className="text-lg font-semibold text-slate-900 hover:text-brand-700"
                  >
                    {j.title}
                  </Link>
                  <span className={`badge ${STATUS_COLOR[j.status]}`}>{j.status}</span>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {j.department} · {locationLabel(j.location_type)} · {employmentLabel(j.employment_type)} ·{" "}
                  {formatExp(j.exp_min, j.exp_max)} · {formatCtcRange(j.ctc_min, j.ctc_max)}
                </p>
                <div className="mt-2 flex flex-wrap gap-1 text-xs">
                  {j.skills.map((s) => (
                    <span key={s} className="badge bg-brand-50 text-brand-700">{s}</span>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link to={`/hr/jobs/${j.id}/applicants`} className="btn-secondary text-xs">
                  Applicants
                </Link>
                <Link to={`/hr/jobs/${j.id}/edit`} className="btn-secondary text-xs">
                  Edit
                </Link>
                <select
                  className="input max-w-[140px] py-1 text-xs"
                  value={j.status}
                  onChange={(e) => setStatus(j.id, e.target.value as JobStatus)}
                >
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="closed">Closed</option>
                </select>
                <button onClick={() => remove(j.id)} className="btn-danger text-xs">
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
