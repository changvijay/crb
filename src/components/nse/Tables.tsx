"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Col, DataTable, Empty, Rank } from "@/components/market/Kit";
import { Spark } from "@/components/ui/Spark";
import { decodeEntities, fmtN, fmtV, screenerUrl } from "./format";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Q = Record<string, any>;

const Sym = ({ s }: { s: string }) => <a href={screenerUrl(s)} target="_blank" rel="noopener noreferrer" className="font-semibold hover:text-[var(--accent)]">{s}</a>;
const Delta = ({ v, sign = true }: { v: number; sign?: boolean }) => <span className={`num font-semibold ${v >= 0 ? "up" : "down"}`}>{sign && v > 0 ? "+" : ""}{fmtN(v)}%</span>;
const Name = ({ t, sub, title }: { t?: string; sub?: string; title?: string }) => (<div className="max-w-[220px]" title={title || t}><div className="truncate">{t}</div>{sub && <div className="muted truncate text-[10.5px]">{sub}</div>}</div>);
const Mini = ({ prices, up }: { prices?: number[]; up: boolean }) => (prices && prices.length > 1 ? <div className="w-[88px]"><Spark values={prices} up={up} height={30} label="intraday" /></div> : <span className="muted">—</span>);

export function Panel({ title, icon, tone, count, children }: { title: string; icon: string; tone: "up" | "down" | "acc"; count: string; children: ReactNode }) {
  const color = tone === "up" ? "var(--up)" : tone === "down" ? "var(--down)" : "var(--accent)";
  return (
    <section className="card !p-0 overflow-hidden" aria-label={title}>
      <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3.5" style={{ borderTop: `3px solid ${color}` }}>
        <h3 className="text-[14px] font-semibold">{icon} {title}</h3><span className="chip">{count}</span>
      </div>
      <div className="p-2">{children}</div>
    </section>
  );
}
const Split = ({ children }: { children: ReactNode }) => <div className="grid gap-4 xl:grid-cols-2">{children}</div>;

/* ── Gainers / losers ── */
export function GainersLosers({ gainers, losers }: { gainers: Q[]; losers: Q[] }) {
  const maxPct = Math.max(...[...gainers, ...losers].map((s) => Math.abs(s.pChange || 0)), 1);
  const cols = (up: boolean): Col<Q>[] => [
    { head: "#", cell: (_, i) => <Rank i={i} /> },
    { head: "Symbol", sort: (s) => s.symbol, cell: (s) => <Sym s={s.symbol} /> },
    { head: "Company", cell: (s) => <Name t={s.companyName} /> },
    { head: "Price ₹", align: "right", sort: (s) => s.lastPrice, cell: (s) => <span className="num">{fmtN(s.lastPrice)}</span> },
    { head: "Chg %", align: "right", sort: (s) => s.pChange, cell: (s) => <Delta v={s.pChange} /> },
    { head: "Volume", align: "right", sort: (s) => s.volume, cell: (s) => <span className="num muted">{fmtV(s.volume)}</span> },
    { head: "Trend", cell: (s) => <div className="h-1.5 rounded-full" style={{ width: Math.min((Math.abs(s.pChange || 0) / maxPct) * 44, 44), background: up ? "var(--up)" : "var(--down)" }} /> },
  ];
  return (
    <Split>
      <Panel title="Gainers" icon="📈" tone="up" count={String(gainers.length)}><DataTable label="Gainers" rows={gainers} cols={cols(true)} empty="No data" /></Panel>
      <Panel title="Losers" icon="📉" tone="down" count={String(losers.length)}><DataTable label="Losers" rows={losers} cols={cols(false)} empty="No data" /></Panel>
    </Split>
  );
}

/* ── 52-week ── */
export function Week52({ high, low }: { high: Q[]; low: Q[] }) {
  const cols = (isHigh: boolean): Col<Q>[] => [
    { head: "#", cell: (_, i) => <Rank i={i} /> },
    { head: "Symbol", sort: (s) => s.symbol, cell: (s) => <Sym s={s.symbol} /> },
    { head: "Company", cell: (s) => { const prev = isHigh ? s.prevHigh52 : s.prevLow52; return <Name t={s.companyName} sub={s.sector} title={`${s.companyName}${s.sector ? ` | ${s.sector}` : ""}${prev ? ` | Prev 52W: ₹${fmtN(prev)}` : ""}`} />; } },
    { head: "Intraday", cell: (s) => <Mini prices={s.intradayChart} up={s.pChange >= 0} /> },
    { head: "Price ₹", align: "right", sort: (s) => s.lastPrice, cell: (s) => <span className="num">{fmtN(s.lastPrice)}</span> },
    { head: "Chg %", align: "right", sort: (s) => s.pChange, cell: (s) => <Delta v={s.pChange} /> },
    { head: isHigh ? "52W High" : "52W Low", align: "right", sort: (s) => (isHigh ? s.high52 : s.low52), cell: (s) => <span className={`num ${isHigh ? "up" : "down"}`}>{fmtN(isHigh ? s.high52 : s.low52)}</span> },
    { head: "MCap (Cr)", align: "right", sort: (s) => s.mcap, cell: (s) => <span className="num muted">{s.mcap > 0 ? `₹${fmtN(s.mcap)}Cr` : "—"}</span> },
    { head: "Volume", align: "right", sort: (s) => s.volume, cell: (s) => <span className="num muted">{fmtV(s.volume)}</span> },
  ];
  return (
    <Split>
      <Panel title="52-Week High" icon="📈" tone="up" count={String(high.length)}><DataTable label="52-week highs" rows={high} cols={cols(true)} empty="No data" /></Panel>
      <Panel title="52-Week Low" icon="📉" tone="down" count={String(low.length)}><DataTable label="52-week lows" rows={low} cols={cols(false)} empty="No data" /></Panel>
    </Split>
  );
}

/* ── Penny stocks ── */
export function Penny({ stocks }: { stocks: Q[] }) {
  const cols: Col<Q>[] = [
    { head: "#", cell: (_, i) => <Rank i={i} /> },
    { head: "Symbol", sort: (s) => s.symbol, cell: (s) => <Sym s={s.symbol} /> },
    { head: "Company", cell: (s) => <Name t={s.companyName} /> },
    { head: "Intraday", cell: (s) => <Mini prices={s.intradayChart} up={s.pChange >= 0} /> },
    { head: "Price ₹", align: "right", sort: (s) => s.lastPrice, cell: (s) => <span className="num">{fmtN(s.lastPrice)}</span> },
    { head: "Chg %", align: "right", sort: (s) => s.pChange, cell: (s) => <Delta v={s.pChange} /> },
    { head: "High / Low", align: "right", cell: (s) => <span className="num muted">{fmtN(s.todayHigh)} / {fmtN(s.todayLow)}</span> },
    { head: "MCap (Cr)", align: "right", sort: (s) => s.mcap, cell: (s) => <span className="num muted">₹{fmtN(s.mcap)}Cr</span> },
    { head: "Volume", align: "right", sort: (s) => s.volume, cell: (s) => <span className="num muted">{fmtV(s.volume)}</span> },
  ];
  return <DataTable label="Penny stocks" rows={stocks} cols={cols} pager defaultSize={25} empty="No penny stocks data" />;
}

/* ── Price band hitters (filters + sort ported unchanged) ── */
const BAND_SORTS: [string, string][] = [["percent-desc", "% High to Low"], ["percent-asc", "% Low to High"], ["ltp-desc", "LTP High to Low"], ["ltp-asc", "LTP Low to High"], ["volume-desc", "Volume High to Low"], ["volume-asc", "Volume Low to High"], ["band-desc", "Band High to Low"], ["band-asc", "Band Low to High"], ["symbol-asc", "Symbol A-Z"], ["symbol-desc", "Symbol Z-A"]];
function sortBand(stocks: Q[], key: string): Q[] {
  const items = [...stocks];
  const n = (v: unknown) => Number(v) || 0;
  switch (key) {
    case "percent-asc": return items.sort((a, b) => n(a.percentChange) - n(b.percentChange));
    case "ltp-desc": return items.sort((a, b) => n(b.ltp) - n(a.ltp));
    case "ltp-asc": return items.sort((a, b) => n(a.ltp) - n(b.ltp));
    case "volume-desc": return items.sort((a, b) => n(b.totalTradedVol) - n(a.totalTradedVol));
    case "volume-asc": return items.sort((a, b) => n(a.totalTradedVol) - n(b.totalTradedVol));
    case "band-desc": return items.sort((a, b) => n(b.priceBand) - n(a.priceBand));
    case "band-asc": return items.sort((a, b) => n(a.priceBand) - n(b.priceBand));
    case "symbol-asc": return items.sort((a, b) => String(a.symbol || "").localeCompare(String(b.symbol || "")));
    case "symbol-desc": return items.sort((a, b) => String(b.symbol || "").localeCompare(String(a.symbol || "")));
    default: return items.sort((a, b) => n(b.percentChange) - n(a.percentChange));
  }
}

export function PriceBand({ stocks }: { stocks: Q[] }) {
  const [query, setQuery] = useState("");
  const [series, setSeries] = useState("all");
  const [segment, setSegment] = useState("all");
  const [sort, setSort] = useState("percent-desc");

  const seriesOpts = useMemo(() => [...new Set(stocks.map((s) => s?.series?.meaning || "Other"))].sort((a, b) => a.localeCompare(b)), [stocks]);
  const segOpts = useMemo(() => [...new Set(stocks.flatMap((s) => (Array.isArray(s?.segments) ? s.segments : [])).filter(Boolean))].sort((a: string, b: string) => a.localeCompare(b)), [stocks]);
  const { upper, lower, shown } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = stocks.filter((s) => {
      const meaning = s?.series?.meaning || "Other";
      const segs: string[] = Array.isArray(s?.segments) ? s.segments : [];
      const qm = !q || [s?.symbol, meaning, ...segs, s?.series?.code].some((v) => String(v || "").toLowerCase().includes(q));
      return qm && (series === "all" || meaning === series) && (segment === "all" || segs.includes(segment));
    });
    const sorted = sortBand(filtered, sort);
    const up: Q[] = [], lo: Q[] = [];
    sorted.forEach((s) => { const c: string[] = Array.isArray(s?.categories) ? s.categories : []; if (c.includes("upper")) up.push(s); if (c.includes("lower")) lo.push(s); });
    // Default view keeps the original ordering (upper: biggest gain first, lower: biggest fall first).
    // The original re-sorted by % after the chosen sort, which made the selector a no-op; any other choice is now honoured.
    if (sort === "percent-desc") {
      up.sort((a, b) => (b.percentChange || 0) - (a.percentChange || 0));
      lo.sort((a, b) => (a.percentChange || 0) - (b.percentChange || 0));
    }
    return { upper: up, lower: lo, shown: filtered.length };
  }, [stocks, query, series, segment, sort]);

  const cols = (isUpper: boolean): Col<Q>[] => [
    { head: "#", cell: (_, i) => <Rank i={i} /> },
    { head: "Symbol", sort: (s) => s.symbol, cell: (s) => <Sym s={s.symbol} /> },
    { head: "Series", cell: (s) => { const segs = Array.isArray(s?.segments) ? s.segments.filter(Boolean) : []; return <div><div>{s?.series?.meaning || "Other"}</div><div className="muted text-[10.5px]">{[s?.series?.code || "—", ...segs].join(" · ")}</div>{Array.isArray(s?.categories) && s.categories.includes("both") && <div className="muted text-[10.5px]">Also in Both</div>}</div>; } },
    { head: "LTP ₹", align: "right", sort: (s) => s.ltp, cell: (s) => <span className="num">{fmtN(s.ltp)}</span> },
    { head: "Chg %", align: "right", sort: (s) => s.percentChange, cell: (s) => <span className={`num font-semibold ${isUpper ? "up" : "down"}`}>{(s.percentChange || 0) > 0 ? "+" : ""}{fmtN(s.percentChange || 0)}%</span> },
    { head: "Band", align: "right", sort: (s) => s.priceBand, cell: (s) => <span className="num muted">{s?.priceBand != null ? `${fmtN(s.priceBand)}%` : "—"}</span> },
    { head: "Volume", align: "right", sort: (s) => s.totalTradedVol, cell: (s) => <span className="num muted">{fmtV(s.totalTradedVol)}</span> },
  ];

  const sel = "rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]";
  return (
    <div className="space-y-4">
      <div className="card !p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold">Price band filters</span><span className="chip">{shown} shown / {stocks.length} total</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm focus-within:border-[var(--accent)]">🔍<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Symbol / series / segment" aria-label="Search price band stocks" className="w-44 bg-transparent outline-none" /></label>
            <select value={series} onChange={(e) => setSeries(e.target.value)} aria-label="Filter by series meaning" className={sel}><option value="all">All Series</option>{seriesOpts.map((v) => <option key={v} value={v}>{v}</option>)}</select>
            <select value={segment} onChange={(e) => setSegment(e.target.value)} aria-label="Filter by segment" className={sel}><option value="all">All Segments</option>{segOpts.map((v: string) => <option key={v} value={v}>{v}</option>)}</select>
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort price band stocks" className={sel}>{BAND_SORTS.map(([v, l]) => <option key={v} value={v}>Sort: {l}</option>)}</select>
          </div>
        </div>
      </div>
      <Split>
        <Panel title="Upper Price Band" icon="⚡" tone="up" count={`${upper.length} stocks`}><DataTable label="Upper price band" rows={upper} cols={cols(true)} pager defaultSize={25} empty="No stocks in upper price band" /></Panel>
        <Panel title="Lower Price Band" icon="🔻" tone="down" count={`${lower.length} stocks`}><DataTable label="Lower price band" rows={lower} cols={cols(false)} pager defaultSize={25} empty="No stocks in lower price band" /></Panel>
      </Split>
    </div>
  );
}

/* ── Most active ── */
export function MostActive({ volumeGainers, recovery }: { volumeGainers: Q[]; recovery: Q[] }) {
  const cols = (type: "volume" | "recovery"): Col<Q>[] => [
    { head: "#", cell: (_, i) => <Rank i={i} /> },
    { head: "Symbol", sort: (s) => s.symbol, cell: (s) => <Sym s={s.symbol || ""} /> },
    { head: "Company", cell: (s) => <Name t={s.lname || s.compname || ""} /> },
    { head: "Price ₹", align: "right", sort: (s) => parseFloat(s.ltp || 0), cell: (s) => <span className="num">{fmtN(parseFloat(s.ltp || 0))}</span> },
    { head: "Chg %", align: "right", sort: (s) => parseFloat(s.per_change || 0), cell: (s) => <Delta v={parseFloat(s.per_change || 0)} /> },
    { head: type === "volume" ? "Volume" : "Rise %", align: "right", sort: (s) => (type === "volume" ? parseInt(s.volume || 0) : parseFloat(s.rise_frm_intralow || 0)), cell: (s) => <span className="num muted">{type === "recovery" ? fmtN(parseFloat(s.rise_frm_intralow || 0)) + "%" : fmtV(parseInt(s.volume || 0))}</span> },
  ];
  return (
    <Split>
      <Panel title="High Volume Gainers" icon="📊" tone="acc" count={`${volumeGainers.length} stocks`}><DataTable label="High volume gainers" rows={volumeGainers} cols={cols("volume")} empty="No data" /></Panel>
      <Panel title="Recovery from Day Low" icon="🔄" tone="acc" count={`${recovery.length} stocks`}><DataTable label="Recovery from day low" rows={recovery} cols={cols("recovery")} empty="No data" /></Panel>
    </Split>
  );
}

/* ── Indices (Research360) ── */
export function IndicesTable({ indices, exchange, onExchange, loading }: { indices: Q[]; exchange: "NSE" | "BSE"; onExchange: (e: "NSE" | "BSE") => void; loading: boolean }) {
  const [q, setQ] = useState("");
  const rows = useMemo(() => (q.trim() ? indices.filter((i) => JSON.stringify([i.name, i.ltp, i.price_change_per]).toLowerCase().includes(q.trim().toLowerCase())) : indices), [indices, q]);
  const pct = (v: number) => <span className={`num font-semibold ${v >= 0 ? "up" : "down"}`}>{v >= 0 ? "+" : ""}{fmtN(v)}%</span>;
  const cols: Col<Q>[] = [
    { head: "#", cell: (_, i) => <Rank i={i} /> },
    { head: "Index", sort: (i) => i.name, cell: (i) => <span className="min-w-[160px] font-semibold">{i.name}</span> },
    { head: "Intraday", cell: (i) => <Mini prices={i.intradayChart} up={i.price_change_per >= 0} /> },
    { head: "Price", align: "right", sort: (i) => i.ltp, cell: (i) => <span className="num">{fmtN(i.ltp)}</span> },
    { head: "Net change", align: "right", sort: (i) => i.price_change, cell: (i) => <span className={`num ${i.price_change_per >= 0 ? "up" : "down"}`}>{i.price_change_per >= 0 ? "+" : ""}{fmtN(i.price_change)}</span> },
    { head: "1D%", align: "right", sort: (i) => i.price_change_per, cell: (i) => pct(i.price_change_per) },
    { head: "1D High-Low", align: "right", cell: (i) => <span className="num muted">{fmtN(i.day_high)} - {fmtN(i.day_low)}</span> },
    { head: "52W High-Low", align: "right", cell: (i) => <span className="num muted">{fmtN(i.fiftytwo_wk_high)} - {fmtN(i.fiftytwo_wk_low)}</span> },
    { head: "3M%", align: "right", sort: (i) => i.three_month_change_per || 0, cell: (i) => pct(i.three_month_change_per || 0) },
  ];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="chip">{indices.length} indices</span>
        <div className="seg" role="group" aria-label="Exchange">{(["NSE", "BSE"] as const).map((e) => <button key={e} aria-pressed={exchange === e} onClick={() => onExchange(e)}>{e}</button>)}</div>
        <label className="ml-auto flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm focus-within:border-[var(--accent)]">🔍<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" aria-label="Search indices" className="w-40 bg-transparent outline-none" /></label>
      </div>
      {loading ? <div className="skeleton h-64" aria-hidden /> : <DataTable label="All indices" rows={rows} cols={cols} empty="No index data" />}
    </div>
  );
}

/* ── IPO / GMP ── */
const STATUS: Record<string, string> = { Open: "chip-up", Upcoming: "chip-gold", Listed: "chip-violet", Closed: "" };
export function Ipo({ list, total }: { list: Q[]; total: number }) {
  const cols: Col<Q>[] = [
    { head: "#", cell: (_, i) => <Rank i={i} /> },
    {
      head: "Name",
      cell: (i) => (
        <span className="font-semibold">
          {typeof i.url === "string" && i.url.startsWith("/") ? <a href={`https://www.investorgain.com${i.url}`} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--accent)]">{i.name}</a> : i.name}
          {i.category && i.category !== "Main" && <span className="chip chip-warn ml-2 !text-[10px]">{i.category}</span>}
        </span>
      ),
    },
    { head: "Status", align: "right", cell: (i) => <span className={`chip ${STATUS[i.status] ?? ""}`}>{i.status}</span> },
    { head: "Price", align: "right", cell: (i) => <span className="num muted">₹{i.price}</span> },
    { head: "Size", align: "right", cell: (i) => <span className="num muted">{i.ipoSize}</span> },
    { head: "Lot", align: "right", cell: (i) => <span className="num muted">{i.lot}</span> },
    { head: "P/E", align: "right", cell: (i) => <span className="num muted">{i.pe}</span> },
    { head: "Open", align: "right", cell: (i) => <span className="num muted">{decodeEntities(i.open)}</span> },
    { head: "Close", align: "right", cell: (i) => <span className="num muted">{decodeEntities(i.close)}</span> },
    { head: "Listing", align: "right", cell: (i) => <span className="num muted">{decodeEntities(i.listing)}</span> },
    { head: "GMP ₹", align: "right", cell: (i) => (i.gmp == null ? <span className="muted">—</span> : <span className={`num font-semibold ${i.gmp > 0 ? "up" : i.gmp < 0 ? "down" : ""}`}>{i.gmp > 0 ? "+" : ""}₹{i.gmp}</span>) },
    { head: "GMP %", align: "right", cell: (i) => (i.gmp == null || i.gmpPercent == null ? <span className="muted">—</span> : <span className={`num font-semibold ${i.gmpPercent >= 0 ? "up" : "down"}`}>{i.gmpPercent >= 0 ? "+" : ""}{i.gmpPercent}%</span>) },
    { head: "Est. listing", align: "right", cell: (i) => <span className="num muted">{i.gmp == null ? "—" : i.estimatedListing ? `₹${fmtN(i.estimatedListing)}` : "—"}</span> },
  ];
  if (!list.length) return <Empty>No IPO data available for this period</Empty>;
  return (
    <div>
      <p className="muted mb-3 text-xs">{total} IPOs · Source: InvestorGain</p>
      <DataTable label="IPO and grey market premium" rows={list} cols={cols} pager defaultSize={25} />
    </div>
  );
}
