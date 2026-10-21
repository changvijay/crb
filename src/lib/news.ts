import { cacheLife } from "next/cache";
import { backendGet } from "./server/backend";

export type Article = {
  title: string;
  url?: string;
  description?: string;
  source?: string;
  category?: string;
  publishedAt?: string;
};

export type NewsResponse = {
  success: boolean;
  error?: string;
  articles?: Article[];
  categories?: string[];
  meta?: { totalFetched?: number; sources?: string | number; responseTime?: string; fetchedAt?: string };
};

/** Failures are caught inside the cached scope: an error thrown out of "use cache" aborts `next build` when the backend is down. */
async function fetchLatest(): Promise<NewsResponse | null> {
  "use cache";
  cacheLife({ stale: 120, revalidate: 300, expire: 3600 });
  try {
    const data = await backendGet<NewsResponse>("/news/latest", { limit: 100 });
    return data.success ? data : null;
  } catch {
    return null;
  }
}

/** Server-rendered news for SEO. Null on failure; the client then loads it through a Server Action. */
export async function getLatestNews(): Promise<NewsResponse | null> {
  return fetchLatest();
}
