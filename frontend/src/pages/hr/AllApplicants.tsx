import { useCallback, useEffect, useMemo, useState } from "react";

import { applicationsApi, jobsApi } from "@/api/endpoints";
import type { Application, ApplicationStage, Job } from "@/api/types";
import { APPLICATION_STAGES } from "@/api/types";
import { ApplicantFilterSidebar } from "@/components/applicants/FilterSidebar";
import { ApplicantsTable } from "@/components/applicants/ApplicantsTable";
import { ErrorBanner } from "@/components/ErrorBanner";
import { NotesDrawer } from "@/components/NotesDrawer";
import { stageLabel } from "@/lib/format";
import {
  crossJobFiltersToApi,
  EMPTY_APPLICANT_FILTERS,
  type ApplicantFilterForm,
} from "@/lib/applicantFilters";
import { useApplicants } from "@/lib/useApplicants";

interface FilterForm extends ApplicantFilterForm {
  job_id: string;
}

const EMPTY: FilterForm = { ...EMPTY_APPLICANT_FILTERS, job_id: "" };

export function HrAllApplicantsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filters, setFilters] = useState<FilterForm>(EMPTY);
  const [notesFor, setNotesFor] = useState<Application | null>(null);
  const apiFilters = useMemo(() => crossJobFiltersToApi(filters), [filters]);

  useEffect(() => {
    jobsApi
      .list({ mine: true })
      .then(setJobs)
      .catch(() => undefined);
  }, []);

  const fetcher = useCallback(
    () => applicationsApi.all(apiFilters),
    [apiFilters],
  );
  const { applicants, error, setStage } = useApplicants({
    fetcher,
    deps: [fetcher],
  });

  const totals = useMemo(() => {
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
            Every applicant across every job you own — {applicants.length} match
            {applicants.length === 1 ? "" : "es"} the current filters.
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
                {totals[s]}
              </span>
            </button>
          ))}
        </div>

        <ErrorBanner message={error} />

        <div className="sr-only" role="status" aria-live="polite">
          {`Showing ${applicants.length} ${applicants.length === 1 ? "applicant" : "applicants"}`}
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
      </section>

      {notesFor ? (
        <NotesDrawer application={notesFor} onClose={() => setNotesFor(null)} />
      ) : null}
    </div>
  );
}
