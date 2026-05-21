import { Link } from "react-router-dom";

import type {
  Application,
  ApplicationStage,
  ScoreBreakdown,
} from "@/api/types";
import { APPLICATION_STAGES } from "@/api/types";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StageBadge } from "@/components/StageBadge";
import { formatCtc, formatRelative, stageLabel } from "@/lib/format";

/**
 * Anonymized applicants table used by both `/hr/jobs/:id/applicants` and
 * `/hr/applicants`. Identity (name / email / resume) stays in the
 * Profile drawer — this table only ever shows the bias-free fields.
 *
 * Two optional behaviours:
 *  - `scoreByAppId` populates a per-row ScoreBadge and turns matched
 *    skills emerald. Pass it when the parent is in ranked mode.
 *  - `showJobColumn` adds an "Applied to" cell with a link back to the
 *    per-job applicants page — true on the cross-job feed only.
 */
export function ApplicantsTable({
  applicants,
  scoreByAppId,
  showJobColumn = false,
  onStageChange,
  onProfileOpen,
}: {
  applicants: Application[];
  scoreByAppId?: Map<number, ScoreBreakdown>;
  showJobColumn?: boolean;
  onStageChange: (id: number, stage: ApplicationStage) => void;
  onProfileOpen: (application: Application) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 rounded-lg bg-white text-sm ring-1 ring-slate-200">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th scope="col" className="px-3 py-2">Applicant</th>
            {showJobColumn ? (
              <th scope="col" className="px-3 py-2">Applied to</th>
            ) : null}
            <th scope="col" className="px-3 py-2">Exp</th>
            <th scope="col" className="px-3 py-2">Current</th>
            <th scope="col" className="px-3 py-2">Expected</th>
            <th scope="col" className="px-3 py-2">Notice</th>
            <th scope="col" className="px-3 py-2">Skills</th>
            <th scope="col" className="px-3 py-2">Applied</th>
            <th scope="col" className="px-3 py-2">Stage</th>
            <th scope="col" className="px-3 py-2">
              <span className="sr-only">Profile</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {applicants.map((a) => {
            const score = scoreByAppId?.get(a.id);
            const matched = new Set(
              (score?.matched_skills ?? []).map((s) => s.toLowerCase()),
            );
            return (
              <tr key={a.id}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-700">#{a.id}</span>
                    {score ? <ScoreBadge score={score} /> : null}
                  </div>
                  <div className="text-xs text-slate-500">
                    {a.years_experience}y · {a.notice_period_days}d notice
                  </div>
                </td>
                {showJobColumn ? (
                  <td className="px-3 py-2">
                    {a.job ? (
                      <Link
                        to={`/hr/jobs/${a.job.id}/applicants`}
                        className="text-slate-900 hover:text-brand-700"
                      >
                        {a.job.title}
                      </Link>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                    {a.job ? (
                      <div className="text-xs text-slate-500">{a.job.department}</div>
                    ) : null}
                  </td>
                ) : null}
                <td className="px-3 py-2 text-slate-700">{a.years_experience}y</td>
                <td className="px-3 py-2 text-slate-700">{formatCtc(a.current_ctc)}</td>
                <td className="px-3 py-2 text-slate-700">{formatCtc(a.expected_ctc)}</td>
                <td className="px-3 py-2 text-slate-700">{a.notice_period_days}d</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {a.skills.slice(0, 4).map((s) => (
                      <span
                        key={s}
                        className={`badge ${
                          matched.has(s.toLowerCase())
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-brand-50 text-brand-700"
                        }`}
                      >
                        {s}
                      </span>
                    ))}
                    {a.skills.length > 4 ? (
                      <span className="text-xs text-slate-500">+{a.skills.length - 4}</span>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2 text-slate-500">{formatRelative(a.created_at)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-col gap-1">
                    <StageBadge stage={a.stage} />
                    <select
                      className="input py-0.5 text-xs"
                      value={a.stage}
                      onChange={(e) =>
                        onStageChange(a.id, e.target.value as ApplicationStage)
                      }
                      aria-label={`Change stage for applicant ${a.id}`}
                    >
                      {APPLICATION_STAGES.map((s) => (
                        <option key={s} value={s}>{stageLabel(s)}</option>
                      ))}
                    </select>
                  </div>
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => onProfileOpen(a)}
                    className="text-xs text-brand-600 hover:underline"
                    aria-label={`View profile for applicant ${a.id}`}
                  >
                    View profile
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
