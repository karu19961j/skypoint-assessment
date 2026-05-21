import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "@/api/client";
import { applicationsApi, jobsApi, type CrossJobApplicantFilters } from "@/api/endpoints";
import type { Application, ApplicationStage, Job } from "@/api/types";
import { APPLICATION_STAGES } from "@/api/types";
import { ErrorBanner } from "@/components/ErrorBanner";
import { NotesDrawer } from "@/components/NotesDrawer";
import { StageBadge } from "@/components/StageBadge";
import { formatCtc, formatRelative, splitCsv, stageLabel } from "@/lib/format";

interface FilterForm {
  job_id: string;
  stage: ApplicationStage | "";
  skills_any: string;
  skills_all: string;
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

const EMPTY: FilterForm = {
  job_id: "",
  stage: "",
  skills_any: "",
  skills_all: "",
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

function toApi(f: FilterForm): CrossJobApplicantFilters {
  const out: CrossJobApplicantFilters = { sort: f.sort };
  if (f.job_id) out.job_id = Number(f.job_id);
  if (f.stage) out.stage = f.stage;
  const any = splitCsv(f.skills_any);
  if (any.length) out.skills_any = any;
  const all = splitCsv(f.skills_all);
  if (all.length) out.skills_all = all;
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

export function HrAllApplicantsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filters, setFilters] = useState<FilterForm>(EMPTY);
  const [applicants, setApplicants] = useState<Application[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notesFor, setNotesFor] = useState<Application | null>(null);
  const apiFilters = useMemo(() => toApi(filters), [filters]);

  useEffect(() => {
    jobsApi
      .list({ mine: true })
      .then(setJobs)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    applicationsApi
      .all(apiFilters)
      .then((rows) => {
        if (!cancelled) setApplicants(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.detail : "Failed to load applicants");
      });
    return () => {
      cancelled = true;
    };
  }, [apiFilters]);

  const setStage = async (appId: number, stage: ApplicationStage) => {
    try {
      const updated = await applicationsApi.setStage(appId, stage);
      setApplicants((prev) => prev.map((a) => (a.id === appId ? { ...a, ...updated } : a)));
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Could not update stage");
    }
  };

  const update = <K extends keyof FilterForm>(key: K, value: FilterForm[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

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
      <aside className="card h-fit space-y-3 lg:sticky lg:top-4">
        <h2 className="text-sm font-semibold text-slate-700">Filter applicants</h2>

        <div>
          <label className="label" htmlFor="filter-job">
            Job
          </label>
          <select
            id="filter-job"
            className="input"
            value={filters.job_id}
            onChange={(e) => update("job_id", e.target.value)}
          >
            <option value="">All my jobs</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Stage</label>
          <select
            className="input"
            value={filters.stage}
            onChange={(e) => update("stage", e.target.value as ApplicationStage | "")}
          >
            <option value="">All stages</option>
            {APPLICATION_STAGES.map((s) => (
              <option key={s} value={s}>
                {stageLabel(s)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Search cover note / skills</label>
          <input
            className="input"
            placeholder="keyword"
            value={filters.q}
            onChange={(e) => update("q", e.target.value)}
          />
        </div>
        <div>
          <label className="label">Skills (any of)</label>
          <input
            className="input"
            placeholder="python, fastapi"
            value={filters.skills_any}
            onChange={(e) => update("skills_any", e.target.value)}
          />
        </div>
        <div>
          <label className="label">Skills (all of)</label>
          <input
            className="input"
            placeholder="python, postgres"
            value={filters.skills_all}
            onChange={(e) => update("skills_all", e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Min exp</label>
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
        <div>
          <label className="label">Max current CTC</label>
          <input
            className="input"
            type="number"
            min={0}
            value={filters.current_ctc_max}
            onChange={(e) => update("current_ctc_max", e.target.value)}
          />
        </div>
        <div>
          <label className="label">Max expected CTC</label>
          <input
            className="input"
            type="number"
            min={0}
            value={filters.expected_ctc_max}
            onChange={(e) => update("expected_ctc_max", e.target.value)}
          />
        </div>
        <div>
          <label className="label">Max notice (days)</label>
          <input
            className="input"
            type="number"
            min={0}
            value={filters.notice_max_days}
            onChange={(e) => update("notice_max_days", e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Applied after</label>
            <input
              className="input"
              type="date"
              value={filters.applied_after}
              onChange={(e) => update("applied_after", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Applied before</label>
            <input
              className="input"
              type="date"
              value={filters.applied_before}
              onChange={(e) => update("applied_before", e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label">Sort by</label>
          <select
            className="input"
            value={filters.sort}
            onChange={(e) => update("sort", e.target.value as FilterForm["sort"])}
          >
            <option value="recent">Most recent</option>
            <option value="expected_ctc">Lowest expected CTC</option>
            <option value="notice">Shortest notice period</option>
            <option value="experience">Most experienced</option>
          </select>
        </div>
        <button onClick={() => setFilters(EMPTY)} className="btn-secondary w-full text-sm">
          Reset filters
        </button>
      </aside>

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
              onClick={() => update("stage", filters.stage === s ? "" : s)}
              className={`card flex flex-col items-start text-left transition ${
                filters.stage === s ? "ring-2 ring-brand-500" : "hover:bg-slate-50"
              }`}
              aria-pressed={filters.stage === s}
            >
              <span className="text-xs uppercase tracking-wider text-slate-500">
                {stageLabel(s)}
              </span>
              <span className="mt-1 text-xl font-semibold text-slate-900">{totals[s]}</span>
            </button>
          ))}
        </div>

        <ErrorBanner message={error} />

        {applicants.length === 0 ? (
          <div className="card text-slate-500">No applicants match these filters yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 rounded-lg bg-white text-sm ring-1 ring-slate-200">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" className="px-3 py-2">
                    Candidate
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Applied to
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Exp
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Current
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Expected
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Notice
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Skills
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Applied
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Stage
                  </th>
                  <th scope="col" className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {applicants.map((a) => (
                  <tr key={a.id}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">
                        {a.candidate?.full_name ?? "—"}
                      </div>
                      <div className="text-xs text-slate-500">{a.candidate?.email}</div>
                      <a
                        href={a.resume_link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-brand-600 hover:underline"
                        aria-label={`Open ${a.candidate?.full_name ?? "candidate"}'s resume in a new tab`}
                      >
                        Resume ↗
                      </a>
                    </td>
                    <td className="px-3 py-2">
                      {a.job ? (
                        <Link
                          to={`/hr/jobs/${a.job.id}/applicants`}
                          className="text-slate-900 hover:text-brand-700"
                        >
                          {a.job.title}
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                      {a.job ? (
                        <div className="text-xs text-slate-500">{a.job.department}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{a.years_experience}y</td>
                    <td className="px-3 py-2 text-slate-700">{formatCtc(a.current_ctc)}</td>
                    <td className="px-3 py-2 text-slate-700">{formatCtc(a.expected_ctc)}</td>
                    <td className="px-3 py-2 text-slate-700">{a.notice_period_days}d</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {a.skills.slice(0, 4).map((s) => (
                          <span key={s} className="badge bg-brand-50 text-brand-700">
                            {s}
                          </span>
                        ))}
                        {a.skills.length > 4 ? (
                          <span className="text-xs text-slate-500">+{a.skills.length - 4}</span>
                        ) : null}
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
                          aria-label={`Change stage for ${a.candidate?.full_name ?? "applicant"}`}
                        >
                          {APPLICATION_STAGES.map((s) => (
                            <option key={s} value={s}>
                              {stageLabel(s)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => setNotesFor(a)}
                        className="text-xs text-brand-600 hover:underline"
                      >
                        Notes
                      </button>
                    </td>
                  </tr>
                ))}
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
