import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { applicationsApi } from "@/api/endpoints";
import { queryKeys } from "@/api/queryKeys";
import type {
  Application,
  ApplicationStage,
  RankedApplication,
  ScoreBreakdown,
} from "@/api/types";
import { notifyError } from "@/lib/toast";

interface UseApplicantsOpts {
  /** Query key for cache + invalidation. Pass the same key the parent page
   *  uses with React Query's `queryKey` convention; on stage updates this
   *  hook calls `invalidateQueries` with this exact key. */
  queryKey: readonly unknown[];
  /** Fetches the current page of applicants. Set to null to pause. */
  fetcher: (() => Promise<Application[]>) | null;
}

interface UseApplicantsResult {
  applicants: Application[];
  scoreByAppId: Map<number, ScoreBreakdown>;
  error: string | null;
  loading: boolean;
  setStage: (id: number, stage: ApplicationStage) => void;
  setError: (msg: string | null) => void;
}

/**
 * Shared state + behaviour for the two HR applicants pages.
 *
 * Container/Presenter split: this hook owns React Query for fetch + stage
 * mutation; the pages render the UI.
 *
 * Under the hood:
 *   - useQuery with the caller's queryKey caches the response per filter
 *     set, so back-nav between jobs is instant.
 *   - setStage runs through useMutation with onError → toast and on success
 *     invalidates the SAME queryKey so the row reshapes to its new
 *     allowed_next_stages without a full reload.
 *   - The component still tracks its own ad-hoc `error` string for cases
 *     where the parent wants to surface a non-network failure (e.g. CSV
 *     export rejection). Mutation/network errors land in toasts.
 */
export function useApplicants({
  queryKey,
  fetcher,
}: UseApplicantsOpts): UseApplicantsResult {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey,
    queryFn: () => fetcher!(),
    enabled: fetcher !== null,
  });

  const applicants = query.data ?? [];
  const scoreByAppId = new Map<number, ScoreBreakdown>();
  for (const row of applicants) {
    if ("score" in row) {
      scoreByAppId.set(row.id, (row as RankedApplication).score);
    }
  }

  const stageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: number; stage: ApplicationStage }) =>
      applicationsApi.setStage(id, stage),
    onSuccess: () => {
      // Invalidate the parent's query + every nested applications cache
      // so timelines, drawers, and the cross-job feed pick up the change.
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: queryKeys.applications.all() });
    },
    onError: (err) => notifyError(err, "Could not update stage"),
  });

  const queryError = query.error instanceof Error ? query.error.message : null;

  return {
    applicants,
    scoreByAppId,
    error: error ?? queryError,
    loading: query.isLoading,
    setStage: (id, stage) => stageMutation.mutate({ id, stage }),
    setError,
  };
}
