import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { applicationsApi, bookmarksApi, jobsApi, profileApi } from "@/api/endpoints";
import { queryKeys } from "@/api/queryKeys";
import type { ApplicationCreate } from "@/api/types";
import { DeadlinePill } from "@/components/DeadlinePill";
import { ErrorBanner } from "@/components/ErrorBanner";
import {
  employmentLabel,
  formatCtcRange,
  formatExp,
  locationLabel,
} from "@/lib/format";
import { notify, notifyError } from "@/lib/toast";

export function CandidateJobDetailPage() {
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const jobId = Number(id);

  const [showForm, setShowForm] = useState(false);
  const [coverNote, setCoverNote] = useState("");

  const jobQuery = useQuery({
    queryKey: queryKeys.jobs.detail(jobId),
    queryFn: () => jobsApi.get(jobId),
    enabled: !!jobId,
  });

  const bookmarksQuery = useQuery({
    queryKey: queryKeys.bookmarks.all(),
    queryFn: () => bookmarksApi.list(),
  });
  const isBookmarked = (bookmarksQuery.data ?? []).some((b) => b.job_id === jobId);

  const myApps = useQuery({
    queryKey: queryKeys.applications.mine({}),
    queryFn: () => applicationsApi.mine(),
  });
  const applied = (myApps.data ?? []).some((a) => a.job_id === jobId);

  // Profile drives apply readiness — no profile → CTA to /me/profile;
  // no resume on profile → CTA to upload one. UI gating mirrors what
  // the backend would reject (profile is required server-side; resume
  // is best-effort but enforced UI-side for a clean candidate flow).
  const profileQuery = useQuery({
    queryKey: queryKeys.profile.me(),
    queryFn: () => profileApi.get(),
  });
  const profile = profileQuery.data;
  const profileMissing = !profile;
  const resumeMissing = !!profile && !profile.resume;
  const canApply = !!profile && !!profile.resume;

  const addBookmark = useMutation({
    mutationFn: () => bookmarksApi.add(jobId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.bookmarks.all() }),
    onError: (err) => notifyError(err, "Could not save job"),
  });
  const removeBookmark = useMutation({
    mutationFn: () => bookmarksApi.remove(jobId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.bookmarks.all() }),
    onError: (err) => notifyError(err, "Could not remove bookmark"),
  });
  const toggleBookmark = () =>
    isBookmarked ? removeBookmark.mutate() : addBookmark.mutate();

  const applyMutation = useMutation({
    mutationFn: (payload: ApplicationCreate) => applicationsApi.apply(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.applications.all() });
      setShowForm(false);
      setCoverNote("");
      notify.success("Application submitted.");
    },
    onError: (err) => notifyError(err, "Failed to apply"),
  });

  const onApply = (e: React.FormEvent) => {
    e.preventDefault();
    applyMutation.mutate({ job_id: jobId, cover_note: coverNote.trim() });
  };

  const job = jobQuery.data;
  const jobError = jobQuery.error instanceof Error ? jobQuery.error.message : null;

  if (!job) {
    return <div className="text-slate-500">{jobError ?? "Loading…"}</div>;
  }

  return (
    <div className="space-y-6">
      <Link to="/jobs" className="text-sm text-brand-600 hover:underline">
        &larr; Back to jobs
      </Link>

      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{job.title}</h1>
            <p className="text-slate-500">
              {job.department} · {locationLabel(job.location_type)} ·{" "}
              {employmentLabel(job.employment_type)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={toggleBookmark} className="btn-secondary text-xs">
              {isBookmarked ? "★ Saved" : "☆ Save"}
            </button>
            {applied ? (
              <span className="badge bg-emerald-100 text-emerald-800">Applied</span>
            ) : (
              <button onClick={() => setShowForm((v) => !v)} className="btn-primary">
                {showForm ? "Cancel" : "Apply now"}
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="badge bg-slate-100 text-slate-700">{formatExp(job.exp_min, job.exp_max)}</span>
          <span className="badge bg-emerald-100 text-emerald-800">
            {formatCtcRange(job.ctc_min, job.ctc_max)}
          </span>
          <DeadlinePill deadline={job.deadline} />
          {job.skills.map((s) => (
            <span key={s} className="badge bg-brand-50 text-brand-700">
              {s}
            </span>
          ))}
        </div>

        <div className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
          {job.description}
        </div>
      </div>

      {showForm && !applied ? (
        <form onSubmit={onApply} className="card space-y-4" noValidate>
          <h2 className="text-lg font-semibold">Apply to {job.title}</h2>
          <p className="text-xs text-slate-500">
            Your profile travels with this application — we'll share your skills,
            experience, education, expected CTC, notice period, and resume with
            the recruiter for this role. Edit them anytime on{" "}
            <Link to="/me/profile" className="text-brand-700 hover:underline">
              /me/profile
            </Link>
            .
          </p>

          {profileMissing ? (
            <div
              role="alert"
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
            >
              You don't have a profile yet.{" "}
              <Link
                to="/me/profile"
                className="font-medium text-amber-900 underline"
              >
                Complete your profile
              </Link>{" "}
              before applying.
            </div>
          ) : resumeMissing ? (
            <div
              role="alert"
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
            >
              Upload your CV on{" "}
              <Link
                to="/me/profile"
                className="font-medium text-amber-900 underline"
              >
                your profile
              </Link>{" "}
              so it can be shared with this application.
            </div>
          ) : null}

          <div>
            <label className="label" htmlFor="apply-cover">
              Cover note <span className="text-xs font-normal text-slate-500">(optional)</span>
            </label>
            <textarea
              id="apply-cover"
              className="input min-h-[140px]"
              placeholder="Anything you want the hiring team to know about you for this specific role…"
              value={coverNote}
              onChange={(e) => setCoverNote(e.target.value)}
              maxLength={5000}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={applyMutation.isPending || !canApply}
            >
              {applyMutation.isPending ? "Submitting…" : "Submit application"}
            </button>
          </div>
        </form>
      ) : null}

      <ErrorBanner message={jobError} />
    </div>
  );
}
