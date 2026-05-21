import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { ErrorBanner } from "@/components/ErrorBanner";

// HR self-signup is intentionally disabled: HR accounts ship via the seed and
// would be provisioned via an admin/invite flow in production. The public
// form only registers candidates; the backend enforces the same restriction.
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

  // Defensive: nothing in the form lets users pick another role, but we still
  // declare the field so react-hook-form has a value for it on submit.

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
        <p className="mb-4 text-sm text-slate-500">
          Sign up as a candidate to apply, or as HR to post jobs.
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <ErrorBanner message={error} />
          <div>
            <label className="label" htmlFor="full_name">Full name</label>
            <input id="full_name" className="input" {...register("full_name")} />
            {errors.full_name && <p className="mt-1 text-xs text-rose-600">{errors.full_name.message}</p>}
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" className="input" {...register("email")} />
            {errors.email && <p className="mt-1 text-xs text-rose-600">{errors.email.message}</p>}
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="new-password" className="input" {...register("password")} />
            {errors.password && <p className="mt-1 text-xs text-rose-600">{errors.password.message}</p>}
          </div>
          <input type="hidden" value="candidate" {...register("role")} />
          <p className="text-xs text-slate-500">
            Self-signup creates a <strong>Candidate</strong> account. HR accounts
            are provisioned by administrators &mdash; sign in with the seeded HR
            credentials in the README to evaluate the recruiter view.
          </p>
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
