import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { ApiError } from "@/api/client";
import { jobsApi } from "@/api/endpoints";
import { ErrorBanner } from "@/components/ErrorBanner";
import { TagInput } from "@/components/TagInput";

const schema = z
  .object({
    title: z.string().min(1, "Required").max(200),
    description: z.string().min(1, "Required"),
    department: z.string().min(1, "Required").max(100),
    location_type: z.enum(["remote", "hybrid", "onsite"]),
    employment_type: z.enum(["full_time", "part_time", "contract", "internship"]),
    exp_min: z.coerce.number().int().min(0).max(60),
    exp_max: z.coerce.number().int().min(0).max(60),
    ctc_min: z.coerce.number().int().min(0),
    ctc_max: z.coerce.number().int().min(0),
    deadline: z.string().optional(),
  })
  .refine((d) => d.exp_max >= d.exp_min, {
    message: "Max exp must be ≥ min exp",
    path: ["exp_max"],
  })
  .refine((d) => d.ctc_max >= d.ctc_min, {
    message: "Max CTC must be ≥ min CTC",
    path: ["ctc_max"],
  });

type FormValues = z.infer<typeof schema>;

export function HrJobFormPage() {
  const { id } = useParams<{ id?: string }>();
  const editingId = id ? Number(id) : null;
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  // Skills live outside react-hook-form because they're a pill-list, not a
  // single input. Sync on load (edit) and read on submit.
  const [skills, setSkills] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      description: "",
      department: "",
      location_type: "remote",
      employment_type: "full_time",
      exp_min: 0,
      exp_max: 0,
      ctc_min: 0,
      ctc_max: 0,
      deadline: "",
    },
  });

  useEffect(() => {
    if (editingId === null) return;
    jobsApi
      .get(editingId)
      .then((j) => {
        reset({
          title: j.title,
          description: j.description,
          department: j.department,
          location_type: j.location_type,
          employment_type: j.employment_type,
          exp_min: j.exp_min,
          exp_max: j.exp_max,
          ctc_min: j.ctc_min,
          ctc_max: j.ctc_max,
          deadline: j.deadline ?? "",
        });
        setSkills(j.skills);
      })
      .catch((err) => setError(err instanceof ApiError ? err.detail : "Failed to load"));
  }, [editingId, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const payload = {
      title: values.title.trim(),
      description: values.description,
      department: values.department.trim(),
      location_type: values.location_type,
      employment_type: values.employment_type,
      exp_min: values.exp_min,
      exp_max: values.exp_max,
      ctc_min: values.ctc_min,
      ctc_max: values.ctc_max,
      skills,
      deadline: values.deadline ? values.deadline : null,
    };
    try {
      if (editingId === null) {
        await jobsApi.create(payload);
      } else {
        await jobsApi.update(editingId, payload);
      }
      navigate("/hr/jobs");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Failed to save");
    }
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">{editingId ? "Edit job" : "Post a new job"}</h1>
      <p className="text-xs text-slate-500">
        Fields marked <span className="text-rose-600">*</span> are required.
      </p>

      <form onSubmit={onSubmit} className="card space-y-4" noValidate>
        <ErrorBanner message={error} />

        <div>
          <label className="label" htmlFor="job-title">
            Title <span aria-hidden="true" className="text-rose-600">*</span>
            <span className="sr-only"> (required)</span>
          </label>
          <input
            id="job-title"
            className="input"
            aria-required="true"
            aria-invalid={errors.title ? "true" : undefined}
            aria-describedby={errors.title ? "job-title-error" : undefined}
            {...register("title")}
          />
          {errors.title && (
            <p id="job-title-error" role="alert" className="mt-1 text-xs text-rose-600">
              {errors.title.message}
            </p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="job-description">
            Description <span aria-hidden="true" className="text-rose-600">*</span>
            <span className="sr-only"> (required)</span>
          </label>
          <textarea
            id="job-description"
            className="input min-h-[150px]"
            aria-required="true"
            aria-invalid={errors.description ? "true" : undefined}
            aria-describedby={errors.description ? "job-description-error" : undefined}
            {...register("description")}
          />
          {errors.description && (
            <p id="job-description-error" role="alert" className="mt-1 text-xs text-rose-600">
              {errors.description.message}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="job-department">
              Department <span aria-hidden="true" className="text-rose-600">*</span>
              <span className="sr-only"> (required)</span>
            </label>
            <input
              id="job-department"
              className="input"
              aria-required="true"
              aria-invalid={errors.department ? "true" : undefined}
              aria-describedby={errors.department ? "job-department-error" : undefined}
              {...register("department")}
            />
            {errors.department && (
              <p id="job-department-error" role="alert" className="mt-1 text-xs text-rose-600">
                {errors.department.message}
              </p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="job-deadline">Application deadline</label>
            <input id="job-deadline" className="input" type="date" {...register("deadline")} />
          </div>
          <div>
            <label className="label" htmlFor="job-location">
              Location <span aria-hidden="true" className="text-rose-600">*</span>
              <span className="sr-only"> (required)</span>
            </label>
            <select id="job-location" className="input" aria-required="true" {...register("location_type")}>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">On-site</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="job-employment">
              Employment type <span aria-hidden="true" className="text-rose-600">*</span>
              <span className="sr-only"> (required)</span>
            </label>
            <select id="job-employment" className="input" aria-required="true" {...register("employment_type")}>
              <option value="full_time">Full-time</option>
              <option value="part_time">Part-time</option>
              <option value="contract">Contract</option>
              <option value="internship">Internship</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="job-exp-min">
              Min exp (yrs) <span aria-hidden="true" className="text-rose-600">*</span>
              <span className="sr-only"> (required)</span>
            </label>
            <input id="job-exp-min" className="input" type="number" min={0} aria-required="true" {...register("exp_min")} />
          </div>
          <div>
            <label className="label" htmlFor="job-exp-max">
              Max exp <span aria-hidden="true" className="text-rose-600">*</span>
              <span className="sr-only"> (required)</span>
            </label>
            <input
              id="job-exp-max"
              className="input"
              type="number"
              min={0}
              aria-required="true"
              aria-invalid={errors.exp_max ? "true" : undefined}
              aria-describedby={errors.exp_max ? "job-exp-max-error" : undefined}
              {...register("exp_max")}
            />
            {errors.exp_max && (
              <p id="job-exp-max-error" role="alert" className="mt-1 text-xs text-rose-600">
                {errors.exp_max.message}
              </p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="job-ctc-min">
              Min CTC (₹) <span aria-hidden="true" className="text-rose-600">*</span>
              <span className="sr-only"> (required)</span>
            </label>
            <input id="job-ctc-min" className="input" type="number" min={0} aria-required="true" {...register("ctc_min")} />
          </div>
          <div>
            <label className="label" htmlFor="job-ctc-max">
              Max CTC (₹) <span aria-hidden="true" className="text-rose-600">*</span>
              <span className="sr-only"> (required)</span>
            </label>
            <input
              id="job-ctc-max"
              className="input"
              type="number"
              min={0}
              aria-required="true"
              aria-invalid={errors.ctc_max ? "true" : undefined}
              aria-describedby={errors.ctc_max ? "job-ctc-max-error" : undefined}
              {...register("ctc_max")}
            />
            {errors.ctc_max && (
              <p id="job-ctc-max-error" role="alert" className="mt-1 text-xs text-rose-600">
                {errors.ctc_max.message}
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="job-skills">Required skills</label>
          <TagInput
            id="job-skills"
            value={skills}
            onChange={setSkills}
            placeholder="Type a skill and press Enter (e.g. python, fastapi, postgres)"
            ariaLabel="Required skills"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => navigate("/hr/jobs")} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : editingId ? "Save changes" : "Publish job"}
          </button>
        </div>
      </form>
    </div>
  );
}
