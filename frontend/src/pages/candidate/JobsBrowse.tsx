import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import { bookmarksApi, jobsApi, type JobListFilters } from "@/api/endpoints";
import type { EmploymentType, Job, LocationType, RecommendedJob } from "@/api/types";
import { ErrorBanner } from "@/components/ErrorBanner";
import { JobCard } from "@/components/JobCard";
import { ScoreBadge } from "@/components/ScoreBadge";
import { TagInput } from "@/components/TagInput";

const PAGE_SIZE = 12;

interface Filters {
  q: string;
  location_type: LocationType | "";
  employment_type: EmploymentType | "";
  department: string;
  exp_min: string;
  exp_max: string;
  ctc_min: string;
  ctc_max: string;
  skills: string[];
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
  skills: [],
  sort: "recent",
};

function buildQuery(f: Filters, offset: number): JobListFilters {
  const q: JobListFilters = {
    sort: f.sort,
    limit: PAGE_SIZE + 1, // +1 acts as a "has next page" probe
    offset,
  };
  if (f.q.trim()) q.q = f.q.trim();
  if (f.location_type) q.location_type = f.location_type;
  if (f.employment_type) q.employment_type = f.employment_type;
  if (f.department.trim()) q.department = f.department.trim();
  if (f.exp_min) q.exp_min = Number(f.exp_min);
  if (f.exp_max) q.exp_max = Number(f.exp_max);
  if (f.ctc_min) q.ctc_min = Number(f.ctc_min);
  if (f.ctc_max) q.ctc_max = Number(f.ctc_max);
  if (f.skills.length) q.skills = f.skills;
  return q;
}

type Tab = "all" | "recommended";

export function CandidateJobsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get("tab") === "recommended" ? "recommended" : "all";
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [jobs, setJobs] = useState<Job[] | RecommendedJob[]>([]);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [noProfile, setNoProfile] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // The fetcher for one batch starting at `offset`. Returns the items to
  // append + whether there's another batch behind it.
  const fetchBatch = useCallback(
    async (offset: number) => {
      const rows = await jobsApi.list(buildQuery(filters, offset));
      return {
        items: rows.slice(0, PAGE_SIZE),
        more: rows.length > PAGE_SIZE,
      };
    },
    [filters],
  );

  // Reload from scratch whenever filters or the tab change.
  useEffect(() => {
    let cancelled = false;
    setInitialLoading(true);
    setError(null);
    setNoProfile(false);
    setJobs([]);
    setNextOffset(0);
    setHasMore(false);

    const run = async () => {
      try {
        if (tab === "recommended") {
          const rows = await jobsApi.recommended();
          if (cancelled) return;
          setJobs(rows);
          setHasMore(false);
        } else {
          const { items, more } = await fetchBatch(0);
          if (cancelled) return;
          setJobs(items);
          setNextOffset(items.length);
          setHasMore(more);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError) {
          if (err.status === 404 && tab === "recommended") setNoProfile(true);
          else setError(err.detail);
        }
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [filters, tab, fetchBatch]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || tab !== "all") return;
    setLoadingMore(true);
    try {
      const { items, more } = await fetchBatch(nextOffset);
      setJobs((prev) => [...(prev as Job[]), ...items]);
      setNextOffset((o) => o + items.length);
      setHasMore(more);
    } catch (err) {
      if (err instanceof ApiError) setError(err.detail);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchBatch, hasMore, loadingMore, nextOffset, tab]);

  // IntersectionObserver: when the sentinel below the list scrolls into
  // view, transparently fetch the next batch. Falls back gracefully to the
  // visible "Load more" button if the user is on a browser without IO or
  // prefers reduced motion.
  useEffect(() => {
    if (tab !== "all") return;
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: "200px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [loadMore, tab]);

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
          <label className="label" htmlFor="browse-q">Search</label>
          <input
            id="browse-q"
            className="input"
            placeholder="Title or keyword"
            value={filters.q}
            onChange={(e) => update("q", e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="browse-department">Department</label>
          <input
            id="browse-department"
            className="input"
            placeholder="e.g. Engineering"
            value={filters.department}
            onChange={(e) => update("department", e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="browse-location">Location</label>
          <select
            id="browse-location"
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
          <label className="label" htmlFor="browse-employment">Employment</label>
          <select
            id="browse-employment"
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
            <label className="label" htmlFor="browse-exp-min">Min exp (yrs)</label>
            <input
              id="browse-exp-min"
              className="input"
              type="number"
              min={0}
              value={filters.exp_min}
              onChange={(e) => update("exp_min", e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="browse-exp-max">Max exp</label>
            <input
              id="browse-exp-max"
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
            <label className="label" htmlFor="browse-ctc-min">Min CTC</label>
            <input
              id="browse-ctc-min"
              className="input"
              type="number"
              min={0}
              value={filters.ctc_min}
              onChange={(e) => update("ctc_min", e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="browse-ctc-max">Max CTC</label>
            <input
              id="browse-ctc-max"
              className="input"
              type="number"
              min={0}
              value={filters.ctc_max}
              onChange={(e) => update("ctc_max", e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="browse-skills">Skills</label>
          <TagInput
            id="browse-skills"
            value={filters.skills}
            onChange={(next) => update("skills", next)}
            placeholder="Type a skill and press Enter (e.g. python, react)"
            ariaLabel="Filter jobs by skills"
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
          {initialLoading
            ? "Loading jobs"
            : loadingMore
              ? `Showing ${jobs.length} jobs, loading more`
              : `Showing ${jobs.length} ${jobs.length === 1 ? "job" : "jobs"}${hasMore ? ", more available" : ""}`}
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
        ) : initialLoading ? (
          <div className="text-slate-500">Loading jobs…</div>
        ) : jobs.length === 0 ? (
          <div className="card text-slate-500">
            {tab === "recommended"
              ? "No active jobs match your profile right now. Check back soon!"
              : "No jobs match your filters."}
          </div>
        ) : (
          <>
            {jobs.map((j) => {
              const recommended = "score" in j ? (j as RecommendedJob) : null;
              return (
                <div key={j.id} className="relative">
                  <JobCard
                    job={j}
                    isBookmarked={bookmarkedIds.has(j.id)}
                    onBookmarkToggle={() => toggleBookmark(j.id)}
                    matchedSkills={recommended?.score.matched_skills}
                  />
                  {recommended ? (
                    <div className="absolute right-5 top-5">
                      <ScoreBadge score={recommended.score} />
                    </div>
                  ) : null}
                </div>
              );
            })}
            {tab === "all" ? (
              <div ref={sentinelRef} className="pt-2 text-center">
                {hasMore ? (
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    disabled={loadingMore}
                    className="btn-secondary text-xs"
                    aria-label="Load more jobs"
                  >
                    {loadingMore ? "Loading more…" : "Load more"}
                  </button>
                ) : (
                  <p className="text-xs text-slate-400">
                    You&apos;ve reached the end ({jobs.length}{" "}
                    {jobs.length === 1 ? "job" : "jobs"}).
                  </p>
                )}
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

