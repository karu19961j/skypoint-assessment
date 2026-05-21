import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/useAuth";
import { AuthCard } from "@/components/AuthCard";
import { ErrorBanner } from "@/components/ErrorBanner";
import { TextField } from "@/components/TextField";

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
    <>
      <AuthCard
        title="Welcome back"
        intro="Log in to manage jobs or applications."
        altText="No account?"
        altLinkLabel="Create one"
        altLinkTo="/register"
      >
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <ErrorBanner message={error} />
          <TextField
            id="login-email"
            label="Email"
            type="email"
            autoComplete="email"
            required
            error={errors.email?.message}
            {...register("email")}
          />
          <TextField
            id="login-password"
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            error={errors.password?.message}
            {...register("password")}
          />
          <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </AuthCard>
      <div className="mx-auto mt-4 max-w-md">
        <div className="card text-xs text-slate-500">
          <p className="mb-2 font-semibold text-slate-700">Demo credentials</p>
          <p>
            HR — <code className="rounded bg-slate-100 px-1">hr@test.com</code> /{" "}
            <code className="rounded bg-slate-100 px-1">Hr@1234</code>
          </p>
          <p>
            Candidate —{" "}
            <code className="rounded bg-slate-100 px-1">candidate@test.com</code> /{" "}
            <code className="rounded bg-slate-100 px-1">Candidate@1234</code>
          </p>
        </div>
      </div>
    </>
  );
}
