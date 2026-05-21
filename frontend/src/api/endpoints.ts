import { apiFetch, apiFetchWithCount, apiUpload } from "./client";
import type {
  Application,
  ApplicationCreate,
  ApplicationEvent,
  ApplicationNote,
  ApplicationStage,
  Bookmark,
  CandidateProfile,
  DashboardData,
  Job,
  JobCreate,
  JobStatus,
  JobUpdate,
  ProfileUpsert,
  RankedApplication,
  RecommendedJob,
  ResumeUploadResponse,
  TokenResponse,
  User,
} from "./types";

export const authApi = {
  login(email: string, password: string) {
    return apiFetch<TokenResponse>("/auth/login", {
      method: "POST",
      body: { email, password },
      skipAuthRedirect: true,
    });
  },
  register(payload: {
    email: string;
    password: string;
    full_name: string;
    role: "hr" | "candidate";
  }) {
    return apiFetch<TokenResponse>("/auth/register", {
      method: "POST",
      body: payload,
      skipAuthRedirect: true,
    });
  },
  me() {
    return apiFetch<User>("/auth/me");
  },
};

export interface JobListFilters {
  q?: string;
  location_type?: string;
  employment_type?: string;
  department?: string;
  exp_min?: number;
  exp_max?: number;
  ctc_min?: number;
  ctc_max?: number;
  skills?: string[];
  status?: JobStatus;
  mine?: boolean;
  sort?: "recent" | "salary_high" | "exp_low";
  limit?: number;
  offset?: number;
}

export const jobsApi = {
  list(filters: JobListFilters = {}) {
    return apiFetch<Job[]>("/jobs/", { query: filters as Record<string, unknown> });
  },
  /** Like `list`, but returns the X-Total-Count for the pagination footer. */
  listWithCount(filters: JobListFilters = {}) {
    return apiFetchWithCount<Job[]>("/jobs/", {
      query: filters as Record<string, unknown>,
    });
  },
  get(id: number) {
    return apiFetch<Job>(`/jobs/${id}`);
  },
  create(payload: JobCreate) {
    return apiFetch<Job>("/jobs/", { method: "POST", body: payload });
  },
  update(id: number, payload: JobUpdate) {
    return apiFetch<Job>(`/jobs/${id}`, { method: "PATCH", body: payload });
  },
  setStatus(id: number, status: JobStatus) {
    return apiFetch<Job>(`/jobs/${id}/status`, {
      method: "PATCH",
      body: { status },
    });
  },
  close(id: number) {
    return apiFetch<Job>(`/jobs/${id}/close`, { method: "POST" });
  },
  recommended() {
    return apiFetch<RecommendedJob[]>("/jobs/recommended");
  },
};

export interface ApplicantFilters {
  stage?: ApplicationStage;
  skills_any?: string[];
  skills_all?: string[];
  exp_min?: number;
  exp_max?: number;
  current_ctc_min?: number;
  current_ctc_max?: number;
  expected_ctc_min?: number;
  expected_ctc_max?: number;
  notice_max_days?: number;
  applied_after?: string;
  applied_before?: string;
  q?: string;
  sort?: "recent" | "expected_ctc" | "notice" | "experience";
}

export interface CrossJobApplicantFilters extends ApplicantFilters {
  /** Scope to a specific job (must be owned by the requesting HR). */
  job_id?: number;
}

export interface PaginatedApplicantFilters extends ApplicantFilters {
  limit?: number;
  offset?: number;
}

export interface PaginatedCrossJobFilters extends CrossJobApplicantFilters {
  limit?: number;
  offset?: number;
}

export const applicationsApi = {
  apply(payload: ApplicationCreate) {
    return apiFetch<Application>("/applications/", { method: "POST", body: payload });
  },
  /** Full detail including candidate identity + resume URL. The list
   *  endpoints anonymize their responses by design — use this to populate
   *  the Profile drawer when HR clicks "View profile". */
  get(id: number) {
    return apiFetch<Application>(`/applications/${id}`);
  },
  mine(filters: { stage?: ApplicationStage; q?: string; sort?: "recent" | "updated" } = {}) {
    return apiFetch<Application[]>("/applications/mine", { query: filters });
  },
  withdraw(id: number) {
    return apiFetch<void>(`/applications/${id}`, { method: "DELETE" });
  },
  byJob(jobId: number, filters: ApplicantFilters = {}) {
    return apiFetch<Application[]>(`/applications/by-job/${jobId}`, {
      query: filters as Record<string, unknown>,
    });
  },
  byJobWithCount(jobId: number, filters: PaginatedApplicantFilters = {}) {
    return apiFetchWithCount<Application[]>(`/applications/by-job/${jobId}`, {
      query: filters as Record<string, unknown>,
    });
  },
  all(filters: CrossJobApplicantFilters = {}) {
    return apiFetch<Application[]>("/applications/all", {
      query: filters as Record<string, unknown>,
    });
  },
  allWithCount(filters: PaginatedCrossJobFilters = {}) {
    return apiFetchWithCount<Application[]>("/applications/all", {
      query: filters as Record<string, unknown>,
    });
  },
  setStage(id: number, stage: ApplicationStage) {
    return apiFetch<Application>(`/applications/${id}/stage`, {
      method: "PATCH",
      body: { stage },
    });
  },
  listNotes(id: number) {
    return apiFetch<ApplicationNote[]>(`/applications/${id}/notes`);
  },
  addNote(id: number, body: string) {
    return apiFetch<ApplicationNote>(`/applications/${id}/notes`, {
      method: "POST",
      body: { body },
    });
  },
  timeline(id: number) {
    return apiFetch<ApplicationEvent[]>(`/applications/${id}/timeline`);
  },
  ranked(jobId: number) {
    return apiFetch<RankedApplication[]>(`/applications/by-job/${jobId}/ranked`);
  },
};

export const profileApi = {
  get() {
    return apiFetch<CandidateProfile | null>("/profile/");
  },
  upsert(payload: ProfileUpsert) {
    return apiFetch<CandidateProfile>("/profile/", { method: "PUT", body: payload });
  },
  remove() {
    return apiFetch<void>("/profile/", { method: "DELETE" });
  },
  /** Path of the candidate's own profile-resume stream. Fetched
   *  authenticated; the helper turns the blob into an object URL so a
   *  PDF opens inline in a new tab. */
  resumePath: "/profile/resume",
};

export const bookmarksApi = {
  list() {
    return apiFetch<Bookmark[]>("/bookmarks/");
  },
  add(jobId: number) {
    return apiFetch<Bookmark>("/bookmarks/", {
      method: "POST",
      body: { job_id: jobId },
    });
  },
  remove(jobId: number) {
    return apiFetch<void>(`/bookmarks/${jobId}`, { method: "DELETE" });
  },
};

export const dashboardApi = {
  hr() {
    return apiFetch<DashboardData>("/dashboard/hr");
  },
};

export const resumeApi = {
  /**
   * Upload a resume file. Returns the storage key the apply form embeds
   * in the application POST, plus autofill suggestions derived from the
   * resume text (skills cross-matched against the job's required skills,
   * plus a best-effort YOE guess).
   */
  upload(file: File, jobId?: number) {
    const fd = new FormData();
    fd.append("file", file);
    return apiUpload<ResumeUploadResponse>(
      "/resume/upload",
      fd,
      jobId !== undefined ? { query: { job_id: jobId } } : {},
    );
  },
  /** Build the absolute path the download anchor / fetch hits. */
  downloadPath(applicationId: number): string {
    return `/resume/${applicationId}/download`;
  },
};

/** Max upload size in bytes — mirrors RESUME_MAX_BYTES on the backend so
 *  the client can short-circuit oversize files before sending. */
export const RESUME_MAX_BYTES = 15 * 1024 * 1024;
export const RESUME_ACCEPT = ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
