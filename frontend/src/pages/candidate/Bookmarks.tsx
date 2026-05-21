import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { bookmarksApi } from "@/api/endpoints";
import { queryKeys } from "@/api/queryKeys";
import { ErrorBanner } from "@/components/ErrorBanner";
import { JobCard } from "@/components/JobCard";
import { notifyError } from "@/lib/toast";

export function BookmarksPage() {
  const queryClient = useQueryClient();

  const { data: bookmarks = [], error, isLoading } = useQuery({
    queryKey: queryKeys.bookmarks.all(),
    queryFn: () => bookmarksApi.list(),
  });

  const removeMutation = useMutation({
    mutationFn: (jobId: number) => bookmarksApi.remove(jobId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.bookmarks.all() }),
    onError: (err) => notifyError(err, "Could not remove bookmark"),
  });

  // The initial-load error gates the whole page (no list to render). All
  // other failures arrive via the mutation's toast.
  const queryError = error ? (error instanceof Error ? error.message : String(error)) : null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Saved jobs</h1>
      <ErrorBanner message={queryError} />
      {isLoading ? (
        <div className="card text-slate-500">Loading…</div>
      ) : bookmarks.length === 0 ? (
        <div className="card text-slate-500">You haven&apos;t saved any jobs yet.</div>
      ) : (
        bookmarks.map((b) =>
          b.job ? (
            <JobCard
              key={b.id}
              job={b.job}
              isBookmarked
              onBookmarkToggle={() => removeMutation.mutate(b.job_id)}
            />
          ) : null,
        )
      )}
    </div>
  );
}
