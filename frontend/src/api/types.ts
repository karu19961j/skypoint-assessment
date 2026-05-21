export type UserRole = "hr" | "candidate";

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export type LocationType = "remote" | "hybrid" | "onsite";
export type EmploymentType =
  | "full_time"
  | "part_time"
  | "contract"
  | "internship";
export type JobStatus = "active" | "paused" | "closed";

export interface Job {
  id: number;
  hr_id: number;
  title: string;
  description: string;
  department: string;
  location_type: LocationType;
  employment_type: EmploymentType;
  exp_min: number;
  exp_max: number;
  ctc_min: number;
  ctc_max: number;
  skills: string[];
  deadline: string | null;
  status: JobStatus;
  created_at: string;
}

export type JobCreate = Omit<Job, "id" | "hr_id" | "status" | "created_at">;
export type JobUpdate = Partial<JobCreate & { status: JobStatus }>;

export type ApplicationStage =
  | "applied"
  | "screening"
  | "interview"
  | "offer"
  | "hired"
  | "rejected";

export const APPLICATION_STAGES: ApplicationStage[] = [
  "applied",
  "screening",
  "interview",
  "offer",
  "hired",
  "rejected",
];

export interface JobMini {
  id: number;
  title: string;
  department: string;
}

export interface CandidateMini {
  id: number;
  full_name: string;
  email: string;
}

export interface ResumeMeta {
  filename: string | null;
  size_bytes: number | null;
  content_type: string | null;
}

export interface Application {
  id: number;
  job_id: number;
  candidate_id: number;
  /** Resume metadata. `null` on anonymized list responses; populated on
   *  the identity-bearing detail endpoint (Profile drawer). */
  resume: ResumeMeta | null;
  cover_note: string;
  current_ctc: number;
  expected_ctc: number;
  notice_period_days: number;
  years_experience: number;
  skills: string[];
  stage: ApplicationStage;
  created_at: string;
  updated_at: string;
  job?: JobMini | null;
  candidate?: CandidateMini | null;
  /** Stages this application is allowed to transition into next.
   *  Backend-authoritative; the HR stage dropdown filters on this. */
  allowed_next_stages: ApplicationStage[];
}

export interface ApplicationCreate {
  job_id: number;
  /** Set after a successful POST /api/resume/upload. Optional — a
   *  candidate may apply without a resume. */
  resume_key: string | null;
  cover_note: string;
  current_ctc: number;
  expected_ctc: number;
  notice_period_days: number;
  years_experience: number;
  skills: string[];
}

export interface ResumeAutofill {
  skills: string[];
  years_experience: number | null;
}

export interface ResumeUploadResponse {
  resume_key: string;
  filename: string;
  size_bytes: number;
  content_type: string;
  autofill: ResumeAutofill;
}

export interface ApplicationNote {
  id: number;
  application_id: number;
  hr_id: number;
  body: string;
  created_at: string;
}

export interface ApplicationEvent {
  id: number;
  application_id: number;
  from_stage: ApplicationStage | null;
  to_stage: ApplicationStage;
  changed_by_user_id: number;
  created_at: string;
}

/**
 * Score breakdown shared between HR candidate ranking and candidate job
 * recommendations. Mirrors `BaseScoreOut` on the backend.
 *
 *   - `notice` is meaningful only in HR ranking (immediate-joiner bonus);
 *     recommendations emit 0.
 *   - `location` is meaningful only in recommendations (preferred-location
 *     match bonus); ranking emits 0.
 *
 * Both directions populate the same shape so `<ScoreBadge>` consumes a
 * single type contract regardless of which endpoint produced it.
 */
export interface ScoreBreakdown {
  total: number;
  skill: number;
  exp: number;
  ctc: number;
  notice: number;
  location: number;
  matched_skills: string[];
}

/** @deprecated use ScoreBreakdown */
export type ApplicationScore = ScoreBreakdown;
/** @deprecated use ScoreBreakdown */
export type JobScore = ScoreBreakdown;

export interface RankedApplication extends Application {
  score: ScoreBreakdown;
}

export interface RecommendedJob extends Job {
  score: ScoreBreakdown;
}

export interface CandidateProfile {
  skills: string[];
  years_experience: number;
  expected_ctc: number;
  preferred_locations: LocationType[];
  created_at: string;
}

export interface ProfileUpsert {
  skills: string[];
  years_experience: number;
  expected_ctc: number;
  preferred_locations: LocationType[];
}

export interface Bookmark {
  id: number;
  job_id: number;
  candidate_id: number;
  created_at: string;
  job?: Job | null;
}

export interface JobFunnelEntry {
  job_id: number;
  title: string;
  counts: Record<ApplicationStage, number>;
  total: number;
}

export interface DashboardData {
  jobs: { active: number; paused: number; closed: number };
  applications: { today: number; this_week: number };
  funnels: JobFunnelEntry[];
  top_jobs: JobFunnelEntry[];
}
