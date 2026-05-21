import { useRef, useState } from "react";

import { ApiError, getToken } from "@/api/client";
import { RESUME_ACCEPT, RESUME_MAX_BYTES, profileApi, resumeApi } from "@/api/endpoints";
import type { ResumeUploadResponse } from "@/api/types";
import { notifyError } from "@/lib/toast";

/**
 * Resume picker + uploader used on /me/profile.
 *
 * State model: two slots that are unioned for display.
 *
 *   - `existing` — the saved-to-server resume, read from props. The
 *     parent's profile query lands AFTER mount, so we read these on
 *     every render (not a useEffect that races with local uploads).
 *
 *   - `pending` — what the candidate just picked in this session,
 *     before saving the profile. Wins over `existing` when set.
 *
 * "View" fetches the existing blob (authenticated) and opens it in a
 * new tab via objectURL — the only way to render a PDF inline without
 * leaking the bearer in a querystring.
 */
export function ResumeUpload({
  initialFilename,
  initialSizeBytes,
  onUploaded,
  onCleared,
}: {
  initialFilename?: string | null;
  initialSizeBytes?: number | null;
  onUploaded: (result: ResumeUploadResponse) => void;
  onCleared?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ filename: string; size: number } | null>(null);
  const [transient, setTransient] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  // `cleared` lets the user remove an existing resume without immediately
  // wiping the parent's state — we hide the existing display and the
  // parent's onCleared callback updates state on save.
  const [cleared, setCleared] = useState(false);

  const existing =
    !cleared && initialFilename
      ? { filename: initialFilename, size: initialSizeBytes ?? null }
      : null;
  const display = pending ?? existing;
  const isExisting = !pending && existing !== null;

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > RESUME_MAX_BYTES) {
      setTransient("error");
      setError(`File is ${formatSize(file.size)}; max is ${formatSize(RESUME_MAX_BYTES)}.`);
      return;
    }
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (![".pdf", ".doc", ".docx"].includes(ext)) {
      setTransient("error");
      setError("Resume must be PDF, DOC, or DOCX.");
      return;
    }
    setTransient("uploading");
    setPending({ filename: file.name, size: file.size });
    try {
      const result = await resumeApi.upload(file);
      setTransient("idle");
      setCleared(false);
      onUploaded(result);
    } catch (err) {
      setTransient("error");
      setPending(null);
      setError(err instanceof ApiError ? err.detail : "Upload failed. Please try again.");
    }
  };

  const clear = () => {
    setPending(null);
    setCleared(true);
    setTransient("idle");
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
    onCleared?.();
  };

  const viewResume = async () => {
    setError(null);
    try {
      const token = getToken();
      const resp = await fetch(`/api${profileApi.resumePath}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) {
        const detail = await safeDetail(resp);
        throw new ApiError(resp.status, detail);
      }
      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener");
      // Revoke after a beat so the viewer has time to load the blob;
      // never-revoking is a leak.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (err) {
      notifyError(err, "Could not open resume");
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        id="profile-resume-file"
        type="file"
        accept={RESUME_ACCEPT}
        className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
        aria-describedby="profile-resume-help"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
      <p id="profile-resume-help" className="text-xs text-slate-500">
        PDF, DOC, or DOCX. Max {formatSize(RESUME_MAX_BYTES)}. Your resume travels
        with every application you submit.
      </p>
      {transient === "uploading" && pending ? (
        <p className="text-xs text-slate-600" role="status">
          Uploading {pending.filename}…
        </p>
      ) : null}
      {display && transient !== "uploading" ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <span className="text-xs text-slate-700">
            <span className="text-emerald-700">✓</span>{" "}
            <span className="font-medium">{display.filename}</span>
            {display.size !== null && display.size !== undefined ? (
              <span className="text-slate-500"> · {formatSize(display.size)}</span>
            ) : null}
          </span>
          {isExisting ? (
            <button
              type="button"
              onClick={viewResume}
              className="text-xs font-medium text-brand-700 hover:underline"
              aria-label={`View ${display.filename}`}
            >
              View
            </button>
          ) : (
            <span className="text-xs text-slate-500" aria-hidden="true">
              Save the profile to keep this resume.
            </span>
          )}
          {onCleared ? (
            <button
              type="button"
              onClick={clear}
              className="ml-auto text-xs text-rose-600 hover:underline"
              aria-label="Remove resume from profile"
            >
              Remove
            </button>
          ) : null}
        </div>
      ) : null}
      {transient === "error" && error ? (
        <p className="text-xs text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

async function safeDetail(resp: Response): Promise<string> {
  try {
    const ct = resp.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const j = await resp.json();
      return typeof j.detail === "string" ? j.detail : `HTTP ${resp.status}`;
    }
    return `HTTP ${resp.status}`;
  } catch {
    return `HTTP ${resp.status}`;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
