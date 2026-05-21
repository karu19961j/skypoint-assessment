import { Link } from "react-router-dom";
import type { ReactNode } from "react";

interface AuthCardProps {
  title: string;
  /** One-or-two-line intro paragraph shown under the title. */
  intro: ReactNode;
  /** Footer "alt" prompt — "Already have an account?" / "No account?". */
  altText: string;
  altLinkLabel: string;
  altLinkTo: string;
  children: ReactNode;
}

/**
 * Shared scaffolding for the auth pages — Login and Register both render
 * a centred card with title, intro, "fields marked * are required" note,
 * the form (provided as children), and an alt-link footer.
 *
 * Extracting the wrapper here keeps the page bodies focused on the
 * form fields themselves and means a visual tweak to the auth surface
 * happens in one place.
 */
export function AuthCard({
  title,
  intro,
  altText,
  altLinkLabel,
  altLinkTo,
  children,
}: AuthCardProps) {
  return (
    <div className="mx-auto mt-12 max-w-md">
      <div className="card">
        <h1 className="mb-1 text-xl font-semibold">{title}</h1>
        <p className="mb-1 text-sm text-slate-500">{intro}</p>
        <p className="mb-4 text-xs text-slate-500">
          Fields marked <span className="text-rose-600">*</span> are required.
        </p>
        {children}

        <p className="mt-4 text-center text-sm text-slate-500">
          {altText}{" "}
          <Link to={altLinkTo} className="text-brand-600 hover:underline">
            {altLinkLabel}
          </Link>
        </p>
      </div>
    </div>
  );
}
