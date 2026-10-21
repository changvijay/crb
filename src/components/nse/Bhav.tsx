"use client";

import { useMemo, useState } from "react";
import { fmtN, fmtV, screenerUrl } from "./format";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Stock = Record<string, any>;
type Row = {
  symbol: string; close?: number; previousClose?: number; pctChange: number | null; vwap?: number; volume?: number; deliveryPct?: number;
  rsi?: number; sma?: number; ema?: number; atr?: number; macdHistogram?: number; macdLine?: number; bbUpper?: number; bbLower?: number;
  momentum?: number; volumeBreakout?: boolean; delivBreakout?: boolean; bbPosition: number | null; _macdCls: string; _sigLbl: string;
};

/* ── Signal interpretation (ported unchanged) ── */
const macdSignal = (r: Row) => {
  const hist = r.macdHistogram, line = r.macdLine;
  if (hist == null) return { label: "—", cls: "neu" };
  if (hist > 0 && (line ?? 0) > 0) return { label: "Strong Bullish", cls: "bull-strong" };
  if (hist > 0) return { label: "Bullish", cls: "bull" };
  if (hist < 0 && (line ?? 0) < 0) return { label: "Strong Bearish", cls: "bear-strong" };
  if (hist < 0) return { label: "Bearish", cls: "bear" };
  return { label: "Neutral", cls: "neu" };
};
const bbSignal = (r: Row) => {
  const up = r.bbUpper, lo = r.bbLower, c = r.close;
  if (up == null || lo == null || c == null || up === lo) return { label: "—", cls: "neu" };
  const pos = (c - lo) / (up - lo);
  if (pos > 1.02) return { label: "Band Breakout", cls: "bb-break" };
  if (pos > 0.92) return { label: "Extreme Upper", cls: "bb-break" };
  if (pos > 0.8) return { label: "Upper Breakout", cls: "bb-upper" };
  if (pos > 0.65) return { label: "Near Upper Band", cls: "bb-upper" };
  if (pos > 0.55) return { label: "Mid-Upper Band", cls: "bb-mid" };
  if (pos > 0.45) return { label: "Mid Band", cls: "bb-mid" };
  if (pos > 0.35) return { label: "Lower Band", cls: "bb-lower" };
  return { label: "Lower Expansion", cls: "bb-lower" };
};
const overallSignal = (r: Row) => {
  const { rsi, macdHistogram: hist, macdLine: line, volumeBreakout: vb, delivBreakout: db } = r;
  if (rsi != null && rsi > 80) return { label: "FOMO Zone 🚀", cls: "sig-fomo" };
  if (rsi != null && rsi > 75 && hist != null && hist > 0) return { label: "Momentum Rally", cls: "sig-strong" };
  if (rsi != null && rsi > 70 && vb) return { label: "Volume Breakout", cls: "sig-vb" };
  if (rsi != null && rsi > 70) return { label: "Overbought", cls: "sig-ob" };
  if (db && rsi != null && rsi > 55) return { label: "Smart Money", cls: "sig-smart" };
  if (vb && hist != null && hist > 0) return { label: "Volume Breakout", cls: "sig-vb" };
  if (hist != null && hist > 0 && (line ?? 0) > 0 && rsi != null && rsi > 62) return { label: "Breakout Watch", cls: "sig-bull" };
  if (hist != null && hist > 0 && rsi != null && rsi > 60) return { label: "Bullish Trend", cls: "sig-bull" };
  if (hist != null && hist > 0 && rsi != null && rsi > 45) return { label: "Accumulation", cls: "sig-accum" };
  if (rsi != null && rsi < 30 && hist != null && hist < 0) return { label: "Oversold", cls: "sig-os" };
  if (hist != null && hist < 0 && line != null && line < 0) return { label: "Weak", cls: "sig-weak" };
  if (hist != null && hist < 0) return { label: "Weak Momentum", cls: "sig-weak" };
  return { label: "Neutral", cls: "sig-neu" };
};

const TONE: Record<string, string> = {
  "bull-strong": "chip-up font-bold", bull: "chip-up", "bear-strong": "chip-down font-bold", bear: "chip-down", neu: "",
  "bb-break": "chip-violet", "bb-upper": "chip-up", "bb-mid": "", "bb-lower": "chip-down",
  "sig-fomo": "chip-violet", "sig-strong": "chip-up font-bold", "sig-vb": "chip-gold", "sig-ob": "chip-warn", "sig-smart": "chip-gold",
  "sig-bull": "chip-up", "sig-accum": "chip-gold", "sig-os": "chip-warn", "sig-weak": "chip-down", "sig-neu": "",
};

const toRow = (s: Stock): Row => {
  const ind = s.indicators || {};
  const bb = ind.bollingerBands;
  const row: Row = {
    symbol: s.symbol, close: s.close, previousClose: s.previousClose,
    pctChange: s.previousClose ? +(((s.close - s.previousClose) / s.previousClose) * 100).toFixed(2) : null,
    vwap: s.vwap, volume: s.volume, deliveryPct: s.deliveryPct,
    rsi: ind.rsi, sma: ind.sma, ema: ind.ema, atr: ind.atr,
    macdHistogram: ind.macd?.histogram, macdLine: ind.macd?.line,
    bbUpper: bb?.upper, bbLower: bb?.lower, momentum: ind.momentum,
    volumeBreakout: ind.volumeBreakout, delivBreakout: ind.deliveryBreakout,
    bbPosition: bb?.upper != null && bb?.lower != null && bb.upper !== bb.lower ? (s.close - bb.lower) / (bb.upper - bb.lower) : null,
    _macdCls: "", _sigLbl: "",
  };
  row._macdCls = macdSignal(row).cls;
  row._sigLbl = overallSignal(row).label;
  return row;
};

const SORTS: [string, string][] = [["symbol", "Symbol"], ["volume", "Volume"], ["pctChange", "% Change"], ["close", "Close"], ["rsi", "RSI"], ["sma", "SMA20"], ["ema", "EMA20"], ["momentum", "Momentum"], ["macdHistogram", "MACD"], ["bbPosition", "BB Position"], ["deliveryPct", "Delivery %"], ["atr", "ATR"], ["vwap", "VWAP"]];
const COLS: { label: string; key: string | null; right?: boolean }[] = [
  { label: "#", key: null }, { label: "Symbol", key: "symbol" }, { label: "Close", key: "close", right: true }, { label: "Chg %", key: "pctChange", right: true },
  { label: "Volume", key: "volume", right: true }, { label: "Delivery %", key: "deliveryPct", right: true }, { label: "RSI", key: "rsi", right: true },
  { label: "SMA20", key: "sma", right: true }, { label: "EMA20", key: "ema", right: true }, { label: "MACD", key: "macdHistogram" }, { label: "BB Signal", key: "bbPosition" },
  { label: "Momentum", key: "momentum", right: true }, { label: "VWAP", key: "vwap", right: true }, { label: "ATR", key: "atr", right: true }, { label: "Signal", key: null },
];

const FILTERS: { id: keyof Filters; options: [string, string][] }[] = [
  { id: "rsi", options: [["", "RSI: All"], ["fomo", "RSI > 80 (FOMO)"], ["overbought", "RSI 70–80 (Overbought)"], ["ob70", "RSI > 70"], ["momentum", "RSI 60–70 (Momentum)"], ["bullish", "RSI 50–60 (Bullish)"], ["neutralzone", "RSI 40–50 (Neutral)"], ["weak", "RSI 30–40 (Weak)"], ["oversold", "RSI < 30 (Oversold)"]] },
  { id: "breakout", options: [["", "Breakout: All"], ["volume", "Volume Breakout"], ["delivery", "Delivery Breakout"], ["both", "Both Breakouts"]] },
  { id: "macd", options: [["", "MACD: All"], ["bull-strong", "Strong Bullish"], ["bull", "Bullish"], ["bear-strong", "Strong Bearish"], ["bear", "Bearish"], ["neu", "Neutral"]] },
  { id: "bb", options: [["", "BB Zone: All"], ["breakout", "Breakout (> Upper Band)"], ["upper", "Upper Zone (top 35%)"], ["mid", "Mid Zone (35–65%)"], ["lower", "Lower Zone (bottom 35%)"]] },
  { id: "signal", options: [["", "Signal: All"], ...["FOMO Zone 🚀", "Momentum Rally", "Volume Breakout", "Smart Money", "Breakout Watch", "Bullish Trend", "Accumulation", "Overbought", "Oversold", "Weak", "Weak Momentum", "Neutral"].map((s) => [s, s.replace(" 🚀", "")] as [string, string])] },
  { id: "change", options: [["", "% Change: All"], ["strong-gain", "Strong Gainers (> +3%)"], ["gain", "Gainers (> 0%)"], ["loss", "Losers (< 0%)"], ["strong-loss", "Strong Losers (< -3%)"], ["flat", "Flat (±1%)"]] },
  { id: "deliv", options: [["", "Delivery %: All"], ["high", "High (> 60%)"], ["mid", "Medium (30–60%)"], ["low", "Low (< 30%)"]] },
];
type Filters = { rsi: string; breakout: string; macd: string; bb: string; signal: string; change: string; deliv: string };
const EMPTY: Filters = { rsi: "", breakout: "", macd: "", bb: "", signal: "", change: "", deliv: "" };

function applyFilters(all: Row[], query: string, f: Filters, sortKey: string, sortDir: "asc" | "desc"): Row[] {
  let rows = all;
  const q = query.trim().toLowerCase();
  if (q) rows = rows.filter((r) => r.symbol.toLowerCase().includes(q) || r._sigLbl.toLowerCase().includes(q));
  if (f.rsi) rows = rows.filter((r) => {
    const v = r.rsi;
    if (v == null) return false;
    switch (f.rsi) {
      case "fomo": return v > 80; case "overbought": return v > 70 && v <= 80; case "ob70": return v > 70; case "momentum": return v > 60 && v <= 70;
      case "bullish": return v > 50 && v <= 60; case "neutralzone": return v > 40 && v <= 50; case "weak": return v > 30 && v <= 40; case "oversold": return v < 30; default: return true;
    }
  });
  if (f.breakout) rows = rows.filter((r) => (f.breakout === "volume" ? r.volumeBreakout : f.breakout === "delivery" ? r.delivBreakout : f.breakout === "both" ? r.volumeBreakout && r.delivBreakout : true));
  if (f.macd) rows = rows.filter((r) => r._macdCls === f.macd);
  if (f.bb) rows = rows.filter((r) => {
    const p = r.bbPosition;
    if (p == null) return false;
    return f.bb === "breakout" ? p > 1 : f.bb === "upper" ? p > 0.65 && p <= 1 : f.bb === "mid" ? p >= 0.35 && p <= 0.65 : f.bb === "lower" ? p < 0.35 : true;
  });
  if (f.signal) rows = rows.filter((r) => r._sigLbl === f.signal);
  if (f.change) rows = rows.filter((r) => {
    const p = r.pctChange;
    if (p == null) return false;
    return f.change === "strong-gain" ? p > 3 : f.change === "gain" ? p > 0 : f.change === "loss" ? p < 0 : f.change === "strong-loss" ? p < -3 : f.change === "flat" ? p >= -1 && p <= 1 : true;
  });
  if (f.deliv) rows = rows.filter((r) => {
    const d = r.deliveryPct;
    if (d == null) return false;
    return f.deliv === "high" ? d > 60 : f.deliv === "mid" ? d >= 30 && d <= 60 : f.deliv === "low" ? d < 30 : true;
  });

  // Sort: chosen key, then volume desc as tiebreaker (skipped when sorting by volume).
  return [...rows].sort((a, b) => {
    const av = (a as any)[sortKey], bv = (b as any)[sortKey];
    let primary: number;
    if (av == null && bv == null) primary = 0;
    else if (av == null) primary = 1;
    else if (bv == null) primary = -1;
    else if (sortKey === "symbol") primary = sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    else primary = sortDir === "asc" ? Number(av) - Number(bv) : Number(bv) - Number(av);
    if (primary !== 0 || sortKey === "volume") return primary;
    return Number(b.volume || 0) - Number(a.volume || 0);
  });
}

const dash = <span className="muted">—</span>;
const fx = (v: unknown, dp = 2) => (v != null ? fmtN(v, dp) : dash);

export function Bhav({ stocks, latestDate, total }: { stocks: Stock[]; latestDate?: string; total?: number }) {
  const all = useMemo(() => stocks.map(toRow), [stocks]);
  const [query, setQuery] = useState("");
  const [f, setF] = useState<Filters>(EMPTY);
  const [sortKey, setSortKey] = useState("symbol");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const [legend, setLegend] = useState(false);

  const rows = useMemo(() => applyFilters(all, query, f, sortKey, sortDir), [all, query, f, sortKey, sortDir]);
  const totalPages = Math.ceil(rows.length / pageSize);
  const cur = Math.min(page, Math.max(0, totalPages - 1));
  const start = cur * pageSize;
  const slice = rows.slice(start, start + pageSize);
  const vbCount = rows.filter((r) => r.volumeBreakout).length;
  const obCount = rows.filter((r) => r.rsi != null && r.rsi > 70).length;

  const reset = () => { setQuery(""); setF(EMPTY); setSortKey("symbol"); setSortDir("desc"); setPage(0); };
  const setSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
    setPage(0);
  };
  const upd = <K extends keyof Filters>(k: K, v: string) => { setF((x) => ({ ...x, [k]: v })); setPage(0); };

  let pageNums: (number | "…")[] = [];
  if (totalPages <= 9) pageNums = Array.from({ length: totalPages }, (_, i) => i);
  else {
    const near = [...new Set([0, 1, cur - 1, cur, cur + 1, totalPages - 2, totalPages - 1].filter((p) => p >= 0 && p < totalPages))].sort((a, b) => a - b);
    near.forEach((p, i) => { if (i > 0 && p - near[i - 1] > 1) pageNums.push("…"); pageNums.push(p); });
  }

  const sel = "rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]";
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="chip">{total ?? all.length} stocks</span>
        {latestDate && <span className="chip">Date: {latestDate}</span>}
        {vbCount > 0 && <span className="chip chip-up">VB: {vbCount}</span>}
        {obCount > 0 && <span className="chip chip-down">OB: {obCount}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} placeholder="Search symbol…" aria-label="Search symbol" className={`${sel} min-w-[180px] flex-1 md:max-w-[240px]`} />
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="btn btn-ghost !py-2">⚙ Filters {open ? "▴" : "▾"}</button>
        <select value={sortKey} onChange={(e) => { setSortKey(e.target.value); setPage(0); }} aria-label="Sort by" className={sel}>{SORTS.map(([v, l]) => <option key={v} value={v}>Sort: {l}</option>)}</select>
        <select value={sortDir} onChange={(e) => { setSortDir(e.target.value as "asc" | "desc"); setPage(0); }} aria-label="Sort direction" className={sel}><option value="desc">High → Low</option><option value="asc">Low → High</option></select>
        <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }} aria-label="Rows per page" className={sel}>{[50, 100, 200, 500].map((n) => <option key={n} value={n}>{n} / page</option>)}</select>
        <button onClick={reset} className="btn btn-ghost !py-2" title="Clear all filters">↺ Reset</button>
        <button onClick={() => setLegend(true)} className="btn btn-ghost !px-3 !py-2" aria-label="Show legend">ℹ</button>
        <span className="muted ml-auto text-xs" aria-live="polite">{rows.length} of {all.length} stocks</span>
      </div>
      {open && (
        <div className="mt-3 flex flex-wrap gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)]/40 p-3">
          {FILTERS.map(({ id, options }) => (
            <select key={id} value={f[id]} onChange={(e) => upd(id, e.target.value)} aria-label={`Filter: ${options[0][1]}`} className={sel}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          ))}
        </div>
      )}

      <div className="mt-4 max-h-[680px] overflow-auto rounded-2xl border border-[var(--line)]">
        <table className="w-full min-w-[1100px] text-[13px]" aria-label="BhavCopy technical analysis">
          <thead className="sticky top-0 z-10 bg-[var(--surface)]">
            <tr className="border-b border-[var(--line)] text-left text-[10.5px] uppercase tracking-wider text-[var(--ink-3)]">
              {COLS.map((c) => (
                <th key={c.label} onClick={c.key ? () => setSort(c.key!) : undefined} aria-sort={c.key && c.key === sortKey ? (sortDir === "desc" ? "descending" : "ascending") : undefined} className={`whitespace-nowrap px-2.5 py-3 font-semibold ${c.right ? "text-right" : ""} ${c.key ? "cursor-pointer hover:text-[var(--ink)]" : ""}`}>
                  {c.label}{c.key && c.key === sortKey && <span className="text-[var(--accent)]"> {sortDir === "desc" ? "↓" : "↑"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!slice.length ? (
              <tr><td colSpan={15} className="muted py-10 text-center">{all.length ? "No stocks match the current filters." : "No BhavCopy data — run a sync from the admin panel."}</td></tr>
            ) : slice.map((r, i) => {
              const m = macdSignal(r), b = bbSignal(r), s = overallSignal(r);
              const pc = r.pctChange;
              return (
                <tr key={r.symbol} className="border-b border-[var(--line)]/60 transition hover:bg-[var(--surface-2)]/70">
                  <td className="muted px-2.5 py-2">{start + i + 1}</td>
                  <td className="px-2.5 py-2 font-semibold"><a href={screenerUrl(r.symbol)} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--accent)]">{r.symbol}</a></td>
                  <td className="num px-2.5 py-2 text-right">{fx(r.close)}</td>
                  <td className={`num px-2.5 py-2 text-right font-semibold ${pc == null ? "" : pc >= 0 ? "up" : "down"}`}>{pc != null && pc >= 0 ? "+" : ""}{pc != null ? fmtN(pc) : "—"}%</td>
                  <td className="num px-2.5 py-2 text-right">{r.volume != null ? fmtV(r.volume) : dash}</td>
                  <td className="num px-2.5 py-2 text-right">{r.deliveryPct != null ? r.deliveryPct.toFixed(2) + "%" : "—"}</td>
                  <td className="px-2.5 py-2 text-right">{r.rsi == null ? dash : <span className={`chip num ${r.rsi > 70 ? "chip-warn" : r.rsi < 30 ? "chip-down" : ""}`}>{r.rsi.toFixed(1)}</span>}</td>
                  <td className="num px-2.5 py-2 text-right">{fx(r.sma)}</td>
                  <td className="num px-2.5 py-2 text-right">{fx(r.ema)}</td>
                  <td className="px-2.5 py-2"><span className={`chip ${TONE[m.cls]}`}>{m.label}</span></td>
                  <td className="px-2.5 py-2"><span className={`chip ${TONE[b.cls]}`}>{b.label}</span></td>
                  <td className={`num px-2.5 py-2 text-right ${r.momentum == null ? "" : r.momentum >= 0 ? "up" : "down"}`}>{r.momentum != null && r.momentum >= 0 ? "+" : ""}{r.momentum != null ? fmtN(r.momentum, 2) : "—"}</td>
                  <td className="num px-2.5 py-2 text-right">{fx(r.vwap)}</td>
                  <td className="num px-2.5 py-2 text-right">{fx(r.atr, 2)}</td>
                  <td className="px-2.5 py-2"><span className={`chip ${TONE[s.cls]}`}>{s.label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <nav aria-label="BhavCopy pagination" className="mt-4 flex flex-wrap items-center gap-1.5">
          <button className="chip" disabled={cur === 0} onClick={() => setPage(cur - 1)}>← Prev</button>
          {pageNums.map((p, i) => p === "…" ? <span key={`e${i}`} className="muted px-1">…</span> : <button key={p} aria-current={p === cur ? "page" : undefined} onClick={() => setPage(p)} className={`chip ${p === cur ? "chip-gold !border-[var(--accent)]" : ""}`}>{p + 1}</button>)}
          <button className="chip" disabled={cur >= totalPages - 1} onClick={() => setPage(cur + 1)}>Next →</button>
          <span className="muted ml-2 text-xs">Showing {(start + 1).toLocaleString("en-IN")}–{Math.min(start + pageSize, rows.length).toLocaleString("en-IN")} of {rows.length.toLocaleString("en-IN")} stocks — Page {cur + 1} / {totalPages}</span>
        </nav>
      )}

      {legend && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && setLegend(false)} onKeyDown={(e) => e.key === "Escape" && setLegend(false)}>
          <div role="dialog" aria-modal="true" aria-label="BhavCopy legend" className="card rise w-full max-w-md">
            <div className="flex items-start justify-between"><div><h3 className="display text-2xl">BhavCopy legend</h3><p className="muted mt-1 text-sm">What each badge and signal means.</p></div><button onClick={() => setLegend(false)} aria-label="Close legend" autoFocus className="grid h-8 w-8 place-items-center rounded-full border border-[var(--line)]">×</button></div>
            <ul className="mt-5 space-y-2.5 text-sm">
              {([["OB", "chip-warn", "RSI > 70"], ["OS", "chip-down", "RSI < 30"], ["Strong Bullish", "chip-up", "MACD: hist & line > 0"], ["Bullish", "chip-up", "MACD hist > 0"], ["Band Breakout", "chip-violet", "Price > BB upper"], ["Near Upper Band", "chip-up", "Top 35% of band"], ["Volume Breakout", "chip-gold", "Vol > 2× avg"], ["Smart Money", "chip-gold", "Delivery breakout"]] as const).map(([l, c, d]) => (
                <li key={l} className="flex items-center gap-3"><span className={`chip ${c}`}>{l}</span><span className="text-[var(--ink-2)]">{d}</span></li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
