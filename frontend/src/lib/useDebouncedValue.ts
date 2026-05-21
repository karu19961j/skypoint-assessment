import { useEffect, useState } from "react";

/**
 * Returns a delayed copy of `value` that only updates after `delay`ms of
 * no further changes. Used to keep controlled inputs snappy while
 * letting the React Query layer (queryKey-driven fetches) react at a
 * human-typing cadence rather than per-keystroke.
 *
 * For deeply-nested objects, the equality check is reference-only —
 * pass the result of a `useMemo` if you want stable references across
 * unrelated re-renders. For our filter forms a new object per change is
 * expected, so the timer effect handles the rest.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
