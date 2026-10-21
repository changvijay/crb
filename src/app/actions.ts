"use server";

import { headers } from "next/headers";
import type { DataKey, DataParams } from "@/lib/data-keys";
import { backendOrigin } from "@/lib/server/config";
import { cachedGet } from "@/lib/server/microcache";
import { allow, clientKey } from "@/lib/server/ratelimit";
import { isDataKey, resolve } from "@/lib/server/public-data";
import { loadPublic } from "@/lib/server/upstream";

export type DataResult = { ok: true; data: unknown } | { ok: false; status: number; error: string };

/**
 * Browser refresh path for public market data. It is a Server Action, so the request is a POST to the page
 * itself carrying an opaque key: no backend or /api URL is visible in the Network tab.
 */
export async function fetchData(key: DataKey, params?: DataParams): Promise<DataResult> {
  if (!isDataKey(key)) return { ok: false, status: 404, error: "Not found" };
  const r = resolve(key, params && typeof params === "object" ? params : {});
  if (!r) return { ok: false, status: 400, error: "Invalid request" };

  const h = await headers();
  const who = clientKey(h);
  if (!allow(`g:${who}`, 240)) return { ok: false, status: 429, error: "Too many requests" };
  if (key === "screener" && !allow(`a:screener:${who}`, 8)) return { ok: false, status: 429, error: "Too many attempts, please try again later" };

  const target = `${backendOrigin()}/api${r.path}${r.query}`;
  const res = await cachedGet(`${r.path}${r.query}`, r.ttl, () => loadPublic(target, r.timeoutMs));
  return res.ok ? { ok: true, data: res.data } : { ok: false, status: res.status, error: res.error };
}
