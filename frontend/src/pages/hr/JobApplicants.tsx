import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { ApiError, getToken } from "@/api/client";
import { applicationsApi, jobsApi, type ApplicantFilters } from "@/api/endpoints";
import type {
  Application,
  ApplicationScore,
  ApplicationStage,
  Job,
  RankedApplication,
} from "@/api/types";
import { APPLICATION_STAGES } from "@/api/types";
import { ErrorBanner } from "@/components/ErrorBanner";
import { NotesDrawer } from "@/components/NotesDrawer";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StageBadge } from "@/components/StageBadge";
import { TagInput } from "@/components/TagInput";
import { formatCtc, formatRelative, stageLabel } from "@/lib/format";

async function downloadExport(jobId: number, filters: ApplicantFilters) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) for (const item of v) sp.append(k, String(item));
    else sp.set(k, String(v));
  }
  const qs = sp.toString();
  const url = `/api/applications/by-job/${jobId}/export${qs ? `?${qs}` : ""}`;
  const token = getToken();
  const resp = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!resp.ok) throw new ApiError(resp.status, await resp.text());
  const blob = await resp.blob();
  const objectUrl = URL.createObjectURL(blob);
  const filename =
    resp.headers
      .get("Content-Disposition")
      ?.match(/filename="?([^"]+)"?/)?.[1] ?? `candidates-${jobId}.csv`;
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

interface FilterForm {
  stage: ApplicationStage | "";
  skills_any: string[];
  skills_all: string[];
  exp_min: string;
  exp_max: string;
  current_ctc_max: string;
  expected_ctc_max: string;
  notice_max_days: string;
  applied_after: string;
  applied_before: string;
  q: string;
  sort: "recent" | "expected_ctc" | "notice" | "experience";
}

const EMPTY_FILTERS: FilterForm = {
  stage: "",
  skills_any: [],
  skills_all: [],
  exp_min: "",
  exp_max: "",
  current_ctc_max: "",
  expected_ctc_max: "",
  notice_max_days: "",
  applied_after: "",
  applied_before: "",
  q: "",
  sort: "recent",
};

function toApi(f: FilterForm): ApplicantFilters {
  const out: ApplicantFilters = { sort: f.sort };
  if (f.stage) out.stage = f.stage;
  if (f.skills_any.length) out.skills_any = f.skills_any;
  if (f.skills_all.length) out.skills_all = f.skills_all;
  if (f.exp_min) out.exp_min = Number(f.exp_min);
  if (f.exp_max) out.exp_max = Number(f.exp_max);
  if (f.current_ctc_max) out.current_ctc_max = Number(f.current_ctc_max);
  if (f.expected_ctc_max) out.expected_ctc_max = Number(f.expected_ctc_max);
  if (f.notice_max_days) out.notice_max_days = Number(f.notice_max_days);
  if (f.applied_after) out.applied_after = f.applied_after;
  if (f.applied_before) out.applied_before = f.applied_before;
  if (f.q.trim()) out.q = f.q.trim();
  return out;
}

export function HrJobApplicantsPage() {
  const { id } = useParams<{ id: string }>();
  const jobId = Number(id);

  const [job, setJob] = useState<Job | null>(null);
  const [filters, setFilters] = useState<FilterForm>(EMPTY_FILTERS);
  const [applicants, setApplicants] = useState<Application[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notesFor, setNotesFor] = useState<Application | null>(null);
  // When ranked-mode is on, we fetch /ranked (ignoring filters/sort) so HR
  // can compare candidates against the job's requirements directly.
  const [ranked, setRanked] = useState(false);
  const [scoreByAppId, setScoreByAppId] = useState<Map<number, ApplicationScore>>(
    () => new Map(),
  );

  const apiFilters = useMemo(() => toApi(filters), [filters]);

  useEffect(() => {
    if (!jobId) return;
    jobsApi
      .get(jobId)
      .then(setJob)
      .catch((err) => setError(err instanceof ApiError ? err.detail : "Failed to load job"));
  }, [jobId]);

  const refresh = () => {
    if (!jobId) return;
    setError(null);
    if (ranked) {
      applicationsApi
        .ranked(jobId)
        .then((rows: RankedApplication[]) => {
          setApplicants(rows);
          setScoreByAppId(new Map(rows.map((r) => [r.id, r.score])));
        })
        .catch((err) =>
          setError(err instanceof ApiError ? err.detail : "Failed to load ranking"),
        );
    } else {
      applicationsApi
        .byJob(jobId, apiFilters)
        .then(setApplicants)
        .catch((err) =>
          setError(err instanceof ApiError ? err.detail : "Failed to load applicants"),
        );
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, apiFilters, ranked]);

  const setStage = async (appId: number, stage: ApplicationStage) => {
    try {
      await applicationsApi.setStage(appId, stage);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Could not update stage");
    }
  };

  const update = <K extends keyof FilterForm>(key: K, value: FilterForm[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
      <aside className="card h-fit space-y-3 lg:sticky lg:top-4">
        <h2 className="text-sm font-semibold text-slate-700">Filter applicants</h2>

        <div>
          <label className="label" htmlFor="ja-stage">Stage</label>
          <select
            id="ja-stage"
            className="input"
            value={filters.stage}
            onChange={(e) => update("stage", e.target.value as ApplicationStage | "")}
          >
            <option value="">All stages</option>
            {APPLICATION_STAGES.map((s) => (
              <option key={s} value={s}>{stageLabel(s)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="ja-q">Search cover note / skills</label>
          <input
            id="ja-q"
            className="input"
            placeholder="keyword"
            value={filters.q}
            onChange={(e) => update("q", e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="ja-skills-any">Skills (any of)</label>
          <TagInput
            id="ja-skills-any"
            value={filters.skills_any}
            onChange={(next) => update("skills_any", next)}
            placeholder="python, fastapi"
            ariaLabel="Match candidates with any of these skills"
          />
        </div>
        <div>
          <label className="label" htmlFor="ja-skills-all">Skills (all of)</label>
          <TagInput
            id="ja-skills-all"
            value={filters.skills_all}
            onChange={(next) => update("skills_all", next)}
            placeholder="python, postgres"
            ariaLabel="Match candidates with all of these skills"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="ja-exp-min">Min exp</label>
            <input id="ja-exp-min" className="input" type="number" min={0} value={filters.exp_min} onChange={(e) => update("exp_min", e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="ja-exp-max">Max exp</label>
            <input id="ja-exp-max" className="input" type="number" min={0} value={filters.exp_max} onChange={(e) => update("exp_max", e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="ja-current-ctc">Max current CTC</label>
          <input id="ja-current-ctc" className="input" type="number" min={0} value={filters.current_ctc_max} onChange={(e) => update("current_ctc_max", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="ja-expected-ctc">Max expected CTC</label>
          <input id="ja-expected-ctc" className="input" type="number" min={0} value={filters.expected_ctc_max} onChange={(e) => update("expected_ctc_max", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="notice-bucket">Notice period</label>
          <select
            id="notice-bucket"
            className="input"
            value={filters.notice_max_days}
            onChange={(e) => update("notice_max_days", e.target.value)}
          >
            <option value="">Any</option>
            <option value="0">Immediate joiner</option>
            <option value="15">≤ 15 days</option>
            <option value="30">≤ 30 days</option>
            <option value="60">≤ 60 days</option>
            <option value="90">≤ 90 days</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="ja-applied-after">Applied after</label>
            <input id="ja-applied-after" className="input" type="date" value={filters.applied_after} onChange={(e) => update("applied_after", e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="ja-applied-before">Applied before</label>
            <input id="ja-applied-before" className="input" type="date" value={filters.applied_before} onChange={(e) => update("applied_before", e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="ja-sort">Sort by</label>
          <select id="ja-sort" className="input" value={filters.sort} onChange={(e) => update("sort", e.target.value as FilterForm["sort"])}>
            <option value="recent">Most recent</option>
            <option value="expected_ctc">Lowest expected CTC</option>
            <option value="notice">Shortest notice period</option>
            <option value="experience">Most experienced</option>
          </select>
        </div>
        <button onClick={() => setFilters(EMPTY_FILTERS)} className="btn-secondary w-full text-sm">
          Reset filters
        </button>
      </aside>

      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{job ? job.title : "Applicants"}</h1>
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
              onClick={() =>
                downloadExport(jobId, apiFilters).catch((err) =>
                  setError(err instanceof ApiError ? err.detail : "Export failed"),
                )
              }
              className="btn-secondary text-xs"
              disabled={applicants.length === 0}
              title="Download the current filtered applicants as CSV (no name/email)"
            >
              ⬇ Export CSV
            </button>
          </div>
        </div>

        <div className="sr-only" role="status" aria-live="polite">
          {`Showing ${applicants.length} ${applicants.length === 1 ? "applicant" : "applicants"}`}
        </div>

        <ErrorBanner message={error} />

        {applicants.length === 0 ? (
          <div className="card text-slate-500">No applicants match these filters yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 rounded-lg bg-white text-sm ring-1 ring-slate-200">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" className="px-3 py-2">Applicant</th>
                  <th scope="col" className="px-3 py-2">Exp</th>
                  <th scope="col" className="px-3 py-2">Current</th>
                  <th scope="col" className="px-3 py-2">Expected</th>
                  <th scope="col" className="px-3 py-2">Notice</th>
                  <th scope="col" className="px-3 py-2">Skills</th>
                  <th scope="col" className="px-3 py-2">Applied</th>
                  <th scope="col" className="px-3 py-2">Stage</th>
                  <th scope="col" className="px-3 py-2"><span className="sr-only">Profile</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {applicants.map((a) => {
                  const score = scoreByAppId.get(a.id);
                  const matched = new Set(score?.matched_skills ?? []);
                  return (
                    <tr key={a.id}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-700">#{a.id}</span>
                          {ranked && score ? <ScoreBadge score={score} /> : null}
                        </div>
                        <div className="text-xs text-slate-500">{a.years_experience}y · {a.notice_period_days}d notice</div>
                      </td>
                      <td className="px-3 py-2 text-slate-700">{a.years_experience}y</td>
                      <td className="px-3 py-2 text-slate-700">{formatCtc(a.current_ctc)}</td>
                      <td className="px-3 py-2 text-slate-700">{formatCtc(a.expected_ctc)}</td>
                      <td className="px-3 py-2 text-slate-700">{a.notice_period_days}d</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {a.skills.slice(0, 4).map((s) => (
                            <span
                              key={s}
                              className={`badge ${
                                ranked && matched.has(s.toLowerCase())
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-brand-50 text-brand-700"
                              }`}
                            >
                              {s}
                            </span>
                          ))}
                          {a.skills.length > 4 ? <span className="text-xs text-slate-500">+{a.skills.length - 4}</span> : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-500">{formatRelative(a.created_at)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          <StageBadge stage={a.stage} />
                          <select
                            className="input py-0.5 text-xs"
                            value={a.stage}
                            onChange={(e) => setStage(a.id, e.target.value as ApplicationStage)}
                            aria-label={`Change stage for applicant ${a.id}`}
                          >
                            {APPLICATION_STAGES.map((s) => (
                              <option key={s} value={s}>{stageLabel(s)}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => setNotesFor(a)}
                          className="text-xs text-brand-600 hover:underline"
                          aria-label={`View profile for applicant ${a.id}`}
                        >
                          View profile
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {notesFor ? (
        <NotesDrawer application={notesFor} onClose={() => setNotesFor(null)} />
      ) : null}
    </div>
  );
}
