import { apiFetch } from "./client";
import type {
  Application,
  ApplicationCreate,
  ApplicationEvent,
  ApplicationNote,
  ApplicationStage,
  Bookmark,
  DashboardData,
  Job,
  JobCreate,
  JobStatus,
  JobUpdate,
  TokenResponse,
  User,
} from "./types";

export const authApi = {
  login(email: string, password: string) {
    return apiFetch<TokenResponse>("/auth/login", {
      method: "POST",
      body: { email, password },
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
}

export const jobsApi = {
  list(filters: JobListFilters = {}) {
    return apiFetch<Job[]>("/jobs/", { query: filters as Record<string, unknown> });
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
  remove(id: number) {
    return apiFetch<void>(`/jobs/${id}`, { method: "DELETE" });
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

export const applicationsApi = {
  apply(payload: ApplicationCreate) {
    return apiFetch<Application>("/applications/", { method: "POST", body: payload });
  },
  mine(filters: { stage?: ApplicationStage; q?: string } = {}) {
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
