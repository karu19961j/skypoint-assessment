import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useParams } from "react-router-dom";
import { z } from "zod";

import { ApiError } from "@/api/client";
import { applicationsApi, bookmarksApi, jobsApi } from "@/api/endpoints";
import type { Job, ResumeUploadResponse } from "@/api/types";
import { DeadlinePill } from "@/components/DeadlinePill";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ResumeUpload } from "@/components/ResumeUpload";
import { TagInput } from "@/components/TagInput";
import {
  employmentLabel,
  formatCtcRange,
  formatExp,
  locationLabel,
} from "@/lib/format";

const applySchema = z.object({
  cover_note: z.string().max(5000, "Cover note too long"),
  current_ctc: z.coerce.number().int().min(0),
  expected_ctc: z.coerce.number().int().min(0),
  notice_period_days: z.coerce.number().int().min(0).max(365),
  years_experience: z.coerce.number().int().min(0).max(60),
});

type ApplyValues = z.infer<typeof applySchema>;

export function CandidateJobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const jobId = Number(id);

  const [job, setJob] = useState<Job | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [applied, setApplied] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skills, setSkills] = useState<string[]>([]);
  const [resume, setResume] = useState<ResumeUploadResponse | null>(null);
  const [autofillNotice, setAutofillNotice] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ApplyValues>({
    resolver: zodResolver(applySchema),
    defaultValues: {
      cover_note: "",
      current_ctc: 0,
      expected_ctc: 0,
      notice_period_days: 30,
      years_experience: 0,
    },
  });

  useEffect(() => {
    if (!jobId) return;
    setError(null);
    jobsApi
      .get(jobId)
      .then(setJob)
      .catch((err) => setError(err instanceof ApiError ? err.detail : "Could not load job"));

    bookmarksApi
      .list()
      .then((rows) => setIsBookmarked(rows.some((b) => b.job_id === jobId)))
      .catch(() => undefined);

    applicationsApi
      .mine()
      .then((apps) => setApplied(apps.some((a) => a.job_id === jobId)))
      .catch(() => undefined);
  }, [jobId]);

  const toggleBookmark = async () => {
    try {
      if (isBookmarked) {
        await bookmarksApi.remove(jobId);
        setIsBookmarked(false);
      } else {
        await bookmarksApi.add(jobId);
        setIsBookmarked(true);
      }
    } catch (err) {
      if (err instanceof ApiError) setError(err.detail);
    }
  };

  const onResumeUploaded = (result: ResumeUploadResponse) => {
    setResume(result);
    // Apply autofill: skills (merge with whatever the candidate already
    // typed) and years_experience (only if non-null and the form value
    // is still the default 0 — never clobber an explicit entry).
    const newSkills = Array.from(
      new Set([...skills, ...result.autofill.skills.filter(Boolean)]),
    );
    const skillsChanged = newSkills.length !== skills.length;
    if (skillsChanged) setSkills(newSkills);

    let yoeApplied = false;
    if (result.autofill.years_experience !== null) {
      setValue("years_experience", result.autofill.years_experience, {
        shouldValidate: true,
      });
      yoeApplied = true;
    }

    if (skillsChanged || yoeApplied) {
      const bits: string[] = [];
      if (skillsChanged)
        bits.push(`${result.autofill.skills.length} matching skill${result.autofill.skills.length === 1 ? "" : "s"}`);
      if (yoeApplied) bits.push(`${result.autofill.years_experience} year experience`);
      setAutofillNotice(
        `Pre-filled ${bits.join(" and ")} from your resume — please review before submitting.`,
      );
    } else {
      setAutofillNotice(null);
    }
  };

  const onApply = handleSubmit(async (values) => {
    setError(null);
    try {
      await applicationsApi.apply({
        job_id: jobId,
        resume_key: resume?.resume_key ?? null,
        cover_note: values.cover_note,
        current_ctc: values.current_ctc,
        expected_ctc: values.expected_ctc,
        notice_period_days: values.notice_period_days,
        years_experience: values.years_experience,
        skills,
      });
      setApplied(true);
      setShowForm(false);
      setSkills([]);
      setResume(null);
      setAutofillNotice(null);
      reset();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Failed to apply");
    }
  });

  if (!job) {
    return <div className="text-slate-500">{error ?? "Loading…"}</div>;
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
            Fields marked <span className="text-rose-600">*</span> are required.
          </p>
          <ErrorBanner message={error} />

          <div>
            <label className="label" htmlFor="apply-resume-file">
              Resume <span aria-hidden="true" className="text-rose-600">*</span>
              <span className="sr-only"> (required)</span>
            </label>
            <ResumeUpload jobId={jobId} onUploaded={onResumeUploaded} />
            {autofillNotice ? (
              <div
                className="mt-2 rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800"
                role="status"
              >
                ✨ {autofillNotice}
              </div>
            ) : null}
          </div>
          <div>
            <label className="label" htmlFor="apply-cover">Cover note</label>
            <textarea
              id="apply-cover"
              className="input min-h-[120px]"
              aria-invalid={errors.cover_note ? "true" : undefined}
              aria-describedby={errors.cover_note ? "apply-cover-error" : undefined}
              {...register("cover_note")}
            />
            {errors.cover_note && (
              <p id="apply-cover-error" role="alert" className="mt-1 text-xs text-rose-600">
                {errors.cover_note.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="apply-yoe">
                Years of experience <span aria-hidden="true" className="text-rose-600">*</span>
                <span className="sr-only"> (required)</span>
              </label>
              <input
                id="apply-yoe"
                className="input"
                type="number"
                min={0}
                aria-required="true"
                aria-invalid={errors.years_experience ? "true" : undefined}
                {...register("years_experience")}
              />
            </div>
            <div>
              <label className="label" htmlFor="apply-notice">
                Notice period (days) <span aria-hidden="true" className="text-rose-600">*</span>
                <span className="sr-only"> (required)</span>
              </label>
              <input
                id="apply-notice"
                className="input"
                type="number"
                min={0}
                aria-required="true"
                aria-invalid={errors.notice_period_days ? "true" : undefined}
                {...register("notice_period_days")}
              />
            </div>
            <div>
              <label className="label" htmlFor="apply-current-ctc">
                Current CTC (₹) <span aria-hidden="true" className="text-rose-600">*</span>
                <span className="sr-only"> (required)</span>
              </label>
              <input
                id="apply-current-ctc"
                className="input"
                type="number"
                min={0}
                aria-required="true"
                {...register("current_ctc")}
              />
            </div>
            <div>
              <label className="label" htmlFor="apply-expected-ctc">
                Expected CTC (₹) <span aria-hidden="true" className="text-rose-600">*</span>
                <span className="sr-only"> (required)</span>
              </label>
              <input
                id="apply-expected-ctc"
                className="input"
                type="number"
                min={0}
                aria-required="true"
                {...register("expected_ctc")}
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="apply-skills">Key skills</label>
            <TagInput
              id="apply-skills"
              value={skills}
              onChange={setSkills}
              placeholder="Type a skill and press Enter (e.g. python, fastapi)"
              ariaLabel="Your key skills"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting || !resume}>
              {isSubmitting ? "Submitting…" : "Submit application"}
            </button>
          </div>
        </form>
      ) : null}

      {error && !showForm ? <ErrorBanner message={error} /> : null}
    </div>
  );
}
