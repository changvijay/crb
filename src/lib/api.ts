/**
 * Browser-side data access. Every call goes to this site's own /api/* proxy,
 * which enforces the endpoint allowlist server-side. No backend URL exists here.
 */
import { fetchData } from "@/app/actions";
import type { DataKey, DataParams } from "./data-keys";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...init,
    headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON body */
  }
  const body = data as { error?: string; message?: string } | null;
  if (!res.ok) throw new ApiError(body?.error || body?.message || `Request failed (${res.status})`, res.status);
  return data as T;
}

/**
 * Public market-data read from the browser. Goes through a Server Action (a POST to the current page with an
 * opaque key) instead of an /api URL, so no endpoint path shows up in DevTools.
 */
export async function getData<T = unknown>(key: DataKey, params?: DataParams, signal?: AbortSignal): Promise<T> {
  const r = await fetchData(key, params);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError"); // a Server Action cannot be cancelled in flight; drop its result instead
  if (!r.ok) throw new ApiError(r.error, r.status);
  return r.data as T;
}
