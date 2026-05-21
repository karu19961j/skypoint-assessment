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
  // Opt out of the global 401 interceptor (used by login/register so a 401
  // from "wrong password" doesn't trigger a redirect loop on the page that
  // already shows the login form).
  skipAuthRedirect?: boolean;
}

let onUnauthorized: (() => void) | null = null;

/** Wire up a global hook to be called when an authenticated request returns 401. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
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

/**
 * Authenticated blob download for endpoints that stream a file (currently
 * just the applicants CSV export). Builds the query string itself, sets
 * the bearer header, parses Content-Disposition for the suggested
 * filename, and triggers a hidden anchor click to save the file.
 */
export async function downloadFile(
  path: string,
  query?: Record<string, unknown>,
  fallbackFilename = "download",
): Promise<void> {
  const url = `/api${path}${buildQuery(query)}`;
  const token = getToken();
  const resp = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!resp.ok) {
    throw new ApiError(resp.status, await resp.text());
  }
  const blob = await resp.blob();
  const objectUrl = URL.createObjectURL(blob);
  const filenameMatch = resp.headers
    .get("Content-Disposition")
    ?.match(/filename="?([^"]+)"?/);
  const filename = filenameMatch?.[1] ?? fallbackFilename;
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
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

    // Token-expired / invalidated mid-session: clear it and notify the app
    // so it can redirect to /login. Skip on requests that legitimately may
    // return 401 (login/register attempts with wrong creds).
    if (
      resp.status === 401 &&
      token !== null &&
      !opts.skipAuthRedirect &&
      onUnauthorized
    ) {
      setToken(null);
      onUnauthorized();
    }

    throw new ApiError(resp.status, detail);
  }
  return payload as T;
}
