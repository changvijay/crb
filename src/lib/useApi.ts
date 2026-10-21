"use client";

import { useEffect, useRef, useState } from "react";
import type { DataKey, DataParams } from "./data-keys";
import { getData } from "./api";

/**
 * Public-data helper. `initial` is the server-rendered copy: it is shown immediately and the first client
 * fetch is skipped unless `refetch` says the copy is partial. `tick` re-runs the request (manual refresh buttons).
 */
export function useApi<T>(key: DataKey, tick = 0, params?: DataParams, initial?: T | null, refetch = false) {
  const sig = `${key}${params ? JSON.stringify(params) : ""}#${tick}`;
  const [state, setState] = useState<{ key: string; data?: T; error?: string } | null>(initial ? { key: sig, data: initial } : null);
  const seeded = useRef(Boolean(initial) && !refetch);

  useEffect(() => {
    if (seeded.current) {
      seeded.current = false; // the server copy covers the first render only; later changes refetch
      return;
    }
    const ctl = new AbortController();
    let live = true;
    getData<T>(key, params, ctl.signal)
      .then((data) => live && setState({ key: sig, data }))
      .catch((e: Error) => live && e.name !== "AbortError" && setState({ key: sig, error: e.message }));
    return () => {
      live = false;
      ctl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sig` already encodes key + params + tick
  }, [sig]);

  const fresh = state?.key === sig ? state : null;
  const last = state; // keep showing previous data while a refresh is in flight
  return { data: (fresh ?? last)?.data, error: fresh?.error, loading: !fresh };
}
