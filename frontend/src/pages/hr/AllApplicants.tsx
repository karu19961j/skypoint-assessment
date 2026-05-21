import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { applicationsApi, jobsApi } from "@/api/endpoints";
import { queryKeys } from "@/api/queryKeys";
import type { Application, ApplicationStage } from "@/api/types";
import { APPLICATION_STAGES } from "@/api/types";
import { ApplicantFilterSidebar } from "@/components/applicants/FilterSidebar";
import { ApplicantsTable } from "@/components/applicants/ApplicantsTable";
import { ErrorBanner } from "@/components/ErrorBanner";
import { NotesDrawer } from "@/components/NotesDrawer";
import { Pagination } from "@/components/Pagination";
import { stageLabel } from "@/lib/format";
import {
  crossJobFiltersToApi,
  EMPTY_APPLICANT_FILTERS,
  type ApplicantFilterForm,
} from "@/lib/applicantFilters";
import { useApplicants } from "@/lib/useApplicants";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

interface FilterForm extends ApplicantFilterForm {
  job_id: string;
}

const EMPTY: FilterForm = { ...EMPTY_APPLICANT_FILTERS, job_id: "" };
const MINE = { mine: true };
const PAGE_SIZE = 25;

export function HrAllApplicantsPage() {
  const [filters, setFilters] = useState<FilterForm>(EMPTY);
  const [notesFor, setNotesFor] = useState<Application | null>(null);
  const [page, setPage] = useState(1);

  // Debounce the whole filter object before it hits React Query. The
  // sidebar inputs stay snappy; the API call lags by 300ms.
  const debouncedFilters = useDebouncedValue(filters, 400);
  const apiFilters = useMemo(
    () => crossJobFiltersToApi(debouncedFilters),
    [debouncedFilters],
  );
  const paginatedFilters = useMemo(
    () => ({ ...apiFilters, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    [apiFilters, page],
  );

  // Reset to page 1 on (debounced) filter change.
  useEffect(() => {
    setPage(1);
  }, [apiFilters]);

  const jobsQuery = useQuery({
    queryKey: queryKeys.jobs.list(MINE),
    queryFn: () => jobsApi.list(MINE),
  });
  const jobs = jobsQuery.data ?? [];

  const { applicants, total, error, setStage } = useApplicants({
    queryKey: queryKeys.applications.crossJob(paginatedFilters),
    fetcher: async () => {
      const { items, total: count } =
        await applicationsApi.allWithCount(paginatedFilters);
      return { items, total: count ?? items.length };
    },
  });

  // Per-stage counts shown on the chip cards. Counts here are for the
  // currently-visible page; full-funnel totals live on the HR dashboard.
  // (A cheap query for full per-stage counts would be a nice add later.)
  const stageCountsOnPage = useMemo(() => {
    const byStage: Record<ApplicationStage, number> = {
      applied: 0,
      screening: 0,
      interview: 0,
      offer: 0,
      hired: 0,
      rejected: 0,
    };
    for (const a of applicants) byStage[a.stage] += 1;
    return byStage;
  }, [applicants]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
      <ApplicantFilterSidebar
        idPrefix="all"
        value={filters}
        onChange={(next) => setFilters({ ...next, job_id: filters.job_id })}
        onReset={() => setFilters(EMPTY)}
      >
        {/* Cross-job feed adds a Job dropdown above the shared filters. */}
        <div>
          <label className="label" htmlFor="all-filter-job">Job</label>
          <select
            id="all-filter-job"
            className="input"
            value={filters.job_id}
            onChange={(e) =>
              setFilters((f) => ({ ...f, job_id: e.target.value }))
            }
          >
            <option value="">All my jobs</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
        </div>
      </ApplicantFilterSidebar>

      <section className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Candidate inbox</h1>
          <p className="text-sm text-slate-500">
            Every applicant across every job you own — {total} match
            {total === 1 ? "" : "es"} the current filters.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
          {APPLICATION_STAGES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() =>
                setFilters((f) => ({ ...f, stage: f.stage === s ? "" : s }))
              }
              className={`card flex flex-col items-start text-left transition ${
                filters.stage === s ? "ring-2 ring-brand-500" : "hover:bg-slate-50"
              }`}
              aria-pressed={filters.stage === s}
            >
              <span className="text-xs uppercase tracking-wider text-slate-500">
                {stageLabel(s)}
              </span>
              <span className="mt-1 text-xl font-semibold text-slate-900">
                {stageCountsOnPage[s]}
              </span>
              <span className="text-[10px] text-slate-400">on this page</span>
            </button>
          ))}
        </div>

        <ErrorBanner message={error} />

        <div className="sr-only" role="status" aria-live="polite">
          {`Showing ${applicants.length} of ${total} ${total === 1 ? "applicant" : "applicants"}`}
        </div>

        {applicants.length === 0 ? (
          <div className="card text-slate-500">
            No applicants match these filters yet.
          </div>
        ) : (
          <ApplicantsTable
            applicants={applicants}
            showJobColumn
            onStageChange={setStage}
            onProfileOpen={setNotesFor}
          />
        )}

        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onChange={setPage}
          itemLabel="applicants"
        />
      </section>

      {notesFor ? (
        <NotesDrawer application={notesFor} onClose={() => setNotesFor(null)} />
      ) : null}
    </div>
  );
}
