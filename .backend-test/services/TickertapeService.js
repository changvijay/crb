/**
 * Tickertape (tickertape.in) adapter — public, logged-out data only.
 *
 *  • Scorecard: Tickertape's numeric 0–10 scores are members-only, so only its labels (Low/Avg/High + colour +
 *    description), Entry-point flags and Red-flag checks are exposed.
 *  • Statements: ~10 fiscal years of income / balance sheet / cash flow, used to DERIVE figures Screener lacks.
 *
 * Never throws: any failure resolves to { status: "unavailable", reason } so the screener keeps working.
 * Set TICKERTAPE_DISABLED=1 to switch it off (also used to test the fallback path).
 */
const SITE = process.env.TICKERTAPE_BASE || "https://www.tickertape.in";
const SEARCH = process.env.TICKERTAPE_SEARCH || "https://api.tickertape.in/search";
const TTL_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 15000;
const MAX_CACHE = 500;
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const cache = new Map(); // symbol -> { at, value }

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const fmt = (n, d = 2) => (n === null || !Number.isFinite(n) ? null : n.toFixed(d));
const pct = (a, b) => (num(a) !== null && num(b) !== null && b > 0 ? ((a / b - 1) * 100) : null);

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function findStock(symbol) {
  const j = await getJson(`${SEARCH}?text=${encodeURIComponent(symbol)}&types=stock`);
  const list = j?.data?.stocks || [];
  const hit = list.find((s) => String(s.ticker).toUpperCase() === symbol) || list.find((s) => String(s.sid).toUpperCase() === symbol);
  if (!hit || !hit.slug) throw new Error("symbol not found on Tickertape");
  return hit;
}

async function getPageProps(slug) {
  const res = await fetch(`${SITE}${slug}`, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("page structure changed (no __NEXT_DATA__)");
  const pp = JSON.parse(m[1])?.props?.pageProps;
  if (!pp) throw new Error("page structure changed (no pageProps)");
  return pp;
}

const label = (x) => (x ? { tag: x.tag ?? null, colour: x.colour ?? null, description: x.description ?? null } : null);
const flagged = (x) => (x ? { tag: x.tag ?? null, colour: x.colour ?? null, flags: (x.elements || []).filter((e) => e.display && e.description).map((e) => ({ title: e.title, description: e.description, level: e.flag })) } : null);

function normaliseScorecard(list = []) {
  const by = (n) => list.find((x) => x.name === n);
  return {
    performance: label(by("Performance")),
    valuation: label(by("Valuation")),
    growth: label(by("Growth")),
    profitability: label(by("Profitability")),
    entryPoint: flagged(by("Entry point")),
    redFlags: flagged(by("Red flags")),
  };
}

/** Annual rows only (no TTM), oldest → newest. */
const annual = (rows) => (rows || []).filter((r) => /^FY/.test(r.displayPeriod || "")).sort((a, b) => String(a.endDate).localeCompare(String(b.endDate)));

/**
 * Figures keyed exactly like Screener's columns so they can fill its gaps. Each is null when it cannot be computed —
 * never estimated. Banks (deposit-funded; no debt / current-asset split) get no leverage or liquidity ratios.
 */
function derive(pp) {
  const inc = annual(pp["income-normal-annual"]);
  const bal = annual(pp["balancesheet-normal-annual"]);
  const cf = annual(pp["cashflow-normal-annual"]);
  const ratios = pp.securityInfo?.ratios || {};
  const out = {};
  const L = inc[inc.length - 1], P = inc[inc.length - 2], O3 = inc[inc.length - 4];
  const BL = bal[bal.length - 1];
  const CL = cf[cf.length - 1];
  const isBank = !!(BL && num(BL.balTdep) && BL.balTdep > 0);

  if (L) {
    out["Revenue Growth YoY (%)"] = fmt(P ? pct(L.incTrev, P.incTrev) : null);
    out["EPS Growth YoY (%)"] = fmt(P && num(P.incEps) > 0 ? pct(L.incEps, P.incEps) : null);
    out["Net Profit Margin (%)"] = fmt(num(L.incNinc) !== null && num(L.incTrev) > 0 ? (L.incNinc / L.incTrev) * 100 : null);
    if (O3 && num(L.incTrev) > 0 && num(O3.incTrev) > 0) out["Revenue CAGR 3Y (%)"] = fmt((Math.pow(L.incTrev / O3.incTrev, 1 / 3) - 1) * 100);
    if (O3 && num(L.incNinc) > 0 && num(O3.incNinc) > 0) out["Profit CAGR 3Y (%)"] = fmt((Math.pow(L.incNinc / O3.incNinc, 1 / 3) - 1) * 100);
  }
  if (BL && L && !isBank) {
    const equity = num(BL.balTeq), debt = num(BL.balTdeb);
    if (equity > 0 && debt !== null) out["Debt-to-Equity"] = fmt(debt / equity);
    if (num(BL.balTca) !== null && num(BL.balTcl) > 0) out["Current Ratio"] = fmt(BL.balTca / BL.balTcl);
    const ebit = num(L.incEbi), fin = num(L.incPfc);
    if (ebit !== null && fin > 0) out["Interest Coverage"] = fmt(ebit / fin);
    else if (debt !== null && equity > 0 && debt / equity < 0.01) out["Interest Coverage"] = "Debt-free";
    const capital = num(BL.balTota) !== null && num(BL.balTcl) !== null ? BL.balTota - BL.balTcl : null;
    if (ebit !== null && capital > 0) out["ROCE (%)"] = fmt((ebit / capital) * 100);
  }
  if (CL) {
    if (num(CL.cafFcf) !== null) out["Free Cash Flow (Cr)"] = fmt(CL.cafFcf);
    if (L && num(CL.cafCfoa) !== null && num(L.incNinc) > 0) out["OCF / PAT (%)"] = fmt((CL.cafCfoa / L.incNinc) * 100);
  }
  if (num(ratios.roe) !== null) out["ROE (%)"] = fmt(ratios.roe);
  if (num(ratios.pe) !== null && ratios.pe > 0) out["P/E Ratio"] = fmt(ratios.pe);
  const epsG = num(parseFloat(out["EPS Growth YoY (%)"]));
  if (num(ratios.pe) > 0 && epsG > 0) out["PEG Ratio"] = fmt(ratios.pe / epsG);

  for (const k of Object.keys(out)) if (out[k] === null) delete out[k];
  return { derived: out, isBank, fiscalYear: L?.displayPeriod || null };
}

async function fetchTickertape(symbol) {
  const hit = await findStock(symbol);
  const pp = await getPageProps(hit.slug);
  const { derived, isBank, fiscalYear } = derive(pp);
  const scorecard = normaliseScorecard(pp.scorecard);
  return {
    status: "ok",
    sid: hit.sid,
    name: hit.name,
    sector: pp.securityInfo?.info?.sector || hit.sector || null,
    url: `${SITE}${hit.slug}`,
    fiscalYear,
    isBank,
    scorecard,
    ratios: pp.securityInfo?.ratios ? {
      pe: num(pp.securityInfo.ratios.pe), pb: num(pp.securityInfo.ratios.pb), roe: num(pp.securityInfo.ratios.roe),
      divYield: num(pp.securityInfo.ratios.divYield), industryPe: num(pp.securityInfo.ratios.indpe), industryPb: num(pp.securityInfo.ratios.indpb),
    } : null,
    derived,
  };
}

async function getTickertape(rawSymbol) {
  const symbol = String(rawSymbol || "").trim().toUpperCase();
  if (!symbol || process.env.TICKERTAPE_DISABLED === "1") return { status: "unavailable", reason: "Tickertape lookup disabled" };
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  try {
    const value = await fetchTickertape(symbol);
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
    cache.set(symbol, { at: Date.now(), value });
    return value;
  } catch (err) {
    // Failures are not cached for long: retry on the next request after a minute.
    const value = { status: "unavailable", reason: err.message || "Tickertape request failed" };
    cache.set(symbol, { at: Date.now() - TTL_MS + 60 * 1000, value });
    return value;
  }
}

module.exports = { getTickertape, derive };
