import { useRef, useState } from "react";

import { ApiError } from "@/api/client";
import { RESUME_ACCEPT, RESUME_MAX_BYTES, resumeApi } from "@/api/endpoints";
import type { ResumeUploadResponse } from "@/api/types";

/**
 * Candidate-facing resume picker + uploader.
 *
 * Single source of truth for the upload UX: extension check, size check,
 * progress / success / error states, and the resulting key + autofill
 * suggestion. The apply form embeds this once and reads `onUploaded` to
 * pre-fill structured fields.
 *
 * Why a dedicated component (vs inline in the apply form):
 *   - The validation + error mapping is non-trivial enough that
 *     duplicating it in a second "edit resume" surface later (e.g. on
 *     the profile page) would invite drift.
 *   - The autofill banner is co-located with the upload — the user sees
 *     "we found 4 matching skills" right where they uploaded, not at the
 *     top of the form.
 */
export function ResumeUpload({
  jobId,
  onUploaded,
}: {
  /** Job context lets the autofill cross-match resume text against the
   *  job's required skills. Omit to upload without skill suggestions. */
  jobId?: number;
  /** Fired on every successful upload — apply form persists the key and
   *  applies the autofill. */
  onUploaded: (result: ResumeUploadResponse) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [sizeBytes, setSizeBytes] = useState<number | null>(null);

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
      const result = await resumeApi.upload(file, jobId);
      setStatus("done");
      onUploaded(result);
    } catch (err) {
      setStatus("error");
      setError(err instanceof ApiError ? err.detail : "Upload failed. Please try again.");
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        id="apply-resume-file"
        type="file"
        accept={RESUME_ACCEPT}
        className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
        aria-describedby="apply-resume-help"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
      <p id="apply-resume-help" className="text-xs text-slate-500">
        PDF, DOC, or DOCX. Max {formatSize(RESUME_MAX_BYTES)}.
      </p>
      {status === "uploading" && filename ? (
        <p className="text-xs text-slate-600" role="status">
          Uploading {filename}…
        </p>
      ) : null}
      {status === "done" && filename ? (
        <p className="text-xs text-emerald-700" role="status">
          ✓ Uploaded {filename}
          {sizeBytes !== null ? ` (${formatSize(sizeBytes)})` : ""}
        </p>
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
