import { useEffect, useState } from "react";

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
      aria-labelledby="notes-drawer-heading"
    >
      <div className="w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 id="notes-drawer-heading" className="text-lg font-semibold">
              Notes
            </h2>
            <p className="text-sm text-slate-500">
              About {application.candidate?.full_name ?? "candidate"}
              {application.job ? ` · ${application.job.title}` : ""} — visible to HR only.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700"
            aria-label="Close notes drawer"
          >
            ✕
          </button>
        </div>

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
