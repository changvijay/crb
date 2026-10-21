export const fmtNum = (n: unknown): string => {
  const v = Number(n);
  return n == null || Number.isNaN(v)
    ? "—"
    : v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const fmtVolume = (n: unknown): string => {
  const v = Number(n);
  if (n == null || Number.isNaN(v) || v === 0) return "—";
  if (v >= 1e7) return `${(v / 1e7).toFixed(1)} cr`;
  if (v >= 1e5) return `${(v / 1e5).toFixed(1)}L`;
  return v.toLocaleString("en-IN");
};

/** Short Y-axis form, e.g. 12.3k */
export const fmtCr = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 10000) return `${(n / 1000).toFixed(0)}k`;
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toFixed(0);
};

export const fmtCrFull = (n: unknown): string => {
  const v = Number(n);
  if (n == null || Number.isNaN(v)) return "—";
  return (v >= 0 ? "+" : "") + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const fmtDay = (dateStr: string): string => {
  const d = new Date(`${dateStr}T00:00:00`);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

/** "2026-03" → "Mar '26" */
export const fmtMonth = (m: string): string => {
  const [yr, mo] = m.split("-");
  return `${MONTHS[parseInt(mo, 10) - 1]} '${yr.slice(2)}`;
};

/** e.g. 20 Oct '26 (1:02 pm) */
export const fmtReportDate = (iso: string): string => {
  const d = new Date(iso);
  const month = d.toLocaleString("en-IN", { month: "short" });
  const time = d.toLocaleString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${d.getDate()} ${month} '${String(d.getFullYear()).slice(-2)} (${time})`;
};
