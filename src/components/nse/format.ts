// Formatters ported from the original NSE page (same output).
export const fmtN = (v: unknown, dec = 2): string => {
  if (v == null) return "—";
  if (v === 0) return "0.00";
  return Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: dec });
};

export const fmtV = (v: unknown): string => {
  const n = Number(v);
  if (!n) return "—";
  if (n >= 1e12) return (n / 1e12).toFixed(1) + " T";
  if (n >= 1e7) return (n / 1e7).toFixed(2) + " Cr";
  if (n >= 1e5) return (n / 1e5).toFixed(2) + " L";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + " K";
  return n.toLocaleString("en-IN");
};

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " ", "&#160;": " " };
/** Decodes the few HTML entities the IPO feed contains; React escapes the result when rendering. */
export const decodeEntities = (s: unknown): string => (s == null ? "" : String(s).replace(/&(amp|lt|gt|quot|nbsp|#39|#160);/g, (m) => ENTITIES[m] ?? m));

export const screenerUrl = (symbol: string) => `https://www.screener.in/company/${encodeURIComponent(symbol)}/`;
