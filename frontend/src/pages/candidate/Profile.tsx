import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";

import { ApiError } from "@/api/client";
import { profileApi } from "@/api/endpoints";
import type { LocationType } from "@/api/types";
import { ErrorBanner } from "@/components/ErrorBanner";
import { TagInput } from "@/components/TagInput";

const schema = z.object({
  years_experience: z.coerce.number().int().min(0).max(60),
  expected_ctc: z.coerce.number().int().min(0),
});

type FormValues = z.infer<typeof schema>;

const LOCATION_OPTIONS: { value: LocationType; label: string }[] = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
];

export function CandidateProfilePage() {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [skills, setSkills] = useState<string[]>([]);
  const [locations, setLocations] = useState<LocationType[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      years_experience: 0,
      expected_ctc: 0,
    },
  });

  useEffect(() => {
    profileApi
      .get()
      .then((profile) => {
        if (!profile) return;
        setHasProfile(true);
        setSkills(profile.skills);
        setLocations(profile.preferred_locations);
        reset({
          years_experience: profile.years_experience,
          expected_ctc: profile.expected_ctc,
        });
      })
      .catch((err) => {
        if (err instanceof ApiError) setError(err.detail);
      });
  }, [reset]);

  const toggleLocation = (loc: LocationType) => {
    setLocations((prev) =>
      prev.includes(loc) ? prev.filter((l) => l !== loc) : [...prev, loc],
    );
  };

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    setSaved(false);
    try {
      await profileApi.upsert({
        skills,
        years_experience: values.years_experience,
        expected_ctc: values.expected_ctc,
        preferred_locations: locations,
      });
      setHasProfile(true);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Could not save profile");
    }
  });

  const clearProfile = async () => {
    if (!confirm("Delete your saved profile? Recommendations will stop showing until you save a new one.")) return;
    try {
      await profileApi.remove();
      setHasProfile(false);
      setSkills([]);
      setLocations([]);
      reset({ years_experience: 0, expected_ctc: 0 });
      setSaved(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Could not clear profile");
    }
  };

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
        <p className="mt-2 text-xs text-slate-500">
          Fields marked <span className="text-rose-600">*</span> are required.
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
          <label className="label" htmlFor="profile-skills">
            Your skills <span aria-hidden="true" className="text-rose-600">*</span>
            <span className="sr-only"> (required)</span>
          </label>
          <TagInput
            id="profile-skills"
            value={skills}
            onChange={setSkills}
            placeholder="Type a skill and press Enter (e.g. python, react)"
            ariaLabel="Your skills"
          />
          <p id="profile-skills-help" className="mt-1 text-xs text-slate-500">
            Press Enter or comma to add a skill. Click × to remove one. Up to 30 skills.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="profile-yoe">
              Years of experience <span aria-hidden="true" className="text-rose-600">*</span>
              <span className="sr-only"> (required)</span>
            </label>
            <input
              id="profile-yoe"
              className="input"
              type="number"
              min={0}
              aria-required="true"
              aria-invalid={errors.years_experience ? "true" : undefined}
              aria-describedby={errors.years_experience ? "profile-yoe-error" : undefined}
              {...register("years_experience")}
            />
            {errors.years_experience ? (
              <p id="profile-yoe-error" className="mt-1 text-xs text-rose-600" role="alert">
                {errors.years_experience.message}
              </p>
            ) : null}
          </div>
          <div>
            <label className="label" htmlFor="profile-ctc">
              Expected CTC (₹/year) <span aria-hidden="true" className="text-rose-600">*</span>
              <span className="sr-only"> (required)</span>
            </label>
            <input
              id="profile-ctc"
              className="input"
              type="number"
              min={0}
              aria-required="true"
              aria-invalid={errors.expected_ctc ? "true" : undefined}
              aria-describedby={errors.expected_ctc ? "profile-ctc-error" : undefined}
              {...register("expected_ctc")}
            />
            {errors.expected_ctc ? (
              <p id="profile-ctc-error" className="mt-1 text-xs text-rose-600" role="alert">
                {errors.expected_ctc.message}
              </p>
            ) : null}
          </div>
        </div>
        <fieldset>
          <legend className="label mb-0">Preferred locations</legend>
          <p className="mb-2 text-xs text-slate-500">
            Pick any combination. A job matching at least one of these gets a
            +10 location-fit bonus in your recommendations.
          </p>
          <div className="flex flex-wrap gap-2">
            {LOCATION_OPTIONS.map((opt) => {
              const checked = locations.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition ${
                    checked
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    checked={checked}
                    onChange={() => toggleLocation(opt.value)}
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-wrap justify-between gap-2">
          {hasProfile ? (
            <button type="button" onClick={clearProfile} className="btn-secondary text-sm text-rose-700">
              Delete profile
            </button>
          ) : <span />}
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting
              ? "Saving…"
              : hasProfile
                ? isDirty || skills.length > 0 || locations.length > 0
                  ? "Save changes"
                  : "Saved"
                : "Save profile"}
          </button>
        </div>
      </form>
    </div>
  );
}
