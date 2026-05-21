import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { ErrorBanner } from "@/components/ErrorBanner";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const user = await login(values.email, values.password);
      navigate(user.role === "hr" ? "/hr" : "/jobs", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Login failed");
    }
  });

  return (
    <div className="mx-auto mt-12 max-w-md">
      <div className="card">
        <h1 className="mb-1 text-xl font-semibold">Welcome back</h1>
        <p className="mb-4 text-sm text-slate-500">Log in to manage jobs or applications.</p>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <ErrorBanner message={error} />
          <div>
            <label className="label" htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              className="input"
              aria-invalid={errors.email ? "true" : undefined}
              aria-describedby={errors.email ? "login-email-error" : undefined}
              {...register("email")}
            />
            {errors.email && (
              <p id="login-email-error" role="alert" className="mt-1 text-xs text-rose-600">
                {errors.email.message}
              </p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              className="input"
              aria-invalid={errors.password ? "true" : undefined}
              aria-describedby={errors.password ? "login-password-error" : undefined}
              {...register("password")}
            />
            {errors.password && (
              <p id="login-password-error" role="alert" className="mt-1 text-xs text-rose-600">
                {errors.password.message}
              </p>
            )}
          </div>
          <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500">
          No account?{" "}
          <Link to="/register" className="text-brand-600 hover:underline">
            Create one
          </Link>
        </p>
      </div>
      <div className="card mt-4 text-xs text-slate-500">
        <p className="mb-2 font-semibold text-slate-700">Demo credentials</p>
        <p>HR — <code className="rounded bg-slate-100 px-1">hr@test.com</code> / <code className="rounded bg-slate-100 px-1">Hr@1234</code></p>
        <p>Candidate — <code className="rounded bg-slate-100 px-1">candidate@test.com</code> / <code className="rounded bg-slate-100 px-1">Candidate@1234</code></p>
      </div>
    </div>
  );
}
