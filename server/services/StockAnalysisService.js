/**
 * StockAnalysis.com adapter — public pages only (data licensed from S&P Global Market Intelligence).
 *
 *  • scores: Piotroski F-Score (0–9) and Altman Z-Score as published by the site (Altman is "n/a" for banks/financials).
 *  • derived: figures keyed like Screener's columns, used to fill gaps Screener leaves.
 *
 * Never throws: failures resolve to { status: "unavailable", reason }. TTL cache; STOCKANALYSIS_DISABLED=1 switches it off.
 */
const SITE = process.env.STOCKANALYSIS_BASE || "https://stockanalysis.com";
const TTL_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 15000;
const MAX_CACHE = 500;
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};
const cache = new Map();

const entities = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
const text = (s) => s.replace(/<[^>]+>/g, " ").replace(/&(?:amp|lt|gt|quot|nbsp|#39);/g, (m) => entities[m]).replace(/\s+/g, " ").trim();

async function getHtml(path) {
  const res = await fetch(`${SITE}${path}`, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.text()).replace(/<!--[\s\S]*?-->/g, "");
}

/** "17.25" "45.57%" "2,832,480" "492.23B" "-" "n/a" → number | null. Big-number suffixes → plain units. */
function toNum(raw) {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim().replace(/,/g, "");
  if (!s || /^(n\/a|-|—|upgrade)$/i.test(s)) return null;
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*(%|[KMBT])?$/i);
  if (!m) return null;
  const mult = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[(m[2] || "").toUpperCase()] || 1;
  return parseFloat(m[1]) * (m[2] === "%" ? 1 : mult);
}
const fmt = (n, d = 2) => (n === null || !Number.isFinite(n) ? null : n.toFixed(d));

/** Statistics page → { "Section | Label": "value" } */
function parseStatistics(html) {
  const out = {};
  let section = "";
  for (const m of html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>|<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    if (m[1] !== undefined) { section = text(m[1]); continue; }
    const cells = [...m[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => text(c[1]));
    if (cells.length >= 2 && cells[0]) out[`${section} | ${cells[0]}`] = cells[1];
  }
  return out;
}

/** Financials page → { header: ["TTM","FY 2026",…], rows: [[label, v1, v2, …], …] } */
function parseFinancials(html) {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => text(c[1]))).filter((r) => r.length > 1);
  const header = rows.find((r) => /^Fiscal Year$/i.test(r[0])) || [];
  return { header, rows };
}

const stat = (stats, section, label) => toNum(stats[`${section} | ${label}`]);

/** Annual FY series for a row whose label starts with `start` (TTM column skipped), newest first. */
function series(fin, start) {
  const idx = fin.header.map((h, i) => (/^FY\b/.test(h) ? i : -1)).filter((i) => i > 0);
  const row = fin.rows.find((r) => r[0] === start || r[0].startsWith(`${start} `));
  return row ? idx.map((i) => toNum(row[i])) : [];
}

function derive(stats, fin) {
  const d = {};
  const put = (k, v, digits = 2) => { const f = fmt(v, digits); if (f !== null) d[k] = f; };

  put("P/E Ratio", stat(stats, "Valuation Ratios", "PE Ratio"));
  put("PEG Ratio", stat(stats, "Valuation Ratios", "PEG Ratio"));
  put("Current Ratio", stat(stats, "Financial Position", "Current Ratio"));
  put("Debt-to-Equity", stat(stats, "Financial Position", "Debt / Equity"));
  put("Interest Coverage", stat(stats, "Financial Position", "Interest Coverage"));
  put("ROE (%)", stat(stats, "Financial Efficiency", "Return on Equity (ROE)"));
  put("ROCE (%)", stat(stats, "Financial Efficiency", "Return on Capital Employed (ROCE)"));
  put("Net Profit Margin (%)", stat(stats, "Margins", "Profit Margin"));
  // Banks/financials (no enterprise value) have deposit- and loan-driven cash flows, so FCF and OCF/PAT are not meaningful.
  const isFinancial = stat(stats, "Total Valuation", "Enterprise Value") === null;
  if (!isFinancial) {
    const fcf = stat(stats, "Cash Flow", "Free Cash Flow"); // INR → ₹ Cr (1 Cr = 10,000,000)
    if (fcf !== null) put("Free Cash Flow (Cr)", fcf / 1e7);
    const ocf = stat(stats, "Cash Flow", "Operating Cash Flow"), ni = stat(stats, "Income Statement", "Net Income");
    if (ocf !== null && ni !== null && ni > 0) put("OCF / PAT (%)", (ocf / ni) * 100);
  }

  // Growth comes from the annual income statement (latest completed fiscal year, not TTM).
  const growth = (label) => { const r = fin.rows.find((x) => x[0] === label); const i = fin.header.findIndex((h, j) => j > 0 && /^FY\b/.test(h)); return r && i > 0 ? toNum(r[i]) : null; };
  put("Revenue Growth YoY (%)", growth("Revenue Growth"));
  put("EPS Growth YoY (%)", growth("EPS Growth"));
  const rev = series(fin, "Revenue"), prof = series(fin, "Net Income");
  const cagr = (s) => (s.length >= 4 && s[0] > 0 && s[3] > 0 ? (Math.pow(s[0] / s[3], 1 / 3) - 1) * 100 : null);
  put("Revenue CAGR 3Y (%)", cagr(rev));
  put("Profit CAGR 3Y (%)", cagr(prof));
  return d;
}

const piotroskiBand = (n) => (n >= 8 ? "Strong" : n >= 6 ? "Good" : n >= 4 ? "Average" : "Weak");
const altmanZone = (z) => (z > 2.99 ? "Safe zone" : z >= 1.81 ? "Grey zone" : "Distress zone");

async function fetchStockAnalysis(symbol) {
  const sym = encodeURIComponent(symbol);
  const [statsHtml, finHtml] = await Promise.all([getHtml(`/quote/nse/${sym}/statistics/`), getHtml(`/quote/nse/${sym}/financials/`).catch(() => "")]);
  const stats = parseStatistics(statsHtml);
  if (!Object.keys(stats).length) throw new Error("page structure changed (no statistics rows)");
  const fin = finHtml ? parseFinancials(finHtml) : { header: [], rows: [] };
  const p = stat(stats, "Scores", "Piotroski F-Score"), z = stat(stats, "Scores", "Altman Z-Score");
  return {
    status: "ok",
    url: `${SITE}/quote/nse/${sym}/statistics/`,
    scores: {
      piotroski: p === null ? null : { value: p, outOf: 9, band: piotroskiBand(p) },
      altmanZ: z === null ? null : { value: z, zone: altmanZone(z) },
    },
    derived: derive(stats, fin),
  };
}

async function getStockAnalysis(rawSymbol) {
  const symbol = String(rawSymbol || "").trim().toUpperCase();
  if (!symbol || process.env.STOCKANALYSIS_DISABLED === "1") return { status: "unavailable", reason: "StockAnalysis lookup disabled" };
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  try {
    const value = await fetchStockAnalysis(symbol);
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
    cache.set(symbol, { at: Date.now(), value });
    return value;
  } catch (err) {
    const value = { status: "unavailable", reason: err.message || "StockAnalysis request failed" };
    cache.set(symbol, { at: Date.now() - TTL_MS + 60 * 1000, value }); // retry after a minute
    return value;
  }
}

module.exports = { getStockAnalysis };
