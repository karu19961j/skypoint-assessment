import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import { bookmarksApi, jobsApi, type JobListFilters } from "@/api/endpoints";
import type { EmploymentType, Job, LocationType, RecommendedJob } from "@/api/types";
import { ErrorBanner } from "@/components/ErrorBanner";
import { JobCard } from "@/components/JobCard";
import { ScoreBadge } from "@/components/ScoreBadge";
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
  sort: "recent" | "salary_high" | "exp_low";
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
  sort: "recent",
};

function buildQuery(f: Filters): JobListFilters {
  const q: JobListFilters = { sort: f.sort };
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

type Tab = "all" | "recommended";

export function CandidateJobsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get("tab") === "recommended" ? "recommended" : "all";
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [jobs, setJobs] = useState<Job[] | RecommendedJob[]>([]);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [noProfile, setNoProfile] = useState(false);

  const query = useMemo(() => buildQuery(filters), [filters]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setNoProfile(false);

    if (tab === "recommended") {
      jobsApi
        .recommended()
        .then((rows) => setJobs(rows))
        .catch((err) => {
          if (err instanceof ApiError) {
            if (err.status === 404) setNoProfile(true);
            else setError(err.detail);
          }
        })
        .finally(() => setLoading(false));
    } else {
      jobsApi
        .list(query)
        .then((rows) => setJobs(rows))
        .catch((err) => {
          if (err instanceof ApiError) setError(err.detail);
        })
        .finally(() => setLoading(false));
    }
  }, [query, tab]);

  const setTab = (next: Tab) => {
    if (next === "all") {
      searchParams.delete("tab");
    } else {
      searchParams.set("tab", "recommended");
    }
    setSearchParams(searchParams, { replace: true });
  };

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
        <div>
          <label className="label" htmlFor="browse-sort">Sort by</label>
          <select
            id="browse-sort"
            className="input"
            value={filters.sort}
            onChange={(e) => update("sort", e.target.value as Filters["sort"])}
          >
            <option value="recent">Newest first</option>
            <option value="salary_high">Highest salary first</option>
            <option value="exp_low">Least experience required</option>
          </select>
        </div>
        <button onClick={() => setFilters(EMPTY)} className="btn-secondary w-full text-sm">
          Reset filters
        </button>
      </aside>

      <section className="space-y-3">
        <div className="flex items-center gap-1 rounded-md bg-white p-1 ring-1 ring-slate-200" role="tablist" aria-label="Job views">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "all"}
            onClick={() => setTab("all")}
            className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition ${
              tab === "all" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            All jobs
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "recommended"}
            onClick={() => setTab("recommended")}
            className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition ${
              tab === "recommended" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            ★ Recommended
          </button>
        </div>

        <ErrorBanner message={error} />
        <div className="sr-only" role="status" aria-live="polite">
          {loading
            ? "Loading jobs"
            : `Showing ${jobs.length} ${jobs.length === 1 ? "job" : "jobs"}`}
        </div>

        {noProfile ? (
          <div className="card flex flex-col items-start gap-3 text-slate-600">
            <h2 className="text-lg font-semibold text-slate-900">
              Tell us about yourself to see recommendations
            </h2>
            <p className="text-sm">
              Add your skills, experience, CTC expectation and preferred location.
              We&apos;ll score every active job against your profile and rank the best fits.
            </p>
            <Link to="/me/profile" className="btn-primary text-sm">
              Complete your profile
            </Link>
          </div>
        ) : loading ? (
          <div className="text-slate-500">Loading jobs…</div>
        ) : jobs.length === 0 ? (
          <div className="card text-slate-500">
            {tab === "recommended"
              ? "No active jobs match your profile right now. Check back soon!"
              : "No jobs match your filters."}
          </div>
        ) : (
          jobs.map((j) => {
            const recommended = "score" in j ? (j as RecommendedJob) : null;
            return (
              <div key={j.id} className="relative">
                <JobCard
                  job={j}
                  isBookmarked={bookmarkedIds.has(j.id)}
                  onBookmarkToggle={() => toggleBookmark(j.id)}
                />
                {recommended ? (
                  <div className="absolute right-5 top-5">
                    <ScoreBadge score={recommended.score} />
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
