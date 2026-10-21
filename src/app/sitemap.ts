import type { MetadataRoute } from "next";
import { PAGES } from "@/lib/pages";
import { SITE } from "@/lib/seo";

// lastModified comes from lib/pages.ts, where each date is the day the page content really changed.
export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((p) => ({ url: p.path === "/" ? `${SITE}/` : `${SITE}${p.path}`, lastModified: p.lastModified, changeFrequency: p.changeFrequency, priority: p.priority }));
}
