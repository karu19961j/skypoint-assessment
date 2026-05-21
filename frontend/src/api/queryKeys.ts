/**
 * Centralized React Query keys.
 *
 * Why a single module: query keys are coupled to invalidations on the
 * other side of the app. When a job is updated, we need to invalidate
 * the jobs list, the job detail, and the recommended-jobs feed. If keys
 * are scattered as inline arrays at the call site, that coupling lives
 * in mutation handlers as magic strings and drifts the moment anyone
 * renames anything.
 *
 * Convention:
 *   - Top-level entries are stable identifiers per resource ("jobs",
 *     "applications", …). They're the broadest invalidation handle.
 *   - Nested factories return arrays so React Query's prefix-matching
 *     does the right thing: invalidating `["applications"]` invalidates
 *     every nested ["applications", "mine", ...], ["applications", id], etc.
 *   - Filter objects always go LAST so two calls with different filters
 *     get distinct cache entries.
 */

import type { ApplicantFilters, CrossJobApplicantFilters, JobListFilters } from "./endpoints";
import type { ApplicationStage } from "./types";

export const queryKeys = {
  auth: {
    me: () => ["auth", "me"] as const,
  },
  jobs: {
    all: () => ["jobs"] as const,
    list: (filters: JobListFilters) => ["jobs", "list", filters] as const,
    detail: (id: number) => ["jobs", "detail", id] as const,
    recommended: () => ["jobs", "recommended"] as const,
  },
  applications: {
    all: () => ["applications"] as const,
    mine: (filters: { stage?: ApplicationStage; q?: string; sort?: "recent" | "updated" }) =>
      ["applications", "mine", filters] as const,
    byJob: (jobId: number, filters: ApplicantFilters) =>
      ["applications", "byJob", jobId, filters] as const,
    crossJob: (filters: CrossJobApplicantFilters) =>
      ["applications", "crossJob", filters] as const,
    detail: (id: number) => ["applications", "detail", id] as const,
    notes: (id: number) => ["applications", id, "notes"] as const,
    timeline: (id: number) => ["applications", id, "timeline"] as const,
    ranked: (jobId: number) => ["applications", "byJob", jobId, "ranked"] as const,
  },
  bookmarks: {
    all: () => ["bookmarks"] as const,
  },
  profile: {
    me: () => ["profile"] as const,
  },
  dashboard: {
    hr: () => ["dashboard", "hr"] as const,
  },
} as const;
