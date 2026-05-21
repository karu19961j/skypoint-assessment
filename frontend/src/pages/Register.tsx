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
    <AuthCard
      title="Create your account"
      intro={
        <>
          Self-signup creates a <strong>Candidate</strong> account. HR accounts
          are provisioned by administrators &mdash; use the seeded HR
          credentials in the README to evaluate the recruiter view.
        </>
      }
      altText="Already have an account?"
      altLinkLabel="Sign in"
      altLinkTo="/login"
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <ErrorBanner message={error} />
        <TextField
          id="reg-full-name"
          label="Full name"
          required
          error={errors.full_name?.message}
          {...register("full_name")}
        />
        <TextField
          id="reg-email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          error={errors.email?.message}
          {...register("email")}
        />
        <TextField
          id="reg-password"
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          error={errors.password?.message}
          {...register("password")}
        />
        <input type="hidden" value="candidate" {...register("role")} />
        <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
          {isSubmitting ? "Creating…" : "Create account"}
        </button>
      </form>
    </AuthCard>
  );
}
