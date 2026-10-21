/** Third-party content (news/blog links) may only link out over http(s); anything else (javascript:, data:) is dropped. */
export function safeHref(u: unknown): string | null {
  if (typeof u !== "string") return null;
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
