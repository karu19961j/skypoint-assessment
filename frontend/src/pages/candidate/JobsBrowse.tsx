import { useEffect, useMemo, useState } from "react";

import { ApiError } from "@/api/client";
import { bookmarksApi, jobsApi, type JobListFilters } from "@/api/endpoints";
import type { EmploymentType, Job, LocationType } from "@/api/types";
import { ErrorBanner } from "@/components/ErrorBanner";
import { JobCard } from "@/components/JobCard";
import { splitCsv } from "@/lib/format";

interface Filters {
  q: string;
  location_type: LocationType | "";
  employment_type: EmploymentType | "";
  department: string;
  exp_min: string;
  exp_max: string;
  ctc_min: string;
  ctc_max: string;
  skills: string;
}

const EMPTY: Filters = {
  q: "",
  location_type: "",
  employment_type: "",
  department: "",
  exp_min: "",
  exp_max: "",
  ctc_min: "",
  ctc_max: "",
  skills: "",
};

function buildQuery(f: Filters): JobListFilters {
  const q: JobListFilters = {};
  if (f.q.trim()) q.q = f.q.trim();
  if (f.location_type) q.location_type = f.location_type;
  if (f.employment_type) q.employment_type = f.employment_type;
  if (f.department.trim()) q.department = f.department.trim();
  if (f.exp_min) q.exp_min = Number(f.exp_min);
  if (f.exp_max) q.exp_max = Number(f.exp_max);
  if (f.ctc_min) q.ctc_min = Number(f.ctc_min);
  if (f.ctc_max) q.ctc_max = Number(f.ctc_max);
  const skills = splitCsv(f.skills);
  if (skills.length) q.skills = skills;
  return q;
}

export function CandidateJobsPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const query = useMemo(() => buildQuery(filters), [filters]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    jobsApi
      .list(query)
      .then((rows) => setJobs(rows))
      .catch((err) => {
        if (err instanceof ApiError) setError(err.detail);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [query]);

  useEffect(() => {
    bookmarksApi
      .list()
      .then((rows) => setBookmarkedIds(new Set(rows.map((b) => b.job_id))))
      .catch(() => undefined);
  }, []);

  const toggleBookmark = async (jobId: number) => {
    try {
      if (bookmarkedIds.has(jobId)) {
        await bookmarksApi.remove(jobId);
        setBookmarkedIds((s) => {
          const next = new Set(s);
          next.delete(jobId);
          return next;
        });
      } else {
        await bookmarksApi.add(jobId);
        setBookmarkedIds((s) => new Set(s).add(jobId));
      }
    } catch (err) {
      if (err instanceof ApiError) setError(err.detail);
    }
  };

  const update = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="card h-fit space-y-4 lg:sticky lg:top-4">
        <div>
          <label className="label">Search</label>
          <input
            className="input"
            placeholder="Title or keyword"
            value={filters.q}
            onChange={(e) => update("q", e.target.value)}
          />
        </div>
        <div>
          <label className="label">Department</label>
          <input
            className="input"
            placeholder="e.g. Engineering"
            value={filters.department}
            onChange={(e) => update("department", e.target.value)}
          />
        </div>
        <div>
          <label className="label">Location</label>
          <select
            className="input"
            value={filters.location_type}
            onChange={(e) => update("location_type", e.target.value as Filters["location_type"])}
          >
            <option value="">Any</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">On-site</option>
          </select>
        </div>
        <div>
          <label className="label">Employment</label>
          <select
            className="input"
            value={filters.employment_type}
            onChange={(e) => update("employment_type", e.target.value as Filters["employment_type"])}
          >
            <option value="">Any</option>
            <option value="full_time">Full-time</option>
            <option value="part_time">Part-time</option>
            <option value="contract">Contract</option>
            <option value="internship">Internship</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Min exp (yrs)</label>
            <input
              className="input"
              type="number"
              min={0}
              value={filters.exp_min}
              onChange={(e) => update("exp_min", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Max exp</label>
            <input
              className="input"
              type="number"
              min={0}
              value={filters.exp_max}
              onChange={(e) => update("exp_max", e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Min CTC</label>
            <input
              className="input"
              type="number"
              min={0}
              value={filters.ctc_min}
              onChange={(e) => update("ctc_min", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Max CTC</label>
            <input
              className="input"
              type="number"
              min={0}
              value={filters.ctc_max}
              onChange={(e) => update("ctc_max", e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label">Skills (comma-separated)</label>
          <input
            className="input"
            placeholder="python, react"
            value={filters.skills}
            onChange={(e) => update("skills", e.target.value)}
          />
        </div>
        <button onClick={() => setFilters(EMPTY)} className="btn-secondary w-full text-sm">
          Reset filters
        </button>
      </aside>

      <section className="space-y-3">
        <ErrorBanner message={error} />
        {loading ? (
          <div className="text-slate-500">Loading jobs…</div>
        ) : jobs.length === 0 ? (
          <div className="card text-slate-500">No jobs match your filters.</div>
        ) : (
          jobs.map((j) => (
            <JobCard
              key={j.id}
              job={j}
              isBookmarked={bookmarkedIds.has(j.id)}
              onBookmarkToggle={() => toggleBookmark(j.id)}
            />
          ))
        )}
      </section>
    </div>
  );
}
