import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";

import { ApiError } from "@/api/client";
import { profileApi } from "@/api/endpoints";
import type { LocationType } from "@/api/types";
import { ErrorBanner } from "@/components/ErrorBanner";
import { splitCsv } from "@/lib/format";

const schema = z.object({
  skills: z.string(),
  years_experience: z.coerce.number().int().min(0).max(60),
  expected_ctc: z.coerce.number().int().min(0),
  preferred_location: z.union([z.literal(""), z.enum(["remote", "hybrid", "onsite"])]),
});

type FormValues = z.infer<typeof schema>;

export function CandidateProfilePage() {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      skills: "",
      years_experience: 0,
      expected_ctc: 0,
      preferred_location: "",
    },
  });

  useEffect(() => {
    profileApi
      .get()
      .then((profile) => {
        if (!profile) return;
        setHasProfile(true);
        reset({
          skills: profile.skills.join(", "),
          years_experience: profile.years_experience,
          expected_ctc: profile.expected_ctc,
          preferred_location: profile.preferred_location ?? "",
        });
      })
      .catch((err) => {
        if (err instanceof ApiError) setError(err.detail);
      });
  }, [reset]);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    setSaved(false);
    try {
      await profileApi.upsert({
        skills: splitCsv(values.skills),
        years_experience: values.years_experience,
        expected_ctc: values.expected_ctc,
        preferred_location: values.preferred_location ? (values.preferred_location as LocationType) : null,
      });
      setHasProfile(true);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Could not save profile");
    }
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Your profile</h1>
        <p className="text-sm text-slate-500">
          Tell us about yourself once and we&apos;ll surface matching jobs on the{" "}
          <Link to="/jobs?tab=recommended" className="text-brand-600 hover:underline">
            Recommended
          </Link>{" "}
          tab. Your profile is private &mdash; HR sees only the fields you submit per
          application.
        </p>
      </header>

      <form onSubmit={onSubmit} className="card space-y-4" noValidate>
        <ErrorBanner message={error} />
        {saved ? (
          <div role="status" aria-live="polite" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Profile saved. <Link to="/jobs?tab=recommended" className="font-medium underline">See recommendations →</Link>
          </div>
        ) : null}

        <div>
          <label className="label" htmlFor="profile-skills">Your skills (comma-separated)</label>
          <input
            id="profile-skills"
            className="input"
            placeholder="python, fastapi, react"
            aria-invalid={errors.skills ? "true" : undefined}
            {...register("skills")}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="profile-yoe">Years of experience</label>
            <input
              id="profile-yoe"
              className="input"
              type="number"
              min={0}
              aria-invalid={errors.years_experience ? "true" : undefined}
              {...register("years_experience")}
            />
            {errors.years_experience ? (
              <p className="mt-1 text-xs text-rose-600" role="alert">{errors.years_experience.message}</p>
            ) : null}
          </div>
          <div>
            <label className="label" htmlFor="profile-ctc">Expected CTC (₹/year)</label>
            <input
              id="profile-ctc"
              className="input"
              type="number"
              min={0}
              aria-invalid={errors.expected_ctc ? "true" : undefined}
              {...register("expected_ctc")}
            />
            {errors.expected_ctc ? (
              <p className="mt-1 text-xs text-rose-600" role="alert">{errors.expected_ctc.message}</p>
            ) : null}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="profile-location">Preferred location</label>
          <select
            id="profile-location"
            className="input"
            {...register("preferred_location")}
          >
            <option value="">No preference</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">On-site</option>
          </select>
        </div>

        <div className="flex justify-end gap-2">
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : hasProfile ? (isDirty ? "Save changes" : "Saved") : "Save profile"}
          </button>
        </div>
      </form>
    </div>
  );
}
