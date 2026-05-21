/**
 * Page-number footer used by the HR list views.
 *
 *   ‹ Prev   1  2 [3] 4  5  …  10   Next ›       Showing 21–25 of 200
 *
 * Behavior:
 *   - Renders nothing when there's a single page (or no data) so empty
 *     states stay clean.
 *   - Window is current ±2 with explicit first / last pages when the
 *     window doesn't already include them; ellipses fill the gaps.
 *   - Disabled `Prev` / `Next` at the ends use real `disabled` + `aria-disabled`
 *     so screen readers don't try to follow them.
 *   - Pure presentation — `page` + `onChange` lifted to the parent so
 *     the parent owns the React Query cache key.
 */

interface PaginationProps {
  page: number; // 1-indexed
  pageSize: number;
  total: number;
  onChange: (next: number) => void;
  /** Singular noun for the "Showing X–Y of Z applicants" line. */
  itemLabel?: string;
}

function buildPageWindow(current: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const window: (number | "…")[] = [];
  const start = Math.max(2, current - 2);
  const end = Math.min(totalPages - 1, current + 2);

  window.push(1);
  if (start > 2) window.push("…");
  for (let i = start; i <= end; i += 1) window.push(i);
  if (end < totalPages - 1) window.push("…");
  window.push(totalPages);
  return window;
}

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
  itemLabel = "items",
}: PaginationProps) {
  if (total <= 0) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const items = buildPageWindow(page, totalPages);

  const baseBtn =
    "inline-flex h-8 min-w-[2rem] items-center justify-center rounded-md px-2 text-xs font-medium ring-1 ring-slate-200 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 pt-3"
      aria-label="Pagination"
    >
      <p className="text-xs text-slate-500">
        Showing <span className="font-medium text-slate-700">{from}</span>–
        <span className="font-medium text-slate-700">{to}</span> of{" "}
        <span className="font-medium text-slate-700">{total}</span> {itemLabel}
      </p>
      <ul className="flex flex-wrap items-center gap-1">
        <li>
          <button
            type="button"
            className={baseBtn}
            onClick={() => onChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            ‹ Prev
          </button>
        </li>
        {items.map((item, idx) =>
          item === "…" ? (
            <li
              key={`gap-${idx}`}
              className="px-1 text-xs text-slate-400"
              aria-hidden="true"
            >
              …
            </li>
          ) : (
            <li key={item}>
              <button
                type="button"
                className={`${baseBtn} ${item === page ? "bg-brand-600 text-white ring-brand-600 hover:bg-brand-700" : ""}`}
                onClick={() => onChange(item)}
                aria-current={item === page ? "page" : undefined}
                aria-label={`Go to page ${item}`}
              >
                {item}
              </button>
            </li>
          ),
        )}
        <li>
          <button
            type="button"
            className={baseBtn}
            onClick={() => onChange(page + 1)}
            disabled={page >= totalPages}
            aria-label="Next page"
          >
            Next ›
          </button>
        </li>
      </ul>
    </nav>
  );
}
