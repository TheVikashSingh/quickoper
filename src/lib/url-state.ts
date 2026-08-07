/**
 * Calculator state in the URL (CLAUDE.md rule 12).
 *
 * Every result is bookmarkable, shareable and returnable-to at zero
 * infrastructure cost — and a scenario someone pastes into a forum is the
 * cheapest backlink this project has access to.
 *
 * Parsing lives in lib/params.ts, which is dependency-free for byte-budget
 * reasons documented there. This file is only the Preact binding.
 */

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

export interface UseUrlStateOptions<T> {
  /** Build state from `window.location.search`. Must never throw. */
  readonly decode: (search: string) => T;
  /** Serialise to a query string, without the leading `?`. */
  readonly encode: (value: T) => string;
  /** The scenario shown before the URL is read, and on any parse failure. */
  readonly initial: T;
  /**
   * Milliseconds to wait before writing. A number field fires on every
   * keystroke; without this the History API is hammered and Safari throttles it.
   */
  readonly debounceMs?: number;
}

/**
 * Two-way bind calculator state to the URL.
 *
 * Reads once on mount, so a shared link restores. Writes back debounced via
 * `replaceState`, so the back button still leaves the page rather than stepping
 * through every keystroke.
 *
 * Generic over the state shape rather than tied to a flat record of numbers:
 * a debt list is neither flat nor uniformly numeric, and pushing that into a
 * schema abstraction cost more than it saved.
 */
export function useUrlState<T>({
  decode,
  encode,
  initial,
  debounceMs = 300,
}: UseUrlStateOptions<T>): [T, (next: T) => void] {
  // The island prerenders without a window, so the first render is always the
  // initial scenario. The URL is read in the effect below. This is why a shared
  // link shows defaults for one frame — the HTML is static and cached, so it
  // must be identical for every visitor.
  const [state, setState] = useState<T>(initial);

  useEffect(() => {
    setState(decode(window.location.search));
    // Mount only. Re-reading the URL later would fight the user's typing.
  }, []);

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const update = useCallback(
    (next: T) => {
      setState(next);

      if (timer.current !== undefined) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const query = encode(next);
        window.history.replaceState(
          null,
          '',
          query === '' ? window.location.pathname : `?${query}`,
        );
      }, debounceMs);
    },
    [encode, debounceMs],
  );

  useEffect(
    () => () => {
      if (timer.current !== undefined) clearTimeout(timer.current);
    },
    [],
  );

  return [state, update];
}
