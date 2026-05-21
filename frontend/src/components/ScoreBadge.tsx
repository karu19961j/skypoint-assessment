interface ScoreLike {
  total: number;
  skill: number;
  exp: number;
  ctc: number;
  notice?: number;
  location?: number;
  matched_skills: string[];
}

function tone(total: number): string {
  if (total >= 80) return "bg-emerald-100 text-emerald-800 ring-emerald-200";
  if (total >= 60) return "bg-amber-100 text-amber-800 ring-amber-200";
  return "bg-rose-100 text-rose-800 ring-rose-200";
}

export function ScoreBadge({ score }: { score: ScoreLike }) {
  const parts = [
    `Skills ${score.skill}/50`,
    `Exp ${score.exp}/30`,
    `CTC ${score.ctc}/20`,
  ];
  if (typeof score.notice === "number") parts.push(`Notice ${score.notice}/5`);
  if (typeof score.location === "number" && score.location > 0) {
    parts.push(`Location +${score.location}`);
  }

  const tooltip =
    parts.join(" · ") +
    (score.matched_skills.length
      ? `\nMatched: ${score.matched_skills.join(", ")}`
      : "");

  return (
    <span
      className={`inline-flex items-baseline gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${tone(score.total)}`}
      title={tooltip}
      aria-label={`Fit score ${score.total} out of 100. ${parts.join(", ")}.`}
    >
      <span>{score.total}</span>
      <span className="text-[10px] font-normal opacity-70">/100</span>
    </span>
  );
}
