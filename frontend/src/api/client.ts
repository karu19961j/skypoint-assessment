const TOKEN_KEY = "jobportal.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, unknown>;
  signal?: AbortSignal;
}

function buildQuery(params: Record<string, unknown> | undefined): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item !== undefined && item !== null && item !== "") {
          sp.append(k, String(item));
        }
      }
    } else if (typeof v === "boolean") {
      sp.set(k, v ? "true" : "false");
    } else {
      sp.set(k, String(v));
    }
  }
  const str = sp.toString();
  return str ? `?${str}` : "";
}

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: string | undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const url = `/api${path}${buildQuery(opts.query)}`;
  const resp = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body,
    signal: opts.signal,
  });

  if (resp.status === 204) {
    return undefined as T;
  }

  const contentType = resp.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await resp.json()
    : await resp.text();

  if (!resp.ok) {
    const detail =
      typeof payload === "object" && payload !== null && "detail" in payload
        ? Array.isArray((payload as { detail: unknown }).detail)
          ? JSON.stringify((payload as { detail: unknown }).detail)
          : String((payload as { detail: unknown }).detail)
        : String(payload);
    throw new ApiError(resp.status, detail);
  }
  return payload as T;
}
