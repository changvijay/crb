"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** Current year without making the (statically prerendered) footer time-dependent. */
export function Year() {
  const year = useSyncExternalStore(noop, () => new Date().getFullYear(), () => 2026);
  return <span suppressHydrationWarning>{year}</span>;
}
