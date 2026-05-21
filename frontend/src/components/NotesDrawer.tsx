import { useEffect, useRef, useState } from "react";

import { ApiError } from "@/api/client";
import { applicationsApi } from "@/api/endpoints";
import type { Application, ApplicationNote } from "@/api/types";
import { ApplicationTimeline } from "@/components/ApplicationTimeline";
import { ErrorBanner } from "@/components/ErrorBanner";
import { formatRelative } from "@/lib/format";

export function NotesDrawer({
  application,
  onClose,
}: {
  application: Application;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState<ApplicationNote[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Close on Escape + move focus to the close button on open + restore
  // focus to the previously-focused element on close. This is the minimum
  // viable "trap" for an a11y-compliant dialog without pulling in focus-trap-react.
  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previouslyFocused.current?.focus?.();
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    applicationsApi
      .listNotes(application.id)
      .then((rows) => {
        if (!cancelled) setNotes(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.detail : "Failed to load notes");
      });
    return () => {
      cancelled = true;
    };
  }, [application.id]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const note = await applicationsApi.addNote(application.id, body.trim());
      setNotes((prev) => [note, ...prev]);
      setBody("");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-drawer-heading"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="profile-drawer-heading" className="text-lg font-semibold text-slate-900">
              {application.candidate?.full_name ?? "Candidate profile"}
            </h2>
            {application.candidate?.email ? (
              <p className="text-sm text-slate-500">
                <a
                  href={`mailto:${application.candidate.email}`}
                  className="hover:text-brand-700"
                >
                  {application.candidate.email}
                </a>
              </p>
            ) : null}
            {application.job ? (
              <p className="mt-1 text-xs uppercase tracking-wider text-slate-400">
                Applied for {application.job.title}
              </p>
            ) : null}
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700"
            aria-label="Close profile drawer"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1">
            <div className="text-slate-500">Experience</div>
            <div className="font-medium text-slate-900">{application.years_experience}y</div>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1">
            <div className="text-slate-500">Notice</div>
            <div className="font-medium text-slate-900">{application.notice_period_days}d</div>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1">
            <div className="text-slate-500">Current CTC</div>
            <div className="font-medium text-slate-900">{application.current_ctc.toLocaleString("en-IN")}</div>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1">
            <div className="text-slate-500">Expected CTC</div>
            <div className="font-medium text-slate-900">{application.expected_ctc.toLocaleString("en-IN")}</div>
          </div>
        </div>

        <div className="mt-3">
          <a
            href={application.resume_link}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary text-xs"
            aria-label={`Open ${application.candidate?.full_name ?? "candidate"}'s resume in a new tab`}
          >
            Open resume ↗
          </a>
        </div>

        {application.cover_note ? (
          <details className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm">
            <summary className="cursor-pointer font-medium text-slate-700">Cover note</summary>
            <p className="mt-2 whitespace-pre-wrap text-slate-700">{application.cover_note}</p>
          </details>
        ) : null}

        <ErrorBanner message={error} />

        <form onSubmit={add} className="mt-4 space-y-2">
          <label className="label" htmlFor="note-body">
            New note
          </label>
          <textarea
            id="note-body"
            className="input min-h-[80px]"
            placeholder="Add a private note about this candidate…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <button
            type="submit"
            className="btn-primary text-sm"
            disabled={saving || !body.trim()}
          >
            {saving ? "Saving…" : "Add note"}
          </button>
        </form>

        <div className="mt-6 space-y-3">
          {notes.length === 0 ? (
            <p className="text-sm text-slate-500">No notes yet.</p>
          ) : (
            notes.map((n) => (
              <div key={n.id} className="rounded-md border border-slate-200 p-3">
                <div className="text-xs text-slate-500">{formatRelative(n.created_at)}</div>
                <div className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{n.body}</div>
              </div>
            ))
          )}
        </div>

        <div className="mt-6 border-t border-slate-200 pt-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Stage history</h3>
          <ApplicationTimeline applicationId={application.id} />
        </div>
      </div>
    </div>
  );
}
