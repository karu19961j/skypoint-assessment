import type { ApplicationStage, EmploymentType, LocationType } from "@/api/types";

const LAKH = 100_000;

export function formatCtc(amount: number): string {
  if (amount <= 0) return "—";
  if (amount >= LAKH) {
    const lakhs = amount / LAKH;
    return `${lakhs.toFixed(lakhs % 1 === 0 ? 0 : 1)} LPA`;
  }
  return new Intl.NumberFormat("en-IN").format(amount);
}

export function formatCtcRange(min: number, max: number): string {
  if (!min && !max) return "Not disclosed";
  if (min === max) return formatCtc(min);
  return `${formatCtc(min)} – ${formatCtc(max)}`;
}

export function formatExp(min: number, max: number): string {
  if (min === max) return `${min} yr${min === 1 ? "" : "s"}`;
  return `${min}–${max} yrs`;
}

const LOCATION_LABEL: Record<LocationType, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};

const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
};

const STAGE_LABEL: Record<ApplicationStage, string> = {
  applied: "Applied",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
};

const STAGE_COLOR: Record<ApplicationStage, string> = {
  applied: "bg-slate-200 text-slate-700",
  screening: "bg-amber-100 text-amber-800",
  interview: "bg-violet-100 text-violet-800",
  offer: "bg-blue-100 text-blue-800",
  hired: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
};

export function locationLabel(t: LocationType): string {
  return LOCATION_LABEL[t];
}
export function employmentLabel(t: EmploymentType): string {
  return EMPLOYMENT_LABEL[t];
}
export function stageLabel(s: ApplicationStage): string {
  return STAGE_LABEL[s];
}
export function stageColor(s: ApplicationStage): string {
  return STAGE_COLOR[s];
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 30) return `${Math.floor(diffSec / 86400)}d ago`;
  return formatDate(iso);
}

export function splitCsv(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}
