/** Small formatters for the server-written "today's snapshot" paragraphs. Every value must come from page data. */
export const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v.replace(/,/g, "")) : Number(v);
  return v == null || v === "" || Number.isNaN(n) ? null : n;
};

export const inr = (v: unknown, d = 2): string => {
  const n = num(v);
  return n == null ? "n/a" : n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
};

export const usd = (v: unknown): string => {
  const n = num(v);
  if (n == null) return "n/a";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)} trillion`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)} billion`;
  if (n >= 1000) return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toPrecision(3)}`;
};

export const pct = (v: unknown, d = 2): string => {
  const n = num(v);
  return n == null ? "n/a" : `${n > 0 ? "+" : ""}${n.toFixed(d)}%`;
};

/** "21 October 2026" in IST for Indian pages. */
export const dayIST = (iso: unknown): string | null => {
  const d = new Date(String(iso ?? ""));
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
};

export const dayUTC = (iso: unknown): string | null => {
  const d = new Date(String(iso ?? ""));
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
};

/** Join with commas and a final "and". */
export const list = (xs: string[]): string => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
