import type { ScoreBreakdown } from "@/api/types";

// Visual thresholds for the colour-coded fit badge. Promoted out of the
// inline ternary so a future product/design change is a one-line edit.
const SCORE_THRESHOLDS = {
  good: 80,
  ok: 60,
} as const;

function tone(total: number): string {
  if (total >= SCORE_THRESHOLDS.good) return "bg-emerald-100 text-emerald-800 ring-emerald-200";
  if (total >= SCORE_THRESHOLDS.ok) return "bg-amber-100 text-amber-800 ring-amber-200";
  return "bg-rose-100 text-rose-800 ring-rose-200";
}

interface BreakdownRow {
  label: string;
  value: number;
  max: number;
}

function rows(score: ScoreBreakdown): BreakdownRow[] {
  const out: BreakdownRow[] = [
    { label: "Skills", value: score.skill, max: 50 },
    { label: "Experience", value: score.exp, max: 30 },
    { label: "CTC fit", value: score.ctc, max: 20 },
  ];
  if (score.notice > 0) out.push({ label: "Notice bonus", value: score.notice, max: 5 });
  if (score.location > 0) out.push({ label: "Location bonus", value: score.location, max: 10 });
  return out;
}

export function ScoreBadge({ score }: { score: ScoreBreakdown }) {
  const breakdown = rows(score);
  const ariaSummary =
    `Fit score ${score.total} out of 100. ` +
    breakdown.map((r) => `${r.label} ${r.value} of ${r.max}`).join(", ") +
    (score.matched_skills.length
      ? `. Matched skills: ${score.matched_skills.join(", ")}.`
      : ".");

  return (
    <span className="group relative inline-flex" tabIndex={0} aria-label={ariaSummary}>
      <span
        className={`inline-flex items-baseline gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${tone(score.total)}`}
      >
        <span>{score.total}</span>
        <span className="text-[10px] font-normal opacity-70">/100</span>
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-30 mt-1 hidden w-60 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-left text-xs text-white shadow-xl group-hover:block group-focus-within:block"
      >
        <span className="mb-1 block font-semibold text-white/90">Fit breakdown</span>
        <span className="block space-y-0.5">
          {breakdown.map((r) => (
            <span key={r.label} className="flex items-baseline justify-between">
              <span className="text-white/70">{r.label}</span>
              <span className="font-mono text-white">
                {r.value}/{r.max}
              </span>
            </span>
          ))}
        </span>
        {score.matched_skills.length ? (
          <span className="mt-2 block border-t border-white/15 pt-2 text-[11px] leading-snug text-white/80">
            Matched: {score.matched_skills.join(", ")}
          </span>
        ) : null}
      </span>
    </span>
  );
}
