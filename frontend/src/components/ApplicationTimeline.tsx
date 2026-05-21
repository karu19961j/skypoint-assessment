import { useEffect, useState } from "react";

import { ApiError } from "@/api/client";
import { applicationsApi } from "@/api/endpoints";
import type { ApplicationEvent, ApplicationStage } from "@/api/types";
import { formatRelative, stageColor, stageLabel } from "@/lib/format";

const HAPPY_PATH: ApplicationStage[] = [
  "applied",
  "screening",
  "interview",
  "offer",
  "hired",
];

function pendingStages(events: ApplicationEvent[]): ApplicationStage[] {
  if (events.length === 0) return HAPPY_PATH;
  const current = events[events.length - 1].to_stage;
  if (current === "rejected" || current === "hired") return [];
  const idx = HAPPY_PATH.indexOf(current);
  return idx >= 0 ? HAPPY_PATH.slice(idx + 1) : [];
}

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

  const pending = pendingStages(events);

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
      {pending.map((stage) => (
        <li key={`pending-${stage}`} className="relative opacity-60">
          <span
            className="absolute -left-[26px] top-1.5 inline-flex h-3 w-3 rounded-full bg-white ring-2 ring-slate-300"
            aria-hidden="true"
          />
          <div className="flex items-center gap-2 text-sm">
            <span className="badge bg-slate-100 text-slate-500">
              {stageLabel(stage)}
            </span>
            <span className="text-xs text-slate-400">Pending</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
