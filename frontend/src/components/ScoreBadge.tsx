import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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

// Tooltip width cap stays in sync with the inline className below; we
// need the number in JS to keep the tooltip from clipping past the
// right viewport edge on narrow screens.
const TOOLTIP_MAX_WIDTH = 240; // 15rem

export function ScoreBadge({ score }: { score: ScoreBreakdown }) {
  const breakdown = rows(score);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Recompute position whenever the tooltip opens. Using viewport
  // coordinates + `position: fixed` lets the tooltip render via portal
  // into document.body, escaping any `overflow-x-auto` ancestors (the
  // applicants table wrapper, the page main, etc.) that would otherwise
  // clip an absolutely-positioned popover at the table boundary.
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const width = Math.min(TOOLTIP_MAX_WIDTH, window.innerWidth * 0.9);
    const left = Math.min(rect.left, window.innerWidth - width - 8);
    setPos({ top: rect.bottom + 4, left: Math.max(8, left) });
  }, [open]);

  const ariaSummary =
    `Fit score ${score.total} out of 100. ` +
    breakdown.map((r) => `${r.label} ${r.value} of ${r.max}`).join(", ") +
    (score.matched_skills.length
      ? `. Matched skills: ${score.matched_skills.join(", ")}.`
      : ".");

  const tooltip =
    open && pos
      ? createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-50 w-[min(15rem,90vw)] rounded-lg bg-slate-900 px-3 py-2 text-left text-xs text-white shadow-xl"
            style={{ top: pos.top, left: pos.left }}
          >
            <div className="mb-1 font-semibold text-white/90">Fit breakdown</div>
            <div className="space-y-0.5">
              {breakdown.map((r) => (
                <div key={r.label} className="flex items-baseline justify-between">
                  <span className="text-white/70">{r.label}</span>
                  <span className="font-mono text-white">
                    {r.value}/{r.max}
                  </span>
                </div>
              ))}
            </div>
            {score.matched_skills.length ? (
              <div className="mt-2 border-t border-white/15 pt-2 text-[11px] leading-snug text-white/80">
                Matched: {score.matched_skills.join(", ")}
              </div>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <span
        ref={anchorRef}
        className="inline-flex"
        tabIndex={0}
        aria-label={ariaSummary}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <span
          className={`inline-flex items-baseline gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${tone(score.total)}`}
        >
          <span>{score.total}</span>
          <span className="text-[10px] font-normal opacity-70">/100</span>
        </span>
      </span>
      {tooltip}
    </>
  );
}
