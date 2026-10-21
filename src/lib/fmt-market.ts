// Formatters ported from the original US-market and crypto pages (same output).
export const fmtUS = (n: unknown, d = 2): string => (n == null || Number.isNaN(Number(n)) ? "–" : Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));

export const fmtVolShort = (n: unknown): string => {
  if (n == null) return "–";
  const v = Number(n);
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return String(v);
};

export const fmtCapUS = (n: unknown): string => {
  if (n == null || Number.isNaN(Number(n))) return "–";
  const v = Number(n);
  if (v >= 1e12) return "$" + (v / 1e12).toFixed(2) + "T";
  if (v >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
  return "$" + v.toLocaleString("en-US");
};

export const fmtVolUSD = (n: unknown): string => {
  if (n == null || Number.isNaN(Number(n))) return "–";
  const v = Number(n);
  if (v >= 1e12) return "$" + (v / 1e12).toFixed(2) + "T";
  if (v >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
  return "$" + Math.round(v);
};

/** BTC ($95k) down to SHIB ($0.000012). */
export const fmtPrice = (n: unknown): string => {
  if (n == null || Number.isNaN(Number(n))) return "–";
  const v = Number(n);
  if (v >= 1000) return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v >= 1) return "$" + v.toFixed(4);
  if (v >= 0.01) return "$" + v.toFixed(5);
  if (v >= 0.0001) return "$" + v.toFixed(7);
  return "$" + v.toExponential(3);
};

export const fmtCount = (n: unknown): string => {
  if (n == null || Number.isNaN(Number(n))) return "–";
  const v = Number(n);
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return v.toLocaleString();
};

export const sign = (v: number) => (v > 0 ? "+" : "");
export const fmtPct = (v: unknown, d = 2): string => (v == null || Number.isNaN(Number(v)) ? "–" : sign(Number(v)) + Number(v).toFixed(d) + "%");
export const tone = (v: number | null | undefined) => (v == null ? "muted" : v > 0 ? "up" : v < 0 ? "down" : "muted");
