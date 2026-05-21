import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import { applicationsApi, jobsApi, type ApplicantFilters } from "@/api/endpoints";
import type { Application, ApplicationNote, ApplicationStage, Job } from "@/api/types";
import { APPLICATION_STAGES } from "@/api/types";
import { ApplicationTimeline } from "@/components/ApplicationTimeline";
import { ErrorBanner } from "@/components/ErrorBanner";
import { StageBadge } from "@/components/StageBadge";
import {
  formatCtc,
  formatRelative,
  splitCsv,
  stageLabel,
} from "@/lib/format";

interface FilterForm {
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

const EMPTY_FILTERS: FilterForm = {
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

function toApi(f: FilterForm): ApplicantFilters {
  const out: ApplicantFilters = { sort: f.sort };
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

export function HrJobApplicantsPage() {
  const { id } = useParams<{ id: string }>();
  const jobId = Number(id);

  const [job, setJob] = useState<Job | null>(null);
  const [filters, setFilters] = useState<FilterForm>(EMPTY_FILTERS);
  const [applicants, setApplicants] = useState<Application[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notesFor, setNotesFor] = useState<Application | null>(null);

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
    applicationsApi
      .byJob(jobId, apiFilters)
      .then(setApplicants)
      .catch((err) => setError(err instanceof ApiError ? err.detail : "Failed to load applicants"));
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, apiFilters]);

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
          <label className="label">Stage</label>
          <select
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
            <input className="input" type="number" min={0} value={filters.exp_min} onChange={(e) => update("exp_min", e.target.value)} />
          </div>
          <div>
            <label className="label">Max exp</label>
            <input className="input" type="number" min={0} value={filters.exp_max} onChange={(e) => update("exp_max", e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Max current CTC</label>
          <input className="input" type="number" min={0} value={filters.current_ctc_max} onChange={(e) => update("current_ctc_max", e.target.value)} />
        </div>
        <div>
          <label className="label">Max expected CTC</label>
          <input className="input" type="number" min={0} value={filters.expected_ctc_max} onChange={(e) => update("expected_ctc_max", e.target.value)} />
        </div>
        <div>
          <label className="label">Max notice (days)</label>
          <input className="input" type="number" min={0} value={filters.notice_max_days} onChange={(e) => update("notice_max_days", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Applied after</label>
            <input className="input" type="date" value={filters.applied_after} onChange={(e) => update("applied_after", e.target.value)} />
          </div>
          <div>
            <label className="label">Applied before</label>
            <input className="input" type="date" value={filters.applied_before} onChange={(e) => update("applied_before", e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Sort by</label>
          <select className="input" value={filters.sort} onChange={(e) => update("sort", e.target.value as FilterForm["sort"])}>
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
        <div>
          <h1 className="text-2xl font-semibold">{job ? job.title : "Applicants"}</h1>
          <p className="text-sm text-slate-500">{applicants.length} applicant{applicants.length === 1 ? "" : "s"}</p>
        </div>

        <ErrorBanner message={error} />

        {applicants.length === 0 ? (
          <div className="card text-slate-500">No applicants match these filters yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 rounded-lg bg-white text-sm ring-1 ring-slate-200">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2">Candidate</th>
                  <th className="px-3 py-2">Exp</th>
                  <th className="px-3 py-2">Current</th>
                  <th className="px-3 py-2">Expected</th>
                  <th className="px-3 py-2">Notice</th>
                  <th className="px-3 py-2">Skills</th>
                  <th className="px-3 py-2">Applied</th>
                  <th className="px-3 py-2">Stage</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {applicants.map((a) => (
                  <tr key={a.id}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{a.candidate?.full_name ?? "—"}</div>
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
                    <td className="px-3 py-2 text-slate-700">{a.years_experience}y</td>
                    <td className="px-3 py-2 text-slate-700">{formatCtc(a.current_ctc)}</td>
                    <td className="px-3 py-2 text-slate-700">{formatCtc(a.expected_ctc)}</td>
                    <td className="px-3 py-2 text-slate-700">{a.notice_period_days}d</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {a.skills.slice(0, 4).map((s) => (
                          <span key={s} className="badge bg-brand-50 text-brand-700">{s}</span>
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
                          aria-label={`Change stage for ${a.candidate?.full_name ?? "applicant"}`}
                        >
                          {APPLICATION_STAGES.map((s) => (
                            <option key={s} value={s}>{stageLabel(s)}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => setNotesFor(a)} className="text-xs text-brand-600 hover:underline">
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
        <NotesDrawer
          application={notesFor}
          onClose={() => setNotesFor(null)}
        />
      ) : null}
    </div>
  );
}

function NotesDrawer({ application, onClose }: { application: Application; onClose: () => void }) {
  const [notes, setNotes] = useState<ApplicationNote[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = () => {
    applicationsApi
      .listNotes(application.id)
      .then(setNotes)
      .catch((err) => setError(err instanceof ApiError ? err.detail : "Failed to load notes"));
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [application.id]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await applicationsApi.addNote(application.id, body.trim());
      setBody("");
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notes-drawer-heading"
    >
      <div className="w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 id="notes-drawer-heading" className="text-lg font-semibold">Notes</h2>
            <p className="text-sm text-slate-500">
              About {application.candidate?.full_name ?? "candidate"} — visible to HR only.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700"
            aria-label="Close notes drawer"
          >
            ✕
          </button>
        </div>

        <ErrorBanner message={error} />

        <form onSubmit={add} className="mt-4 space-y-2">
          <textarea
            className="input min-h-[80px]"
            placeholder="Add a private note about this candidate…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <button type="submit" className="btn-primary text-sm" disabled={saving || !body.trim()}>
            {saving ? "Saving…" : "Add note"}
          </button>
        </form>

        <div className="mt-6 space-y-3">
          {notes.length === 0 ? (
            <p className="text-sm text-slate-500">No notes yet.</p>
          ) : (
            notes.map((n) => (
              <div key={n.id} className="rounded-md border border-slate-200 p-3">
                <div className="text-xs text-slate-500">{formatRelative(n.created_at)}</div>
                <div className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{n.body}</div>
              </div>
            ))
          )}
        </div>

        <div className="mt-6 border-t border-slate-200 pt-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Stage history</h3>
          <ApplicationTimeline applicationId={application.id} />
        </div>
      </div>
    </div>
  );
}
