import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { jobsApi } from "@/api/endpoints";
import { queryKeys } from "@/api/queryKeys";
import type { JobStatus } from "@/api/types";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Pagination } from "@/components/Pagination";
import {
  employmentLabel,
  formatCtcRange,
  formatExp,
  locationLabel,
} from "@/lib/format";
import { notify, notifyError } from "@/lib/toast";

const STATUS_COLOR: Record<JobStatus, string> = {
  active: "bg-emerald-100 text-emerald-800",
  paused: "bg-amber-100 text-amber-800",
  closed: "bg-slate-200 text-slate-700",
};

const PAGE_SIZE = 10;

export function HrJobsListPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const listFilters = {
    mine: true,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };

  const { data, error, isLoading } = useQuery({
    queryKey: queryKeys.jobs.list(listFilters),
    queryFn: () => jobsApi.listWithCount(listFilters),
  });
  const jobs = data?.items ?? [];
  const total = data?.total ?? 0;

  // After any mutation that changes a job, blow away every cached jobs
  // query (lists + details + recommended) so the dashboard / browse /
  // detail pages all reflect the change. React Query's prefix-match
  // makes `["jobs"]` invalidate every nested ["jobs", …] entry.
  // Broad prefix sweep: mutations change any of (lists, details,
  // recommended), so we invalidate the whole `["jobs"]` namespace and
  // let React Query refetch whichever ones are currently mounted.
  const invalidateJobs = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all() });

  const setStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: JobStatus }) =>
      jobsApi.setStatus(id, status),
    onSuccess: invalidateJobs,
    onError: (err) => notifyError(err, "Could not update status"),
  });

  const closeMutation = useMutation({
    mutationFn: (id: number) => jobsApi.close(id),
    onSuccess: () => {
      invalidateJobs();
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.hr() });
      notify.success("Job closed.");
    },
    onError: (err) => notifyError(err, "Could not close job"),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: number) => {
      const source = await jobsApi.get(id);
      const draft = await jobsApi.create({
        title: `${source.title} (copy)`,
        description: source.description,
        department: source.department,
        location_type: source.location_type,
        employment_type: source.employment_type,
        exp_min: source.exp_min,
        exp_max: source.exp_max,
        ctc_min: source.ctc_min,
        ctc_max: source.ctc_max,
        skills: source.skills,
        deadline: source.deadline,
      });
      await jobsApi.setStatus(draft.id, "paused");
      return draft;
    },
    onSuccess: (draft) => {
      invalidateJobs();
      navigate(`/hr/jobs/${draft.id}/edit`);
    },
    onError: (err) => notifyError(err, "Could not duplicate job"),
  });

  const closeJob = (id: number) => {
    if (
      !confirm(
        "Close this job? It will be hidden from candidate listings but the application history is kept so you can still review the pipeline.",
      )
    )
      return;
    closeMutation.mutate(id);
  };

  const queryError = error instanceof Error ? error.message : null;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-semibold">Your jobs</h1>
        <Link to="/hr/jobs/new" className="btn-primary text-sm">+ Post a job</Link>
      </div>

      <ErrorBanner message={queryError} />

      {isLoading ? (
        <div className="card text-slate-500">Loading…</div>
      ) : jobs.length === 0 ? (
        <div className="card text-slate-500">
          {total === 0 ? "No jobs yet. Create your first posting." : "No jobs on this page."}
        </div>
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
                <button
                  onClick={() => duplicateMutation.mutate(j.id)}
                  disabled={duplicateMutation.isPending}
                  className="btn-secondary text-xs"
                  title="Create a paused copy of this posting"
                  aria-label={`Duplicate ${j.title}`}
                >
                  {duplicateMutation.isPending && duplicateMutation.variables === j.id
                    ? "Duplicating…"
                    : "⧉ Duplicate"}
                </button>
                <select
                  className="input max-w-[140px] py-1 text-xs"
                  value={j.status}
                  onChange={(e) =>
                    setStatusMutation.mutate({ id: j.id, status: e.target.value as JobStatus })
                  }
                  aria-label={`Change status for ${j.title}`}
                >
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="closed">Closed</option>
                </select>
                <button
                  onClick={() => closeJob(j.id)}
                  className="btn-danger text-xs"
                  disabled={j.status === "closed" || closeMutation.isPending}
                  title={j.status === "closed" ? "Already closed" : "Close this job"}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        ))
      )}

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onChange={setPage}
        itemLabel="jobs"
      />
    </div>
  );
}
