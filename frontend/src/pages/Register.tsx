import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { ErrorBanner } from "@/components/ErrorBanner";

// HR accounts are seeded (and would be provisioned via an admin/invite flow
// in production). The public form only registers candidates; the backend
// enforces the same restriction even if someone bypasses the UI.
const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z
    .string()
    .min(8, "At least 8 characters")
    .max(128, "Password too long"),
  full_name: z.string().min(1, "Name is required"),
  role: z.literal("candidate"),
});

type FormValues = z.infer<typeof schema>;

export function RegisterPage() {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "", full_name: "", role: "candidate" },
  });


  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const user = await registerUser(values);
      navigate(user.role === "hr" ? "/hr" : "/jobs", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Registration failed");
    }
  });

  return (
    <div className="mx-auto mt-12 max-w-md">
      <div className="card">
        <h1 className="mb-1 text-xl font-semibold">Create your account</h1>
        <p className="mb-1 text-sm text-slate-500">
          Self-signup creates a <strong>Candidate</strong> account. HR accounts
          are provisioned by administrators &mdash; use the seeded HR
          credentials in the README to evaluate the recruiter view.
        </p>
        <p className="mb-4 text-xs text-slate-500">
          Fields marked <span className="text-rose-600">*</span> are required.
        </p>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <ErrorBanner message={error} />
          <div>
            <label className="label" htmlFor="reg-full-name">
              Full name <span aria-hidden="true" className="text-rose-600">*</span>
              <span className="sr-only"> (required)</span>
            </label>
            <input
              id="reg-full-name"
              className="input"
              aria-required="true"
              aria-invalid={errors.full_name ? "true" : undefined}
              aria-describedby={errors.full_name ? "reg-full-name-error" : undefined}
              {...register("full_name")}
            />
            {errors.full_name && (
              <p id="reg-full-name-error" role="alert" className="mt-1 text-xs text-rose-600">
                {errors.full_name.message}
              </p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="reg-email">
              Email <span aria-hidden="true" className="text-rose-600">*</span>
              <span className="sr-only"> (required)</span>
            </label>
            <input
              id="reg-email"
              type="email"
              autoComplete="email"
              className="input"
              aria-required="true"
              aria-invalid={errors.email ? "true" : undefined}
              aria-describedby={errors.email ? "reg-email-error" : undefined}
              {...register("email")}
            />
            {errors.email && (
              <p id="reg-email-error" role="alert" className="mt-1 text-xs text-rose-600">
                {errors.email.message}
              </p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="reg-password">
              Password <span aria-hidden="true" className="text-rose-600">*</span>
              <span className="sr-only"> (required)</span>
            </label>
            <input
              id="reg-password"
              type="password"
              autoComplete="new-password"
              className="input"
              aria-required="true"
              aria-invalid={errors.password ? "true" : undefined}
              aria-describedby={errors.password ? "reg-password-error" : undefined}
              {...register("password")}
            />
            {errors.password && (
              <p id="reg-password-error" role="alert" className="mt-1 text-xs text-rose-600">
                {errors.password.message}
              </p>
            )}
          </div>
          <input type="hidden" value="candidate" {...register("role")} />
          <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
            {isSubmitting ? "Creating…" : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link to="/login" className="text-brand-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
