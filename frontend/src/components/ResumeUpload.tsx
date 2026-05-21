import { useRef, useState } from "react";

import { ApiError } from "@/api/client";
import { RESUME_ACCEPT, RESUME_MAX_BYTES, resumeApi } from "@/api/endpoints";
import type { ResumeUploadResponse } from "@/api/types";

/**
 * Resume picker + uploader used on /me/profile.
 *
 * Single source of truth for the upload UX: extension check, size check,
 * progress/done/error states, and the resulting key. The profile form
 * persists the key on save; applications snapshot it at apply time.
 *
 * Autofill removed — the candidate fills the profile manually because
 * profile is the canonical source. The parsed resume_text still gets
 * stored on the profile for HR keyword search.
 */
export function ResumeUpload({
  initialFilename,
  initialSizeBytes,
  onUploaded,
  onCleared,
}: {
  /** Existing resume filename (when editing a profile that already has one). */
  initialFilename?: string | null;
  initialSizeBytes?: number | null;
  /** Fired on every successful upload with the new resume_key. */
  onUploaded: (result: ResumeUploadResponse) => void;
  /** Fired when the candidate clears their resume from the profile. */
  onCleared?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">(
    initialFilename ? "done" : "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(initialFilename ?? null);
  const [sizeBytes, setSizeBytes] = useState<number | null>(initialSizeBytes ?? null);

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > RESUME_MAX_BYTES) {
      setStatus("error");
      setError(`File is ${formatSize(file.size)}; max is ${formatSize(RESUME_MAX_BYTES)}.`);
      return;
    }
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (![".pdf", ".doc", ".docx"].includes(ext)) {
      setStatus("error");
      setError("Resume must be PDF, DOC, or DOCX.");
      return;
    }
    setStatus("uploading");
    setFilename(file.name);
    setSizeBytes(file.size);
    try {
      const result = await resumeApi.upload(file);
      setStatus("done");
      onUploaded(result);
    } catch (err) {
      setStatus("error");
      setError(err instanceof ApiError ? err.detail : "Upload failed. Please try again.");
    }
  };

  const clear = () => {
    setStatus("idle");
    setFilename(null);
    setSizeBytes(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
    onCleared?.();
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
      {status === "uploading" && filename ? (
        <p className="text-xs text-slate-600" role="status">
          Uploading {filename}…
        </p>
      ) : null}
      {status === "done" && filename ? (
        <div className="flex items-center gap-2">
          <p className="text-xs text-emerald-700" role="status">
            ✓ {filename}
            {sizeBytes !== null ? ` (${formatSize(sizeBytes)})` : ""}
          </p>
          {onCleared ? (
            <button
              type="button"
              onClick={clear}
              className="text-xs text-rose-600 hover:underline"
              aria-label="Remove resume from profile"
            >
              Remove
            </button>
          ) : null}
        </div>
      ) : null}
      {status === "error" && error ? (
        <p className="text-xs text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
