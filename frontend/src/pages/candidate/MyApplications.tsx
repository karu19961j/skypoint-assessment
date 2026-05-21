import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { Link } from "react-router-dom";

import { applicationsApi } from "@/api/endpoints";
import { queryKeys } from "@/api/queryKeys";
import type { ApplicationStage } from "@/api/types";
import { APPLICATION_STAGES } from "@/api/types";
import { ApplicationTimeline } from "@/components/ApplicationTimeline";
import { ErrorBanner } from "@/components/ErrorBanner";
import { StageBadge } from "@/components/StageBadge";
import { formatRelative, stageLabel } from "@/lib/format";
import { notify, notifyError } from "@/lib/toast";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

export function MyApplicationsPage() {
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<ApplicationStage | "">("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"recent" | "updated">("recent");
  const [expanded, setExpanded] = useState<number | null>(null);

  // Debounce the keyword input so typing 'data analyst' doesn't issue
  // 11 fetches. Stage + sort are dropdown clicks — left undebounced.
  const debouncedQ = useDebouncedValue(q.trim(), 400);
  const filters = { stage: stage || undefined, q: debouncedQ || undefined, sort };

  const { data: apps = [], error, isLoading } = useQuery({
    queryKey: queryKeys.applications.mine(filters),
    queryFn: () => applicationsApi.mine(filters),
  });

  const withdrawMutation = useMutation({
    mutationFn: (id: number) => applicationsApi.withdraw(id),
    onSuccess: () => {
      // Invalidate ALL nested `applications` keys so timeline + detail
      // for the withdrawn row are evicted alongside the list.
      queryClient.invalidateQueries({ queryKey: queryKeys.applications.all() });
      notify.success("Application withdrawn.");
    },
    onError: (err) => notifyError(err, "Could not withdraw application"),
  });

  const queryError = error instanceof Error ? error.message : null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">My applications</h1>

      <div className="flex flex-wrap gap-3">
        <input
          className="input max-w-xs"
          placeholder="Search by job title"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search by job title"
        />
        <select
          className="input max-w-xs"
          value={stage}
          onChange={(e) => setStage(e.target.value as ApplicationStage | "")}
          aria-label="Filter by stage"
        >
          <option value="">All stages</option>
          {APPLICATION_STAGES.map((s) => (
            <option key={s} value={s}>
              {stageLabel(s)}
            </option>
          ))}
        </select>
        <select
          className="input max-w-xs"
          value={sort}
          onChange={(e) => setSort(e.target.value as "recent" | "updated")}
          aria-label="Sort applications"
        >
          <option value="recent">Recently applied</option>
          <option value="updated">Recently updated</option>
        </select>
      </div>

      <ErrorBanner message={queryError} />
      <div className="sr-only" role="status" aria-live="polite">
        {`Showing ${apps.length} ${apps.length === 1 ? "application" : "applications"}`}
      </div>

      {isLoading ? (
        <div className="card text-slate-500">Loading…</div>
      ) : apps.length === 0 ? (
        !stage && !q ? (
          <div className="card flex flex-col items-start gap-3 text-slate-600">
            <p className="text-sm">
              You haven&apos;t applied to anything yet. Pick a role that fits and
              your applications will show up here with live stage updates.
            </p>
            <Link to="/jobs" className="btn-primary text-sm">
              Browse jobs
            </Link>
          </div>
        ) : (
          <div className="card text-slate-500">
            No applications match the current filters.
          </div>
        )
      ) : (
        <div className="overflow-hidden rounded-lg ring-1 ring-slate-200">
          <table className="min-w-full divide-y divide-slate-200 bg-white text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Applied</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {apps.map((a) => {
                const isOpen = expanded === a.id;
                return (
                  <Fragment key={a.id}>
                    <tr>
                      <td className="px-4 py-3">
                        {a.job ? (
                          <Link
                            to={`/jobs/${a.job.id}`}
                            className="font-medium text-slate-900 hover:text-brand-700"
                          >
                            {a.job.title}
                          </Link>
                        ) : (
                          <span className="text-slate-400">Job removed</span>
                        )}
                        {a.job ? (
                          <div className="text-xs text-slate-500">{a.job.department}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3"><StageBadge stage={a.stage} /></td>
                      <td className="px-4 py-3 text-slate-500">{formatRelative(a.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-3">
                          <button
                            onClick={() => setExpanded(isOpen ? null : a.id)}
                            aria-expanded={isOpen}
                            aria-controls={`timeline-${a.id}`}
                            className="text-xs text-brand-600 hover:underline"
                          >
                            {isOpen ? "Hide timeline" : "Timeline"}
                          </button>
                          {a.stage === "applied" ? (
                            <button
                              onClick={() => {
                                if (!confirm("Withdraw this application?")) return;
                                withdrawMutation.mutate(a.id);
                              }}
                              className="text-xs text-rose-600 hover:underline"
                              disabled={withdrawMutation.isPending}
                            >
                              Withdraw
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr id={`timeline-${a.id}`}>
                        <td colSpan={4} className="bg-slate-50 px-4 py-4">
                          <ApplicationTimeline applicationId={a.id} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
