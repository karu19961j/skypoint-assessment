import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "@/api/client";
import { applicationsApi } from "@/api/endpoints";
import type { Application, ApplicationStage } from "@/api/types";
import { APPLICATION_STAGES } from "@/api/types";
import { ApplicationTimeline } from "@/components/ApplicationTimeline";
import { ErrorBanner } from "@/components/ErrorBanner";
import { StageBadge } from "@/components/StageBadge";
import { formatRelative, stageLabel } from "@/lib/format";

export function MyApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [stage, setStage] = useState<ApplicationStage | "">("");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const refresh = () => {
    applicationsApi
      .mine({ stage: stage || undefined, q: q.trim() || undefined })
      .then(setApps)
      .catch((err) => {
        if (err instanceof ApiError) setError(err.detail);
      });
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, q]);

  const withdraw = async (id: number) => {
    if (!confirm("Withdraw this application?")) return;
    try {
      await applicationsApi.withdraw(id);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Could not withdraw");
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">My applications</h1>

      <div className="flex flex-wrap gap-3">
        <input
          className="input max-w-xs"
          placeholder="Search by job title"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="input max-w-xs"
          value={stage}
          onChange={(e) => setStage(e.target.value as ApplicationStage | "")}
        >
          <option value="">All stages</option>
          {APPLICATION_STAGES.map((s) => (
            <option key={s} value={s}>
              {stageLabel(s)}
            </option>
          ))}
        </select>
      </div>

      <ErrorBanner message={error} />

      {apps.length === 0 ? (
        <div className="card text-slate-500">No applications yet.</div>
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
                              onClick={() => withdraw(a.id)}
                              className="text-xs text-rose-600 hover:underline"
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
