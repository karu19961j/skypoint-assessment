import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "@/api/client";

/**
 * Single QueryClient for the app.
 *
 * Defaults chosen for this product:
 *   - `staleTime: 30s` — list views (jobs, applications) feel snappy on
 *     back-nav; explicit `invalidateQueries` after mutations keeps things
 *     fresh. Without a staleTime, every focus would refetch.
 *   - `retry: false` on 4xx errors. Authentication / permission errors
 *     should not be silently retried 3 times; only network / 5xx merit a
 *     retry, and React Query's default already covers that case.
 *   - `refetchOnWindowFocus: false` — sane for a tool used in a tab the
 *     user has open all day. Without it, hovering back to the tab would
 *     refetch every list, surprising the user with movement.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      // Per-mutation onError supplies the toast; this is the safety net.
      retry: false,
    },
  },
});
