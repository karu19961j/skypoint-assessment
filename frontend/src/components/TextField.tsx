import { forwardRef, type InputHTMLAttributes } from "react";

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  /** Stable id used for label / error association. Must be unique on the page. */
  id: string;
  /** Visible label text rendered above the input. */
  label: string;
  /** Renders `<span aria-hidden>*</span>` after the label and sets
   *  `aria-required="true"` on the input. */
  required?: boolean;
  /** Error message — when present, the field renders with `role="alert"`
   *  + `aria-invalid="true"` + `aria-describedby` pointing at the message. */
  error?: string;
  /** Help text rendered below the input. Linked to the input via
   *  aria-describedby (alongside the error id when both are present). */
  hint?: string;
}

/**
 * Single source of truth for the label-asterisk-input-error pattern that
 * every form in the app repeats (Login, Register, Job form, Apply modal,
 * Profile). Wraps `<input>` with:
 *   - `<label htmlFor>` pointing at the input id,
 *   - red asterisk + sr-only "(required)" when `required`,
 *   - `aria-required="true"` when `required`,
 *   - `aria-invalid="true"` + `role="alert"` error block when `error`,
 *   - `aria-describedby` plumbing for both hint and error ids.
 *
 * The component forwards refs so react-hook-form's `register()` works
 * without ceremony — pass the spread directly.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField(
    { id, label, required, error, hint, ...inputProps },
    ref,
  ) {
    const errorId = error ? `${id}-error` : undefined;
    const hintId = hint ? `${id}-hint` : undefined;
    const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
    return (
      <div>
        <label className="label" htmlFor={id}>
          {label}
          {required ? (
            <>
              {" "}
              <span aria-hidden="true" className="text-rose-600">*</span>
              <span className="sr-only"> (required)</span>
            </>
          ) : null}
        </label>
        <input
          ref={ref}
          id={id}
          className="input"
          aria-required={required ? "true" : undefined}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={describedBy}
          {...inputProps}
        />
        {hint ? (
          <p id={hintId} className="mt-1 text-xs text-slate-500">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} role="alert" className="mt-1 text-xs text-rose-600">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
