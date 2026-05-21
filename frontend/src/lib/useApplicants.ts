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
  /** Query key for cache + invalidation. */
  queryKey: readonly unknown[];
  /** Fetches one page of applicants. Returns `{ items, total }` so the
   *  pagination footer can render "Showing X–Y of Z". Endpoints that
   *  don't paginate (e.g. ranked mode) pass `items.length` as `total`. */
  fetcher: (() => Promise<{ items: Application[]; total: number }>) | null;
}

interface UseApplicantsResult {
  applicants: Application[];
  total: number;
  scoreByAppId: Map<number, ScoreBreakdown>;
  error: string | null;
  loading: boolean;
  setStage: (id: number, stage: ApplicationStage) => void;
  setError: (msg: string | null) => void;
}

/**
 * Shared state for the two HR applicants pages.
 *
 * Container/Presenter split: the hook owns React Query for fetch +
 * stage mutation; the pages render the UI.
 *
 * Pagination model: the fetcher returns the page's items plus the total
 * count, so the parent can render a `<Pagination>` footer + reset to
 * page 1 when filters change.
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

  const applicants = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
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
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: queryKeys.applications.all() });
    },
    onError: (err) => notifyError(err, "Could not update stage"),
  });

  const queryError = query.error instanceof Error ? query.error.message : null;

  return {
    applicants,
    total,
    scoreByAppId,
    error: error ?? queryError,
    loading: query.isLoading,
    setStage: (id, stage) => stageMutation.mutate({ id, stage }),
    setError,
  };
}
