import { useId, useRef, useState, type KeyboardEvent } from "react";

interface TagInputProps {
  /** Current list of tags (controlled). */
  value: string[];
  /** Called with the next list. Tags are lower-cased + trimmed + deduped. */
  onChange: (next: string[]) => void;
  /** Optional input id for label association. Provide one when there is a
   *  visible <label htmlFor=…> elsewhere. */
  id?: string;
  placeholder?: string;
  /** Maximum number of tags allowed; default 30. */
  max?: number;
  /** When true, the input is read-only (still focusable). */
  disabled?: boolean;
  /** aria-label fallback when there is no visible <label htmlFor=…>. */
  ariaLabel?: string;
  /** aria-describedby id for any help / error text. */
  ariaDescribedBy?: string;
}

/**
 * A minimal pill-style tag input.
 *
 * Behaviour:
 *  - Type a tag and press Enter, Comma, or Tab → commit it.
 *  - Click the × on any pill → remove that tag.
 *  - Backspace on an empty input → remove the most recently added tag.
 *  - Pasting "react, ts, vite" splits on commas and adds all three.
 *  - Each new tag is trimmed + lower-cased + deduped before commit.
 */
export function TagInput({
  value,
  onChange,
  id,
  placeholder = "Type a skill and press Enter",
  max = 30,
  disabled,
  ariaLabel,
  ariaDescribedBy,
}: TagInputProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const generatedId = useId();
  const inputId = id ?? `tag-input-${generatedId}`;

  const commit = (raw: string) => {
    const additions = raw
      .split(",")
      // Match backend `normalize_skill()` — lowercase + trim + collapse
      // internal whitespace so "React  Native" and "react native"
      // round-trip equal across the scoring engine.
      .map((s) => s.trim().toLowerCase().split(/\s+/).filter(Boolean).join(" "))
      .filter(Boolean);
    if (additions.length === 0) return;
    const merged: string[] = [...value];
    for (const tag of additions) {
      if (merged.length >= max) break;
      if (!merged.includes(tag)) merged.push(tag);
    }
    if (merged.length !== value.length) onChange(merged);
    setDraft("");
  };

  const remove = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      if (draft.trim()) {
        e.preventDefault();
        commit(draft);
      }
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      e.preventDefault();
      remove(value[value.length - 1]);
    }
  };

  return (
    <div
      className="flex w-full flex-wrap items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm shadow-sm ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-brand-500"
      onClick={() => inputRef.current?.focus()}
      role="group"
      aria-label={ariaLabel ?? "Skill tags"}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand-700"
        >
          {tag}
          {disabled ? null : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(tag);
              }}
              aria-label={`Remove ${tag}`}
              className="-mr-0.5 rounded p-0.5 text-brand-700 hover:bg-brand-100 focus:outline-none focus:ring-1 focus:ring-brand-600"
            >
              ×
            </button>
          )}
        </span>
      ))}
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        className="min-w-[8ch] flex-1 border-none bg-transparent px-1 py-0.5 text-sm focus:outline-none"
        value={draft}
        placeholder={value.length === 0 ? placeholder : ""}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (draft.trim()) commit(draft);
        }}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData("text");
          if (pasted.includes(",")) {
            e.preventDefault();
            commit(pasted);
          }
        }}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
      />
    </div>
  );
}
