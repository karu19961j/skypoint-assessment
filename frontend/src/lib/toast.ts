/**
 * Thin wrapper around sonner so the rest of the app talks to a stable
 * shape — and we don't sprinkle `import { toast } from "sonner"` in
 * every mutation handler.
 *
 * Why route through here:
 *   - One place to map an `ApiError` to a sensible toast (status-aware
 *     copy: 401 → "Session expired", 403 → "Not allowed", …).
 *   - The React Query `onError` callbacks call `notifyError(err)` and
 *     get consistent UX without recreating the same instanceof-ApiError
 *     branching in every mutation.
 */

import { toast } from "sonner";

import { ApiError } from "@/api/client";

export const notify = {
  success: (message: string) => toast.success(message),
  error: (message: string) => toast.error(message),
  info: (message: string) => toast.info(message),
};

/** Map any thrown error to a friendly toast. */
export function notifyError(err: unknown, fallback = "Something went wrong"): void {
  if (err instanceof ApiError) {
    // Status-aware copy: surfacing the raw backend detail is fine for
    // 400/409/422 (validation, duplicate, deadline), but generic for 5xx
    // so we never leak a stack trace to a user.
    if (err.status >= 500) {
      toast.error("Server error. Please try again in a moment.");
      return;
    }
    if (err.status === 401) {
      toast.error("Your session expired. Please sign in again.");
      return;
    }
    if (err.status === 403) {
      toast.error(err.detail || "You don't have permission to do that.");
      return;
    }
    toast.error(err.detail || fallback);
    return;
  }
  toast.error(fallback);
}
