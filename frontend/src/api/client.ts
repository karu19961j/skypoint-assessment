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


/**
 * Authenticated multipart/form-data upload. Browser-set Content-Type
 * (with the boundary) is preserved by NOT including it in headers — let
 * `fetch` infer it from the FormData body.
 *
 * Errors are surfaced as the same `ApiError` JSON callers see, so the
 * upload UI uses the same handling path as every other endpoint.
 */
export async function apiUpload<T>(
  path: string,
  formData: FormData,
  opts: { query?: Record<string, unknown>; signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = `/api${path}${buildQuery(opts.query)}`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers,
      body: formData,
      signal: opts.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err;
    }
    throw new ApiError(0, "Couldn't reach the server. Check your connection and try again.");
  }

  const contentType = resp.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await resp.json()
    : await resp.text();

  if (!resp.ok) {
    const detail =
      typeof payload === "object" && payload !== null && "detail" in payload
        ? String((payload as { detail: unknown }).detail)
        : String(payload);
    if (resp.status === 401 && token !== null && onUnauthorized) {
      setToken(null);
      onUnauthorized();
    }
    throw new ApiError(resp.status, detail);
  }
  return payload as T;
}


/**
 * Authenticated GET that returns the parsed body alongside the
 * `X-Total-Count` header (for paginated endpoints). Same auth + error
 * handling as `apiFetch`; just one extra read of the response header.
 *
 * Returns `{ items, total }`. `total` is null when the server doesn't
 * include the header — caller falls back gracefully.
 */
export async function apiFetchWithCount<T>(
  path: string,
  opts: { query?: Record<string, unknown>; signal?: AbortSignal } = {},
): Promise<{ items: T; total: number | null }> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = `/api${path}${buildQuery(opts.query)}`;
  let resp: Response;
  try {
    resp = await fetch(url, { method: "GET", headers, signal: opts.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, "Couldn't reach the server. Check your connection and try again.");
  }

  const contentType = resp.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await resp.json()
    : await resp.text();

  if (!resp.ok) {
    const detail =
      typeof payload === "object" && payload !== null && "detail" in payload
        ? String((payload as { detail: unknown }).detail)
        : String(payload);
    if (resp.status === 401 && token !== null && onUnauthorized) {
      setToken(null);
      onUnauthorized();
    }
    throw new ApiError(resp.status, detail);
  }

  const totalHeader = resp.headers.get("X-Total-Count");
  const total = totalHeader === null ? null : Number(totalHeader);
  return { items: payload as T, total: Number.isFinite(total) ? total : null };
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
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: opts.method ?? "GET",
      headers,
      body,
      signal: opts.signal,
    });
  } catch (err) {
    // `fetch` rejects with TypeError on network failures (DNS error,
    // backend down, offline). Surface a friendly ApiError so the UI's
    // existing `err instanceof ApiError` branch renders it cleanly.
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err; // cancelled by the caller; re-throw verbatim
    }
    throw new ApiError(0, "Couldn't reach the server. Check your connection and try again.");
  }

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
