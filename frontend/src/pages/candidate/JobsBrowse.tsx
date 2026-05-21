import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import { bookmarksApi, jobsApi, type JobListFilters } from "@/api/endpoints";
import { queryKeys } from "@/api/queryKeys";
import type { EmploymentType, Job, LocationType, RecommendedJob } from "@/api/types";
import { ErrorBanner } from "@/components/ErrorBanner";
import { JobCard } from "@/components/JobCard";
import { ScoreBadge } from "@/components/ScoreBadge";
import { TagInput } from "@/components/TagInput";
import { notifyError } from "@/lib/toast";

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
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get("tab") === "recommended" ? "recommended" : "all";
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // ----- All-jobs tab uses infinite scroll -----
  // React Query's useInfiniteQuery is the canonical idiom: pageParams are
  // the offsets we've fetched, `getNextPageParam` returns undefined when
  // the backend says there's no more data. Cache keyed by filters so
  // tab-switching back to a previous filter set is instant.
  const jobsInfinite = useInfiniteQuery({
    queryKey: queryKeys.jobs.list(buildQuery(filters, 0)),
    enabled: tab === "all",
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const rows = await jobsApi.list(buildQuery(filters, pageParam));
      return {
        items: rows.slice(0, PAGE_SIZE),
        more: rows.length > PAGE_SIZE,
        nextOffset: pageParam + Math.min(rows.length, PAGE_SIZE),
      };
    },
    getNextPageParam: (last) => (last.more ? last.nextOffset : undefined),
  });

  // ----- Recommended tab — single query, no pagination -----
  const recommendedQuery = useQuery({
    queryKey: queryKeys.jobs.recommended(),
    queryFn: () => jobsApi.recommended(),
    enabled: tab === "recommended",
    retry: false,
  });

  // ----- Bookmarks (a separate cache slice) -----
  const bookmarksQuery = useQuery({
    queryKey: queryKeys.bookmarks.all(),
    queryFn: () => bookmarksApi.list(),
  });
  const bookmarkedIds = new Set((bookmarksQuery.data ?? []).map((b) => b.job_id));

  const addBookmark = useMutation({
    mutationFn: (jobId: number) => bookmarksApi.add(jobId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.bookmarks.all() }),
    onError: (err) => notifyError(err, "Could not save job"),
  });
  const removeBookmark = useMutation({
    mutationFn: (jobId: number) => bookmarksApi.remove(jobId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.bookmarks.all() }),
    onError: (err) => notifyError(err, "Could not remove bookmark"),
  });

  const toggleBookmark = (jobId: number) => {
    if (bookmarkedIds.has(jobId)) removeBookmark.mutate(jobId);
    else addBookmark.mutate(jobId);
  };

  // Flatten infinite pages into one list to render.
  const allJobs: Job[] = jobsInfinite.data?.pages.flatMap((p) => p.items) ?? [];
  const recommended: RecommendedJob[] = recommendedQuery.data ?? [];
  const jobs: (Job | RecommendedJob)[] = tab === "all" ? allJobs : recommended;

  // Recommended-tab 404 means "no profile saved yet" — surface that with a
  // dedicated empty-state card rather than a generic error.
  const noProfile =
    tab === "recommended" &&
    recommendedQuery.error instanceof ApiError &&
    recommendedQuery.error.status === 404;

  // The list-error gate. Use the right query's error per tab.
  const listError =
    tab === "all"
      ? jobsInfinite.error instanceof Error
        ? jobsInfinite.error.message
        : null
      : noProfile
        ? null
        : recommendedQuery.error instanceof Error
          ? recommendedQuery.error.message
          : null;

  const initialLoading = tab === "all" ? jobsInfinite.isLoading : recommendedQuery.isLoading;

  const loadMore = useCallback(() => {
    if (tab !== "all") return;
    if (!jobsInfinite.hasNextPage || jobsInfinite.isFetchingNextPage) return;
    void jobsInfinite.fetchNextPage();
  }, [jobsInfinite, tab]);

  // IntersectionObserver triggers the next page when the sentinel scrolls
  // into view. Stays decoupled from React Query's pagination — RQ owns the
  // cache; this is just the visual signal.
  useEffect(() => {
    if (tab !== "all") return;
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
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

        <ErrorBanner message={listError} />
        <div className="sr-only" role="status" aria-live="polite">
          {initialLoading
            ? "Loading jobs"
            : jobsInfinite.isFetchingNextPage
              ? `Showing ${jobs.length} jobs, loading more`
              : `Showing ${jobs.length} ${jobs.length === 1 ? "job" : "jobs"}${jobsInfinite.hasNextPage ? ", more available" : ""}`}
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
              const rec = "score" in j ? (j as RecommendedJob) : null;
              return (
                <div key={j.id} className="relative">
                  <JobCard
                    job={j}
                    isBookmarked={bookmarkedIds.has(j.id)}
                    onBookmarkToggle={() => toggleBookmark(j.id)}
                    matchedSkills={rec?.score.matched_skills}
                  />
                  {rec ? (
                    <div className="absolute right-5 top-5">
                      <ScoreBadge score={rec.score} />
                    </div>
                  ) : null}
                </div>
              );
            })}
            {tab === "all" ? (
              <div ref={sentinelRef} className="pt-2 text-center">
                {jobsInfinite.hasNextPage ? (
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={jobsInfinite.isFetchingNextPage}
                    className="btn-secondary text-xs"
                    aria-label="Load more jobs"
                  >
                    {jobsInfinite.isFetchingNextPage ? "Loading more…" : "Load more"}
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
