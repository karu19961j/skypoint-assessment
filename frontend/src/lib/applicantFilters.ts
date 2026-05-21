import type {
  ApplicantFilters,
  CrossJobApplicantFilters,
} from "@/api/endpoints";
import type { ApplicationStage } from "@/api/types";
import { lpaToRupees } from "@/lib/format";

/**
 * Shared filter shape used by both `/hr/jobs/:id/applicants` and
 * `/hr/applicants` (the cross-job inbox). The two pages used to keep
 * near-identical copies; centralising here means one new filter field
 * lights up on both pages with a single edit.
 *
 * String fields stay as `string` rather than `number` so the controlled
 * inputs render cleanly when the field is empty.
 */
export interface ApplicantFilterForm {
  stage: ApplicationStage | "";
  skills_any: string[];
  skills_all: string[];
  exp_min: string;
  exp_max: string;
  current_ctc_max: string;
  expected_ctc_max: string;
  notice_max_days: string;
  applied_after: string;
  applied_before: string;
  q: string;
  sort: "recent" | "expected_ctc" | "notice" | "experience";
}

export const EMPTY_APPLICANT_FILTERS: ApplicantFilterForm = {
  stage: "",
  skills_any: [],
  skills_all: [],
  exp_min: "",
  exp_max: "",
  current_ctc_max: "",
  expected_ctc_max: "",
  notice_max_days: "",
  applied_after: "",
  applied_before: "",
  q: "",
  sort: "recent",
};

/**
 * Project the controlled-form state into the API filter payload, dropping
 * empty strings and zero-length arrays so the wire request stays compact.
 */
export function applicantFiltersToApi(f: ApplicantFilterForm): ApplicantFilters {
  const out: ApplicantFilters = { sort: f.sort };
  if (f.stage) out.stage = f.stage;
  if (f.skills_any.length) out.skills_any = f.skills_any;
  if (f.skills_all.length) out.skills_all = f.skills_all;
  if (f.exp_min) out.exp_min = Number(f.exp_min);
  if (f.exp_max) out.exp_max = Number(f.exp_max);
  // Form holds LPA (the unit HR types in); the API still speaks rupees.
  if (f.current_ctc_max) out.current_ctc_max = lpaToRupees(f.current_ctc_max);
  if (f.expected_ctc_max) out.expected_ctc_max = lpaToRupees(f.expected_ctc_max);
  if (f.notice_max_days) out.notice_max_days = Number(f.notice_max_days);
  if (f.applied_after) out.applied_after = f.applied_after;
  if (f.applied_before) out.applied_before = f.applied_before;
  if (f.q.trim()) out.q = f.q.trim();
  return out;
}

/**
 * Cross-job variant that adds the optional job_id filter (used by
 * `/hr/applicants`).
 */
export function crossJobFiltersToApi(
  f: ApplicantFilterForm & { job_id: string },
): CrossJobApplicantFilters {
  const out: CrossJobApplicantFilters = applicantFiltersToApi(f);
  if (f.job_id) out.job_id = Number(f.job_id);
  return out;
}
