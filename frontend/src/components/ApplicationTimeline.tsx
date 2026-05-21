import { useEffect, useState } from "react";

import { ApiError } from "@/api/client";
import { applicationsApi } from "@/api/endpoints";
import type { ApplicationEvent } from "@/api/types";
import { formatRelative, stageColor, stageLabel } from "@/lib/format";

export function ApplicationTimeline({ applicationId }: { applicationId: number }) {
  const [events, setEvents] = useState<ApplicationEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setEvents(null);
    applicationsApi
      .timeline(applicationId)
      .then((rows) => {
        if (!cancelled) setEvents(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.detail : "Could not load timeline");
      });
    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  if (error) {
    return <p className="text-sm text-rose-600">{error}</p>;
  }
  if (events === null) {
    return <p className="text-sm text-slate-500">Loading timeline…</p>;
  }
  if (events.length === 0) {
    return <p className="text-sm text-slate-500">No history yet.</p>;
  }

  return (
    <ol className="relative space-y-3 border-l border-slate-200 pl-5">
      {events.map((event, idx) => (
        <li key={event.id} className="relative">
          <span
            className={`absolute -left-[26px] top-1.5 inline-flex h-3 w-3 rounded-full ring-4 ring-white ${
              stageColor(event.to_stage).split(" ")[0]
            }`}
            aria-hidden="true"
          />
          <div className="flex items-center gap-2 text-sm">
            <span className={`badge ${stageColor(event.to_stage)}`}>
              {stageLabel(event.to_stage)}
            </span>
            {event.from_stage ? (
              <span className="text-xs text-slate-500">
                moved from {stageLabel(event.from_stage)}
              </span>
            ) : (
              <span className="text-xs text-slate-500">
                {idx === 0 ? "application submitted" : null}
              </span>
            )}
          </div>
          <time className="text-xs text-slate-500" dateTime={event.created_at}>
            {formatRelative(event.created_at)}
          </time>
        </li>
      ))}
    </ol>
  );
}
