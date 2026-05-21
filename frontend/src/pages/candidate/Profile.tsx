import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";

import { profileApi } from "@/api/endpoints";
import { queryKeys } from "@/api/queryKeys";
import type {
  LocationType,
  ProfileEducation,
  ProfileExperience,
  ResumeUploadResponse,
} from "@/api/types";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ResumeUpload } from "@/components/ResumeUpload";
import { TagInput } from "@/components/TagInput";
import { notify, notifyError } from "@/lib/toast";

const schema = z.object({
  is_fresher: z.boolean(),
  years_experience: z.coerce.number().int().min(0).max(60),
  current_ctc: z.coerce.number().int().min(0),
  expected_ctc: z.coerce.number().int().min(0),
  notice_period_days: z.coerce.number().int().min(0).max(365),
});

type FormValues = z.infer<typeof schema>;

const LOCATION_OPTIONS: { value: LocationType; label: string }[] = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
];

const EMPTY_EXPERIENCE: ProfileExperience = {
  company: "",
  role: "",
  from_date: "",
  to_date: null,
  is_current: false,
  description: null,
};

const EMPTY_EDUCATION: ProfileEducation = {
  institution: "",
  degree: "",
  field_of_study: null,
  from_year: new Date().getFullYear() - 4,
  to_year: new Date().getFullYear(),
};

export function CandidateProfilePage() {
  const queryClient = useQueryClient();
  const [skills, setSkills] = useState<string[]>([]);
  const [locations, setLocations] = useState<LocationType[]>([]);
  const [experiences, setExperiences] = useState<ProfileExperience[]>([]);
  const [educations, setEducations] = useState<ProfileEducation[]>([]);
  const [resumeKey, setResumeKey] = useState<string | null>(null);
  const [resumeFilename, setResumeFilename] = useState<string | null>(null);
  const [resumeSize, setResumeSize] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      is_fresher: false,
      years_experience: 0,
      current_ctc: 0,
      expected_ctc: 0,
      notice_period_days: 30,
    },
  });

  const isFresher = watch("is_fresher");

  const profileQuery = useQuery({
    queryKey: queryKeys.profile.me(),
    queryFn: () => profileApi.get(),
  });

  // Hydrate local state from the loaded profile.
  useEffect(() => {
    const p = profileQuery.data;
    if (!p) return;
    setSkills(p.skills);
    setLocations(p.preferred_locations);
    setExperiences(p.experiences ?? []);
    setEducations(p.educations ?? []);
    setResumeKey(p.resume?.key ?? null);
    setResumeFilename(p.resume?.filename ?? null);
    setResumeSize(p.resume?.size_bytes ?? null);
    reset({
      is_fresher: p.is_fresher,
      years_experience: p.years_experience,
      current_ctc: p.current_ctc,
      expected_ctc: p.expected_ctc,
      notice_period_days: p.notice_period_days,
    });
  }, [profileQuery.data, reset]);

  // When fresher is ticked, force the work-experience fields to 0 — the
  // backend re-applies this rule on save, but mirroring it client-side
  // makes the form's disabled state honest.
  useEffect(() => {
    if (isFresher) {
      setValue("years_experience", 0);
      setValue("current_ctc", 0);
      setExperiences([]);
    }
  }, [isFresher, setValue]);

  const hasProfile = !!profileQuery.data;
  const queryError = profileQuery.error instanceof Error ? profileQuery.error.message : null;

  const saveMutation = useMutation({
    mutationFn: (values: FormValues) =>
      profileApi.upsert({
        skills,
        is_fresher: values.is_fresher,
        years_experience: values.years_experience,
        current_ctc: values.current_ctc,
        expected_ctc: values.expected_ctc,
        notice_period_days: values.notice_period_days,
        preferred_locations: locations,
        experiences: experiences.map(stripExperienceId),
        educations: educations.map(stripEducationId),
        // Real storage key — re-uploaded keys differ from the existing
        // one, which is how the backend knows to re-extract text.
        resume_key: resumeKey,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.me() });
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs.recommended() });
      notify.success("Profile saved.");
    },
    onError: (err) => notifyError(err, "Could not save profile"),
  });

  const clearMutation = useMutation({
    mutationFn: () => profileApi.remove(),
    onSuccess: () => {
      setSkills([]);
      setLocations([]);
      setExperiences([]);
      setEducations([]);
      setResumeKey(null);
      setResumeFilename(null);
      setResumeSize(null);
      reset({
        is_fresher: false,
        years_experience: 0,
        current_ctc: 0,
        expected_ctc: 0,
        notice_period_days: 30,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.me() });
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs.recommended() });
      notify.success("Profile cleared.");
    },
    onError: (err) => notifyError(err, "Could not clear profile"),
  });

  const toggleLocation = (loc: LocationType) =>
    setLocations((prev) =>
      prev.includes(loc) ? prev.filter((l) => l !== loc) : [...prev, loc],
    );

  const onResumeUploaded = (r: ResumeUploadResponse) => {
    setResumeKey(r.resume_key);
    setResumeFilename(r.filename);
    setResumeSize(r.size_bytes);
  };

  const onResumeCleared = () => {
    setResumeKey(null);
    setResumeFilename(null);
    setResumeSize(null);
  };

  const onSubmit = handleSubmit((values) => saveMutation.mutate(values));

  const clearProfile = () => {
    if (
      !confirm(
        "Delete your saved profile? You'll need to set it up again before applying or seeing recommendations.",
      )
    )
      return;
    clearMutation.mutate();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Your profile</h1>
        <p className="text-sm text-slate-500">
          Your profile is the source of truth for every application you submit —
          we snapshot your skills, experience, CTC, education, and resume at apply
          time and share them with the recruiter for that role.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Fields marked <span className="text-rose-600">*</span> are required.
        </p>
      </header>

      <form onSubmit={onSubmit} className="card space-y-5" noValidate>
        <ErrorBanner message={queryError} />

        {/* ----- Resume ----- */}
        <section className="space-y-2">
          <label className="label" htmlFor="profile-resume-file">
            Resume <span aria-hidden="true" className="text-rose-600">*</span>
            <span className="sr-only"> (required)</span>
          </label>
          <ResumeUpload
            initialFilename={resumeFilename}
            initialSizeBytes={resumeSize}
            onUploaded={onResumeUploaded}
            onCleared={onResumeCleared}
          />
        </section>

        {/* ----- Fresher checkbox ----- */}
        <section>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              {...register("is_fresher")}
            />
            <span>
              I'm a fresher with no prior work experience
            </span>
          </label>
          <p className="mt-1 text-xs text-slate-500">
            Ticking this clears your work-experience fields and hides the "Prior
            experience" section. You can still add education below.
          </p>
        </section>

        {/* ----- Skills ----- */}
        <section>
          <label className="label" htmlFor="profile-skills">
            Skills <span aria-hidden="true" className="text-rose-600">*</span>
            <span className="sr-only"> (required)</span>
          </label>
          <TagInput
            id="profile-skills"
            value={skills}
            onChange={setSkills}
            placeholder="Type a skill and press Enter (e.g. python, react)"
            ariaLabel="Your skills"
          />
        </section>

        {/* ----- Experience metrics ----- */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="profile-yoe">
              Total years of experience
            </label>
            <input
              id="profile-yoe"
              className="input"
              type="number"
              min={0}
              disabled={isFresher}
              aria-invalid={errors.years_experience ? "true" : undefined}
              {...register("years_experience")}
            />
          </div>
          <div>
            <label className="label" htmlFor="profile-notice">
              Notice period (days) <span aria-hidden="true" className="text-rose-600">*</span>
              <span className="sr-only"> (required)</span>
            </label>
            <input
              id="profile-notice"
              className="input"
              type="number"
              min={0}
              aria-required="true"
              {...register("notice_period_days")}
            />
          </div>
          <div>
            <label className="label" htmlFor="profile-current-ctc">
              Current CTC (₹/year)
            </label>
            <input
              id="profile-current-ctc"
              className="input"
              type="number"
              min={0}
              disabled={isFresher}
              {...register("current_ctc")}
            />
          </div>
          <div>
            <label className="label" htmlFor="profile-expected-ctc">
              Expected CTC (₹/year) <span aria-hidden="true" className="text-rose-600">*</span>
              <span className="sr-only"> (required)</span>
            </label>
            <input
              id="profile-expected-ctc"
              className="input"
              type="number"
              min={0}
              aria-required="true"
              {...register("expected_ctc")}
            />
          </div>
        </section>

        {/* ----- Preferred locations ----- */}
        <fieldset>
          <legend className="label mb-0">Preferred locations</legend>
          <p className="mb-2 text-xs text-slate-500">
            Pick any combination. Matching jobs get a +10 location bonus in your
            recommendations.
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

        {/* ----- Prior experience ----- */}
        {!isFresher ? (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Prior experience</h2>
              <button
                type="button"
                className="text-xs text-brand-700 hover:underline"
                onClick={() =>
                  setExperiences((prev) => [...prev, { ...EMPTY_EXPERIENCE }])
                }
              >
                + Add experience
              </button>
            </div>
            {experiences.length === 0 ? (
              <p className="text-xs text-slate-500">
                No prior roles added yet. Add one to share with recruiters.
              </p>
            ) : (
              <ul className="space-y-3">
                {experiences.map((exp, idx) => (
                  <li key={idx} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <input
                        className="input"
                        placeholder="Company"
                        value={exp.company}
                        onChange={(e) =>
                          updateExperience(setExperiences, idx, { company: e.target.value })
                        }
                      />
                      <input
                        className="input"
                        placeholder="Role"
                        value={exp.role}
                        onChange={(e) =>
                          updateExperience(setExperiences, idx, { role: e.target.value })
                        }
                      />
                      <input
                        type="date"
                        className="input"
                        aria-label="From date"
                        value={exp.from_date}
                        onChange={(e) =>
                          updateExperience(setExperiences, idx, { from_date: e.target.value })
                        }
                      />
                      <input
                        type="date"
                        className="input"
                        aria-label="To date"
                        value={exp.to_date ?? ""}
                        disabled={exp.is_current}
                        onChange={(e) =>
                          updateExperience(setExperiences, idx, {
                            to_date: e.target.value || null,
                          })
                        }
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          checked={exp.is_current}
                          onChange={(e) =>
                            updateExperience(setExperiences, idx, {
                              is_current: e.target.checked,
                              to_date: e.target.checked ? null : exp.to_date,
                            })
                          }
                        />
                        Currently working here
                      </label>
                      <button
                        type="button"
                        className="text-xs text-rose-600 hover:underline"
                        onClick={() =>
                          setExperiences((prev) => prev.filter((_, i) => i !== idx))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {/* ----- Education ----- */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Education</h2>
            <button
              type="button"
              className="text-xs text-brand-700 hover:underline"
              onClick={() =>
                setEducations((prev) => [...prev, { ...EMPTY_EDUCATION }])
              }
            >
              + Add education
            </button>
          </div>
          {educations.length === 0 ? (
            <p className="text-xs text-slate-500">
              No education added yet. Add a degree or certification.
            </p>
          ) : (
            <ul className="space-y-3">
              {educations.map((edu, idx) => (
                <li key={idx} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <input
                      className="input"
                      placeholder="Institution (e.g. IIT Bombay)"
                      value={edu.institution}
                      onChange={(e) =>
                        updateEducation(setEducations, idx, { institution: e.target.value })
                      }
                    />
                    <input
                      className="input"
                      placeholder="Degree (e.g. B.Tech)"
                      value={edu.degree}
                      onChange={(e) =>
                        updateEducation(setEducations, idx, { degree: e.target.value })
                      }
                    />
                    <input
                      className="input"
                      placeholder="Field (e.g. Computer Science)"
                      value={edu.field_of_study ?? ""}
                      onChange={(e) =>
                        updateEducation(setEducations, idx, {
                          field_of_study: e.target.value || null,
                        })
                      }
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        min={1950}
                        max={2100}
                        placeholder="From year"
                        className="input"
                        aria-label="From year"
                        value={edu.from_year}
                        onChange={(e) =>
                          updateEducation(setEducations, idx, {
                            from_year: Number(e.target.value),
                          })
                        }
                      />
                      <input
                        type="number"
                        min={1950}
                        max={2100}
                        placeholder="To year"
                        className="input"
                        aria-label="To year"
                        value={edu.to_year ?? ""}
                        onChange={(e) =>
                          updateEducation(setEducations, idx, {
                            to_year: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      className="text-xs text-rose-600 hover:underline"
                      onClick={() =>
                        setEducations((prev) => prev.filter((_, i) => i !== idx))
                      }
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ----- Save / clear ----- */}
        <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-4">
          <div className="text-xs text-slate-500">
            Once saved, you can apply to any job with one click —{" "}
            <Link to="/jobs" className="text-brand-700 hover:underline">
              Browse jobs
            </Link>
            .
          </div>
          <div className="flex flex-wrap gap-2">
            {hasProfile ? (
              <button
                type="button"
                onClick={clearProfile}
                className="btn-secondary text-sm text-rose-700"
                disabled={clearMutation.isPending}
              >
                {clearMutation.isPending ? "Deleting…" : "Delete profile"}
              </button>
            ) : null}
            <button type="submit" className="btn-primary" disabled={saveMutation.isPending}>
              {saveMutation.isPending
                ? "Saving…"
                : hasProfile
                  ? "Save changes"
                  : "Save profile"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}


function updateExperience(
  setter: React.Dispatch<React.SetStateAction<ProfileExperience[]>>,
  index: number,
  patch: Partial<ProfileExperience>,
): void {
  setter((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
}

function updateEducation(
  setter: React.Dispatch<React.SetStateAction<ProfileEducation[]>>,
  index: number,
  patch: Partial<ProfileEducation>,
): void {
  setter((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
}

function stripExperienceId(e: ProfileExperience): Omit<ProfileExperience, "id"> {
  const { id: _ignored, ...rest } = e;
  return rest;
}

function stripEducationId(e: ProfileEducation): Omit<ProfileEducation, "id"> {
  const { id: _ignored, ...rest } = e;
  return rest;
}
