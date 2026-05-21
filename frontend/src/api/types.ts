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

export interface Application {
  id: number;
  job_id: number;
  candidate_id: number;
  resume_link: string;
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
}

export interface ApplicationCreate {
  job_id: number;
  resume_link: string;
  cover_note: string;
  current_ctc: number;
  expected_ctc: number;
  notice_period_days: number;
  years_experience: number;
  skills: string[];
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

export interface Bookmark {
  id: number;
  job_id: number;
  candidate_id: number;
  created_at: string;
  job?: Job | null;
}

export interface DashboardData {
  jobs: { active: number; paused: number; closed: number };
  applications: { today: number; this_week: number };
  funnels: Array<{
    job_id: number;
    title: string;
    counts: Record<ApplicationStage, number>;
    total: number;
  }>;
}
