import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { ApiError, downloadFile } from "@/api/client";
import { applicationsApi, jobsApi } from "@/api/endpoints";
import { queryKeys } from "@/api/queryKeys";
import type { Application } from "@/api/types";
import { ApplicantFilterSidebar } from "@/components/applicants/FilterSidebar";
import { ApplicantsTable } from "@/components/applicants/ApplicantsTable";
import { ErrorBanner } from "@/components/ErrorBanner";
import { NotesDrawer } from "@/components/NotesDrawer";
import { Pagination } from "@/components/Pagination";
import {
  applicantFiltersToApi,
  EMPTY_APPLICANT_FILTERS,
  type ApplicantFilterForm,
} from "@/lib/applicantFilters";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { notifyError } from "@/lib/toast";
import { useApplicants } from "@/lib/useApplicants";

const PAGE_SIZE = 25;

export function HrJobApplicantsPage() {
  const { id } = useParams<{ id: string }>();
  const jobId = Number(id);

  const [filters, setFilters] = useState<ApplicantFilterForm>(EMPTY_APPLICANT_FILTERS);
  const [notesFor, setNotesFor] = useState<Application | null>(null);
  // Ranked mode swaps the listing endpoint and decorates each row with
  // its score badge + matched-skill highlights. Filters are bypassed in
  // ranked mode (the spec wants the full set scored).
  const [ranked, setRanked] = useState(false);
  const [page, setPage] = useState(1);

  // Debounce the filter object before it hits the query layer — keeps
  // controlled inputs snappy while the API call lags at human-typing
  // cadence. Filter clicks (chips, selects) feel immediate-enough
  // through a 300ms delay; the keyword/number inputs benefit most.
  const debouncedFilters = useDebouncedValue(filters, 400);
  const apiFilters = useMemo(
    () => applicantFiltersToApi(debouncedFilters),
    [debouncedFilters],
  );
  const paginatedFilters = useMemo(
    () => ({ ...apiFilters, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    [apiFilters, page],
  );

  // Any filter / mode change resets to page 1 so the user doesn't end up
  // looking at an empty page 7 of a filter set that only has 1 page.
  // Tied to the debounced shape so we don't bounce back to page 1 on
  // every keystroke while the user is still typing.
  useEffect(() => {
    setPage(1);
  }, [apiFilters, ranked]);

  const jobQuery = useQuery({
    queryKey: queryKeys.jobs.detail(jobId),
    queryFn: () => jobsApi.get(jobId),
    enabled: !!jobId,
  });

  const queryKey = ranked
    ? queryKeys.applications.ranked(jobId)
    : queryKeys.applications.byJob(jobId, paginatedFilters);

  const { applicants, total, scoreByAppId, error, setStage, setError } = useApplicants({
    queryKey,
    fetcher: jobId
      ? ranked
        ? // Ranked endpoint doesn't paginate (it scores the full set).
          // Wrap the response so the hook's `{items, total}` contract holds.
          async () => {
            const items = await applicationsApi.ranked(jobId);
            return { items, total: items.length };
          }
        : async () => {
            const { items, total } = await applicationsApi.byJobWithCount(
              jobId,
              paginatedFilters,
            );
            return { items, total: total ?? items.length };
          }
      : null,
  });

  const onExport = () =>
    downloadFile(
      `/applications/by-job/${jobId}/export`,
      apiFilters as Record<string, unknown>,
      `candidates-${jobId}.csv`,
    ).catch((err) => {
      if (err instanceof ApiError) setError(err.detail);
      notifyError(err, "Export failed");
    });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
      <ApplicantFilterSidebar
        idPrefix="ja"
        value={filters}
        onChange={setFilters}
        onReset={() => setFilters(EMPTY_APPLICANT_FILTERS)}
      />

      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">
              {jobQuery.data ? jobQuery.data.title : "Applicants"}
            </h1>
            <p className="text-sm text-slate-500">
              {ranked
                ? "Sorted by fit score against this job's requirements. Filters are not applied in ranking mode."
                : "Candidate identity (name, email, resume) stays in the profile drawer to keep this view bias-free."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setRanked((v) => !v)}
              className={ranked ? "btn-primary text-xs" : "btn-secondary text-xs"}
              aria-pressed={ranked}
            >
              {ranked ? "✓ Ranked by fit" : "Rank by fit score"}
            </button>
            <button
              type="button"
              onClick={onExport}
              className="btn-secondary text-xs"
              disabled={applicants.length === 0}
              title="Download the current filtered applicants as CSV (no name/email)"
            >
              ⬇ Export CSV
            </button>
          </div>
        </div>

        <div className="sr-only" role="status" aria-live="polite">
          {`Showing ${applicants.length} of ${total} ${total === 1 ? "applicant" : "applicants"}`}
        </div>

        <ErrorBanner message={error} />

        {applicants.length === 0 ? (
          <div className="card text-slate-500">No applicants match these filters yet.</div>
        ) : (
          <ApplicantsTable
            applicants={applicants}
            scoreByAppId={ranked ? scoreByAppId : undefined}
            onStageChange={setStage}
            onProfileOpen={setNotesFor}
          />
        )}

        {!ranked ? (
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onChange={setPage}
            itemLabel="applicants"
          />
        ) : null}
      </section>

      {notesFor ? (
        <NotesDrawer application={notesFor} onClose={() => setNotesFor(null)} />
      ) : null}
    </div>
  );
}
