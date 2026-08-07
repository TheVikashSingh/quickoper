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
import {
  defaults,
  encodeParams,
  parseParams,
  type ParamSpec,
  type ParamValues,
} from './params';

export interface UseUrlStateOptions {
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
 */
export function useUrlState<S extends ParamSpec>(
  spec: S,
  options: UseUrlStateOptions = {},
): [ParamValues<S>, (next: ParamValues<S>) => void] {
  const { debounceMs = 300 } = options;

  // The island prerenders without a window, so the first render must be the
  // default scenario. The URL is read in the effect below.
  const [state, setState] = useState<ParamValues<S>>(() => defaults(spec));

  useEffect(() => {
    setState(parseParams(spec, window.location.search));
    // Mount only. Re-reading the URL later would fight the user's typing.
  }, []);

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const update = useCallback(
    (next: ParamValues<S>) => {
      setState(next);

      if (timer.current !== undefined) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const query = encodeParams(next as Record<string, number>);
        window.history.replaceState(
          null,
          '',
          query === '' ? window.location.pathname : `?${query}`,
        );
      }, debounceMs);
    },
    [debounceMs],
  );

  useEffect(
    () => () => {
      if (timer.current !== undefined) clearTimeout(timer.current);
    },
    [],
  );

  return [state, update];
}
