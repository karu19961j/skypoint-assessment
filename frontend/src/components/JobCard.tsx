import { Link } from "react-router-dom";

import {
  employmentLabel,
  formatCtcRange,
  formatExp,
  locationLabel,
} from "@/lib/format";
import type { Job } from "@/api/types";

export function JobCard({ job, onBookmarkToggle, isBookmarked }: {
  job: Job;
  onBookmarkToggle?: () => void;
  isBookmarked?: boolean;
}) {
  return (
    <div className="card hover:shadow">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to={`/jobs/${job.id}`} className="text-lg font-semibold text-slate-900 hover:text-brand-700">
            {job.title}
          </Link>
          <div className="mt-1 text-sm text-slate-500">
            {job.department} · {locationLabel(job.location_type)} · {employmentLabel(job.employment_type)}
          </div>
        </div>
        {onBookmarkToggle ? (
          <button
            onClick={onBookmarkToggle}
            className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            aria-label={isBookmarked ? "Remove bookmark" : "Save job"}
          >
            {isBookmarked ? "★ Saved" : "☆ Save"}
          </button>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
        <span className="badge bg-slate-100 text-slate-700">{formatExp(job.exp_min, job.exp_max)}</span>
        <span className="badge bg-emerald-100 text-emerald-800">{formatCtcRange(job.ctc_min, job.ctc_max)}</span>
        {job.skills.map((s) => (
          <span key={s} className="badge bg-brand-50 text-brand-700">
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}
