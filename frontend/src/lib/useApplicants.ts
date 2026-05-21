import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/api/client";
import { applicationsApi } from "@/api/endpoints";
import type {
  Application,
  ApplicationStage,
  RankedApplication,
  ScoreBreakdown,
} from "@/api/types";

interface UseApplicantsOpts {
  /** Function that fetches the current page of applicants. Pass `null` to
   *  pause fetching (e.g. while a parent param is still loading). */
  fetcher: (() => Promise<Application[]>) | null;
  /** Deps that, when changed, retrigger the fetch. Same semantics as the
   *  dependency array passed to `useEffect`. */
  deps: ReadonlyArray<unknown>;
}

interface UseApplicantsResult {
  applicants: Application[];
  /** Maps application id → score breakdown when the fetcher returns the
   *  ranked endpoint shape; otherwise empty. */
  scoreByAppId: Map<number, ScoreBreakdown>;
  error: string | null;
  loading: boolean;
  /** PATCH /stage + optimistic-merge the response into local state. */
  setStage: (id: number, stage: ApplicationStage) => Promise<void>;
  setError: (msg: string | null) => void;
}

/**
 * Shared state + behaviour for the two HR applicants pages.
 *
 * Both `/hr/jobs/:id/applicants` and `/hr/applicants` used to inline the
 * same fetch/state/setStage block. Container/Presenter split: this hook
 * owns the state machine, the pages render the UI.
 *
 * The `fetcher` is the page's call into `applicationsApi.byJob/ranked/all`
 * — passing it as a function lets each page assemble the request it
 * needs (filters, job id, ranked mode) without leaking those concerns
 * into the hook.
 */
export function useApplicants({ fetcher, deps }: UseApplicantsOpts): UseApplicantsResult {
  const [applicants, setApplicants] = useState<Application[]>([]);
  const [scoreByAppId, setScoreByAppId] = useState<Map<number, ScoreBreakdown>>(
    () => new Map(),
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!fetcher) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcher()
      .then((rows) => {
        if (cancelled) return;
        setApplicants(rows);
        const scoreMap = new Map<number, ScoreBreakdown>();
        for (const row of rows) {
          // RankedApplication rows include a `score` field; plain
          // Application rows don't. Index whichever we get.
          if ("score" in row) {
            scoreMap.set(row.id, (row as RankedApplication).score);
          }
        }
        setScoreByAppId(scoreMap);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError) setError(err.detail);
        else setError("Failed to load applicants");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // The deps array is opaque to the hook; the caller knows when to refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const setStage = useCallback(
    async (id: number, stage: ApplicationStage) => {
      try {
        const updated = await applicationsApi.setStage(id, stage);
        // Merge the server response so allowed_next_stages stays in sync
        // — a transition can reshape which stages are next legal.
        setApplicants((prev) =>
          prev.map((a) => (a.id === id ? { ...a, ...updated } : a)),
        );
      } catch (err) {
        if (err instanceof ApiError) setError(err.detail);
        else setError("Could not update stage");
      }
    },
    [],
  );

  return { applicants, scoreByAppId, error, loading, setStage, setError };
}
