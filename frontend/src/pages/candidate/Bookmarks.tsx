import { useEffect, useState } from "react";

import { ApiError } from "@/api/client";
import { bookmarksApi } from "@/api/endpoints";
import type { Bookmark } from "@/api/types";
import { ErrorBanner } from "@/components/ErrorBanner";
import { JobCard } from "@/components/JobCard";

export function BookmarksPage() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    bookmarksApi
      .list()
      .then(setBookmarks)
      .catch((err) => {
        if (err instanceof ApiError) setError(err.detail);
      });
  };

  useEffect(() => {
    refresh();
  }, []);

  const remove = async (jobId: number) => {
    try {
      await bookmarksApi.remove(jobId);
      refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(err.detail);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Saved jobs</h1>
      <ErrorBanner message={error} />
      {bookmarks.length === 0 ? (
        <div className="card text-slate-500">You haven't saved any jobs yet.</div>
      ) : (
        bookmarks.map((b) =>
          b.job ? (
            <JobCard
              key={b.id}
              job={b.job}
              isBookmarked
              onBookmarkToggle={() => remove(b.job_id)}
            />
          ) : null,
        )
      )}
    </div>
  );
}
