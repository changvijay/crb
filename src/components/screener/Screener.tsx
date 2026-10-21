"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { getData } from "@/lib/api";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Dict = Record<string, any>;
type Stock = Dict & { symbol?: string; error?: string };

const SH_COLORS: Record<string, string> = { Promoters: "#c9922d", FIIs: "#1a8a51", DIIs: "#2454e0", Government: "#8b93a5", Public: "#c1272d", Others: "#5b6272" };

/* ── null-safe helpers (as in the original) ── */
const safe = (v: unknown, suffix = "", fallback = "—") => (v === null || v === undefined || v === "" ? fallback : `${v}${suffix}`);
const num = (v: unknown) => { if (v === null || v === undefined || v === "") return null; const n = parseFloat(String(v).replace(/,/g, "")); return Number.isNaN(n) ? null : n; };
const locale = (v: unknown) => { const n = num(v); return n === null ? "—" : n.toLocaleString("en-IN"); };
const cmp = (v: unknown, threshold: number, dir: "gt" | "lt" = "gt") => { const n = num(v); return n === null ? "" : (dir === "gt" ? n > threshold : n < threshold) ? "up" : "down"; };

/** Score is only trustworthy when the backend had every required figure; otherwise it reports scoreStatus "unavailable". */
const scoreUnavailable = (s: Stock) => s.scoreStatus === "unavailable";
const missingList = (s: Stock): string[] => (Array.isArray(s.scoreMissing) ? s.scoreMissing : []);

/* ── Tickertape: labels only (its numeric score is members-only) ── */
const ttOk = (s: Stock) => s.tickertape?.status === "ok";
const TT_PARTS = [["performance", "Performance", "Perf"], ["valuation", "Valuation", "Val"], ["growth", "Growth", "Growth"], ["profitability", "Profitability", "Profit"]] as const;
const ttTone = (colour?: string) => (colour === "green" ? "var(--up)" : colour === "red" ? "var(--down)" : "var(--warn)");
const safeTtUrl = (u: unknown) => (typeof u === "string" && /^https:\/\/(www\.)?tickertape\.in\//.test(u) ? u : null);

/** Which Screener-named figures were filled from Tickertape (label shown on the tile → backend key). */
const SourcesCtx = createContext<Record<string, string>>({});
const LABEL_KEY: Record<string, string> = {
  "Rev growth YoY": "Revenue Growth YoY (%)", "EPS growth YoY": "EPS Growth YoY (%)", "Rev CAGR 3Y": "Revenue CAGR 3Y (%)", "Profit CAGR 3Y": "Profit CAGR 3Y (%)",
  ROCE: "ROCE (%)", ROE: "ROE (%)", "Net margin": "Net Profit Margin (%)", "Debt / Equity": "Debt-to-Equity", "Interest coverage": "Interest Coverage", "Current ratio": "Current Ratio",
  "Free cash flow": "Free Cash Flow (Cr)", "OCF / PAT": "OCF / PAT (%)", "PEG ratio": "PEG Ratio", "P / E": "P/E Ratio",
};
const SRC_NAME: Record<string, string> = { stockanalysis: "StockAnalysis", tickertape: "Tickertape" };
const SRC_ABBR: Record<string, string> = { stockanalysis: "SA", tickertape: "TT" };
/** Marks a figure that Screener did not have, filled from another source. */
const TtBadge = ({ source = "tickertape", title }: { source?: string; title?: string }) => <span title={title ?? `Filled from ${SRC_NAME[source] ?? source} — Screener had no value`} className="rounded bg-[var(--info)]/15 px-1 text-[9px] font-bold tracking-wide text-[var(--info)]">{SRC_ABBR[source] ?? "ALT"}</span>;
const filledOf = (s: Stock): { label: string; key: string; source: string }[] => (Array.isArray(s.scoreFilled) ? s.scoreFilled : []);
const fillSummary = (s: Stock) => { const by: Record<string, number> = {}; filledOf(s).forEach((f) => { by[f.source] = (by[f.source] || 0) + 1; }); return Object.entries(by).map(([k, n]) => `${n} from ${SRC_NAME[k] ?? k}`).join(", "); };

/** External pages for this stock (validated to the expected hosts). */
function sourceLinks(s: Stock): { name: string; href: string; hint: string }[] {
  const out: { name: string; href: string; hint: string }[] = [];
  const sym = typeof s.symbol === "string" && /^[A-Za-z0-9&._-]{1,20}$/.test(s.symbol) ? encodeURIComponent(s.symbol) : null;
  if (sym) out.push({ name: "Screener", href: `https://www.screener.in/company/${sym}/`, hint: "Financial statements and ratios" });
  const tt = typeof s.tickertape?.url === "string" && /^https:\/\/(www\.)?tickertape\.in\//.test(s.tickertape.url) ? s.tickertape.url : null;
  if (tt) out.push({ name: "Tickertape", href: tt, hint: "Scorecard, entry point and red flags" });
  const sa = typeof s.stockanalysis?.url === "string" && /^https:\/\/stockanalysis\.com\//.test(s.stockanalysis.url) ? s.stockanalysis.url.replace(/statistics\/?$/, "") : null;
  if (sa) out.push({ name: "StockAnalysis", href: sa, hint: "Piotroski F-Score, Altman Z and statistics" });
  return out;
}

/* ── StockAnalysis scores (Piotroski F-Score 0–9, Altman Z) ── */
const saOk = (s: Stock) => s.stockanalysis?.status === "ok";
const saScores = (s: Stock) => (saOk(s) ? s.stockanalysis.scores || {} : {});
const fTone = (n: number) => (n >= 6 ? "var(--up)" : n >= 4 ? "var(--warn)" : "var(--down)");
const zTone = (z: number) => (z > 2.99 ? "var(--up)" : z >= 1.81 ? "var(--warn)" : "var(--down)");
function SaChips({ s }: { s: Stock }) {
  if (!saOk(s)) return <p className="muted text-[11px]">StockAnalysis scores unavailable</p>;
  const { piotroski: f, altmanZ: z } = saScores(s);
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="StockAnalysis scores">
      <span className="muted text-[10px] font-semibold uppercase tracking-wider">StockAnalysis</span>
      {f ? <span title={`Piotroski F-Score ${f.value}/9 — ${f.band}`} className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] px-2 py-0.5 text-[10.5px] font-medium"><span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: fTone(f.value) }} />Piotroski <b>{f.value}/9</b></span> : null}
      {z ? <span title={`Altman Z-Score ${z.value} — ${z.zone}`} className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] px-2 py-0.5 text-[10.5px] font-medium"><span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: zTone(z.value) }} />Altman Z <b>{z.value}</b></span> : <span title="Altman Z is not defined for banks and financial companies" className="muted rounded-full border border-[var(--line)] px-2 py-0.5 text-[10.5px]">Altman Z n/a</span>}
    </div>
  );
}
function StockAnalysisPanel({ s }: { s: Stock }) {
  const sa = s.stockanalysis;
  const saLink = sourceLinks(s).find((l) => l.name === "StockAnalysis");
  if (!saOk(s)) return <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)]/40 px-4 py-3.5 text-sm"><p className="font-semibold">StockAnalysis scores unavailable</p><p className="muted mt-1 text-[12.5px]">{sa?.reason ? `Reason: ${sa.reason}.` : "Could not be reached."} Our own score is unaffected.</p></div>;
  const { piotroski: f, altmanZ: z } = saScores(s);
  const link = typeof sa.url === "string" && /^https:\/\/stockanalysis\.com\//.test(sa.url) ? sa.url : null;
  const row = (title: string, value: React.ReactNode, tone: string, band: string, note: string) => (
    <li className="flex items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-2)]/40 px-3.5 py-2.5">
      <span className="num mt-0.5 min-w-[62px] shrink-0 rounded-md py-0.5 text-center text-[12px] font-bold" style={{ background: `color-mix(in srgb, ${tone} 16%, transparent)`, color: tone }}>{value}</span>
      <span className="min-w-0"><b className="block text-[13px]">{title} · {band}</b><span className="muted block text-[12px] leading-5">{note}</span></span>
    </li>
  );
  return (
    <div>
      {saLink && <a href={saLink.href} target="_blank" rel="noopener noreferrer" className="btn btn-ghost mb-3 !py-1.5 !text-[12px]">Open {saLink.name} page ↗</a>}
      <ul className="space-y-2">
        {f ? row("Piotroski F-Score", `${f.value}/9`, fTone(f.value), f.band, "Nine pass/fail tests of profitability, leverage and efficiency. 8–9 is strong; 0–3 is weak.") : null}
        {z ? row("Altman Z-Score", String(z.value), zTone(z.value), z.zone, "Bankruptcy-risk model for non-financial companies. Above 2.99 is safe; below 1.81 is distress.") : <li className="muted rounded-xl border border-[var(--line)] px-3.5 py-2.5 text-[12px]">Altman Z-Score is not defined for banks and financial companies.</li>}
      </ul>
      <p className="muted mt-3 text-[11px] leading-5">Published by StockAnalysis.com (S&amp;P Global Market Intelligence data). {link && <a href={link} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">View on StockAnalysis ↗</a>}</p>
    </div>
  );
}


function TtChips({ s, compact }: { s: Stock; compact?: boolean }) {
  if (!ttOk(s)) return <p className="muted text-[11px]">Tickertape rating unavailable</p>;
  const sc = s.tickertape.scorecard || {};
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Tickertape rating">
      {!compact && <span className="muted text-[10px] font-semibold uppercase tracking-wider">Tickertape</span>}
      {TT_PARTS.map(([k, full, short]) => sc[k]?.tag ? <span key={k} title={`${full}: ${sc[k].tag}${sc[k].description ? " — " + sc[k].description : ""}`} className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] px-2 py-0.5 text-[10.5px] font-medium"><span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: ttTone(sc[k].colour) }} />{short} <b>{sc[k].tag}</b></span> : null)}
    </div>
  );
}

function TickertapePanel({ s }: { s: Stock }) {
  const t = s.tickertape;
  if (!ttOk(s)) return <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)]/40 px-4 py-3.5 text-sm"><p className="font-semibold">Tickertape rating unavailable</p><p className="muted mt-1 text-[12.5px]">{t?.reason ? `Reason: ${t.reason}.` : "Could not be reached."} Our own score above is unaffected.</p></div>;
  const sc = t.scorecard || {};
  const link = safeTtUrl(t.url);
  const flagRows = (x: Dict | null | undefined) => (x?.flags || []).map((f: Dict, i: number) => <li key={i} className="flex gap-2 text-[12px] leading-5"><span aria-hidden className={f.level === "High" ? "up" : f.level === "Low" ? "down" : "muted"}>{f.level === "High" ? "✓" : f.level === "Low" ? "⚑" : "•"}</span><span><b>{safe(f.title)}</b> <span className="text-[var(--ink-2)]">— {safe(f.description)}</span></span></li>);
  return (
    <div>
      {link && <a href={link} target="_blank" rel="noopener noreferrer" className="btn btn-ghost mb-3 !py-1.5 !text-[12px]">Open Tickertape page ↗</a>}
      <ul className="space-y-2">
        {TT_PARTS.map(([k, full]) => sc[k]?.tag ? (
          <li key={k} className="flex items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-2)]/40 px-3.5 py-2.5">
            <span className="mt-0.5 w-[62px] shrink-0 rounded-md py-0.5 text-center text-[11px] font-bold" style={{ background: `color-mix(in srgb, ${ttTone(sc[k].colour)} 16%, transparent)`, color: ttTone(sc[k].colour) }}>{sc[k].tag}</span>
            <span className="min-w-0"><b className="block text-[13px]">{full}</b><span className="muted block text-[12px] leading-5">{safe(sc[k].description, "", "")}</span></span>
          </li>
        ) : null)}
      </ul>
      {sc.entryPoint?.tag && <div className="mt-3"><p className="eyebrow mb-1.5 !text-[var(--ink-2)]">Entry point · <span style={{ color: ttTone(sc.entryPoint.colour) }}>{sc.entryPoint.tag}</span></p><ul className="space-y-1">{flagRows(sc.entryPoint)}</ul></div>}
      {sc.redFlags?.tag && <div className="mt-3"><p className="eyebrow mb-1.5 !text-[var(--ink-2)]">Red flags · <span style={{ color: ttTone(sc.redFlags.colour) }}>{sc.redFlags.tag}</span></p><ul className="space-y-1">{flagRows(sc.redFlags)}</ul></div>}
      <p className="muted mt-3 text-[11px] leading-5">These labels are Tickertape&apos;s own. Its numeric scores (the 0–100 style figures you see when logged in) are not published to logged-out visitors, so we don&apos;t show or estimate them. {link && <a href={link} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">View on Tickertape ↗</a>}</p>
    </div>
  );
}

function Cell({ k, v, tone }: { k: string; v: React.ReactNode; tone?: string }) {
  const sources = useContext(SourcesCtx);
  const via = LABEL_KEY[k] ? sources[LABEL_KEY[k]] : undefined;
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)]/40 px-3.5 py-3 transition-colors hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))]">
      <p className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wider text-[var(--ink-3)]">
        {tone ? <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: tone === "up" ? "var(--up)" : "var(--down)" }} /> : null}{k}{via && <TtBadge source={via} />}
      </p>
      <p className={`num mt-1 text-[16px] font-semibold ${tone || ""}`}>{v}</p>
    </div>
  );
}
const Grid = ({ children }: { children: React.ReactNode }) => <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">{children}</div>;
function Section({ t, hint, children }: { t: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)]/20 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3"><h3 className="text-[13px] font-semibold tracking-wide">{t}</h3>{hint && <span className="muted text-[11px]">{hint}</span>}</div>
      {children}
    </section>
  );
}

/** TradingView embeds: scripts inside innerHTML never execute, so they are injected (same as the original). */
function TvWidget({ src, config, height }: { src: string; config: Dict; height?: number }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // Deferred so a cancelled effect (StrictMode re-run, fast unmount) never leaves a script running against a detached node.
    const t = setTimeout(() => {
      el.innerHTML = "";
      const inner = document.createElement("div");
      inner.className = "tradingview-widget-container__widget";
      el.appendChild(inner);
      const s = document.createElement("script");
      s.type = "text/javascript";
      s.src = src;
      s.async = true;
      s.text = JSON.stringify(config);
      el.appendChild(s);
    }, 0);
    return () => { clearTimeout(t); el.innerHTML = ""; };
  }, [src, config]);
  return <div ref={box} className="tradingview-widget-container w-full overflow-hidden rounded-xl" style={{ minHeight: height ?? 120 }} />;
}

const TABS = [["overview", "Overview"], ["financials", "Financials"], ["results", "Results & ownership"], ["insights", "Insights"]] as const;
type TabId = (typeof TABS)[number][0];

function Detail({ s, dark }: { s: Stock; dark: boolean }) {
  const [tab, setTab] = useState<TabId>("overview");
  if (s.error) return <div className="card"><p className="eyebrow">Error</p><p className="mt-2 text-sm text-[var(--down)]">{safe(s.symbol, "", "This symbol")}: {safe(s.error, "", "Could not be loaded.")}</p></div>;
  const I = s.indicators || {};
  const g = I.growth || {}, p = I.profitability || {}, f = I.financialHealth || {}, c = I.cashFlow || {}, v = I.valuation || {}, m = I.marketData || {};
  const range: any[] = Array.isArray(m["52W High / Low"]) ? m["52W High / Low"] : [null, null];
  const [hi, lo, px] = [num(range[0]), num(range[1]), num(m["Current Price"])];
  const rangePct = hi !== null && lo !== null && px !== null && hi > lo ? Math.max(0, Math.min(100, ((px - lo) / (hi - lo)) * 100)) : null;
  const sh = Object.entries((s.shareholding?.latest || {}) as Dict).filter(([, x]) => x !== null && x !== undefined);
  const shTotal = sh.reduce((a, [, b]) => a + (num(b) || 0), 0) || 100;
  const tv = `BSE:${s.symbol}`;
  const theme = dark ? "dark" : "light";
  const peg = num(v["PEG Ratio"]);
  const docs = [...(s.documents?.concalls || []), ...(s.documents?.announcements || [])] as Dict[];
  const httpOnly = (u: unknown) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : null);
  const score = num(s.score);
  const flags = (s.redFlags || []) as string[];

  return (
    <SourcesCtx.Provider value={(s.indicatorSources || {}) as Record<string, string>}>
    <div className="card rise !p-0 overflow-hidden">
      <div className="border-b border-[var(--line)] bg-[linear-gradient(120deg,var(--accent-soft),transparent_60%)] p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2"><span className="chip chip-gold num !py-0.5">NSE · {safe(s.symbol)}</span><span className="chip !py-0.5">{safe(s.reportType, "", "").toUpperCase() || "—"}{s.fellBackToStandalone ? " · standalone fallback" : ""}</span>{saScores(s).piotroski && <span className="chip !py-0.5" title="Piotroski F-Score (StockAnalysis)">F-Score {saScores(s).piotroski.value}/9</span>}{scoreUnavailable(s) ? <span className="chip chip-warn !py-0.5" title={s.scoreReason || ""}>Score unavailable</span> : score !== null && <span className="chip !py-0.5">Score {score}/10{s.scoreRating ? ` · ${s.scoreRating}` : ""}</span>}</p>
            <h2 className="display mt-3 text-[clamp(26px,3.4vw,40px)]">{safe(s.company)}</h2>
            {s.industry && <p className="muted mt-1 max-w-xl text-sm">{safe(s.industry, "", "")}</p>}
            <nav aria-label="Open on other sites" className="mt-3 flex flex-wrap items-center gap-2">
              <span className="muted text-[11px] font-semibold uppercase tracking-wider">Open on</span>
              {sourceLinks(s).map((l) => <a key={l.name} href={l.href} target="_blank" rel="noopener noreferrer" title={l.hint} className="chip hover:!border-[var(--accent)] hover:!text-[var(--accent)]">{l.name} <span aria-hidden>↗</span></a>)}
            </nav>
          </div>
          <div className="text-left sm:text-right">
            <p className="num text-[34px] font-semibold leading-none">₹{safe(m["Current Price"])}</p>
            <p className="muted mt-1.5 text-xs">Market cap ₹{safe(m["Market Cap (Cr)"])} Cr</p>
          </div>
        </div>
        {rangePct !== null && (
          <div className="mt-5 max-w-xl" aria-label="52 week range">
            <div className="num flex justify-between text-[11px] text-[var(--ink-3)]"><span>52W low ₹{lo}</span><span>52W high ₹{hi}</span></div>
            <div className="relative mt-1.5 h-1.5 rounded-full bg-[var(--line)]"><span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[var(--down)] via-[var(--warn)] to-[var(--up)] opacity-70" style={{ width: "100%" }} /><span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--surface)] bg-[var(--ink)] shadow" style={{ left: `${rangePct}%` }} /></div>
          </div>
        )}
        <div className="seg mt-5" role="tablist" aria-label="Stock sections">
          {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}{id === "insights" && flags.length ? <span className="ml-1.5 rounded-full bg-[var(--down-soft)] px-1.5 text-[10px] text-[var(--down)]">{flags.length}</span> : null}</button>)}
        </div>
      </div>

      <div className="space-y-4 p-4 md:p-6" role="tabpanel">
        {/* Overview stays mounted (just hidden): TradingView's embed scripts throw if their container is removed mid-load. */}
        <div className={tab === "overview" ? "tab-swap space-y-4" : "hidden"}>
          <>
            <Section t="Company overview"><TvWidget src="https://s3.tradingview.com/external-embedding/embed-widget-symbol-info.js" config={{ symbol: tv, width: "100%", locale: "en", colorTheme: theme }} /></Section>
            <div className="grid gap-4 xl:grid-cols-2">
              <Section t="Interactive price chart"><TvWidget height={450} src="https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js" config={{ symbols: [[tv]], chartOnly: false, width: "100%", height: 450, locale: "en", colorTheme: theme, autosize: true, showVolume: true, showMA: true, hideDateRanges: false, hideMarketStatus: false, hideSymbolLogo: false, scalePosition: "right", scaleMode: "Normal", fontFamily: "Inter", fontSize: "12", lineWidth: 2, lineType: 0 }} /></Section>
              <Section t="Technical analysis"><TvWidget height={450} src="https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js" config={{ interval: "1W", width: "100%", height: "450", symbol: tv, showIntervalTabs: true, locale: "en", colorTheme: theme }} /></Section>
            </div>
          </>
        </div>

        <div key={tab} className="tab-swap space-y-4">
        {tab === "financials" && (
          <>
            <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
              {scoreUnavailable(s) ? (
                <Section t="Our score">
                  <div role="alert" className="rounded-xl border border-[var(--warn)]/40 bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] px-4 py-3.5 text-sm">
                    <p className="font-semibold text-[var(--warn)]">⚠ We can&apos;t fetch complete data, so the score is not available.</p>
                    <p className="muted mt-1 text-[13px] leading-6">A score needs every one of its inputs. We checked Screener, StockAnalysis and Tickertape; a partial score would be misleading, so it is shown as 0 / unavailable rather than guessed.</p>
                    {missingList(s).length > 0 && <p className="mt-2 text-[12.5px] text-[var(--ink-2)]"><b>Still missing:</b> {missingList(s).join(", ")}</p>}
                    {filledOf(s).length > 0 && <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--ink-2)]"><b>Filled from other sources:</b> {filledOf(s).map((f) => <span key={f.key} className="inline-flex items-center gap-1">{f.label} <TtBadge source={f.source} /></span>)}</p>}
                  </div>
                </Section>
              ) : ((s.scoreBreakdown || []) as Dict[]).length > 0 && (
                <Section t="Our score" hint={`${safe(s.score)}/10 · ${safe(s.scoreRating, "", "")}${s.scorePenalty ? ` · includes −${s.scorePenalty} for red flags` : ""}`}>
                  <div className="grid gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    {[...new Set(((s.scoreBreakdown || []) as Dict[]).map((b) => b.category))].map((cat) => (
                      <div key={cat}>
                        <p className="eyebrow mb-2 !text-[var(--ink-2)]">{cat}</p>
                        <ul className="space-y-2.5">
                          {((s.scoreBreakdown || []) as Dict[]).filter((b) => b.category === cat).map((b, i) => {
                            const ratio = b.max ? Math.max(0, Math.min(1, b.points / b.max)) : 0;
                            return (
                              <li key={i} title={b.rule || ""}>
                                <div className="flex items-baseline justify-between gap-2 text-[12.5px]"><span className="flex items-center gap-1.5">{safe(b.label)}{b.source && b.source !== "screener" && <TtBadge source={b.source} />}</span><span className="num muted text-[11px]">{safe(b.value)} · <b className="text-[var(--ink)]">{b.points}</b>/{b.max}</span></div>
                                <div className="mt-1 h-1.5 rounded-full bg-[var(--line)]" aria-hidden><div className="h-full rounded-full" style={{ width: `${ratio * 100}%`, background: ratio >= 0.6 ? "var(--up)" : ratio >= 0.3 ? "var(--warn)" : "var(--down)" }} /></div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                  {filledOf(s).length > 0 && <p className="muted mt-4 text-[11.5px]">Badges (<TtBadge source="stockanalysis" /> StockAnalysis, <TtBadge source="tickertape" /> Tickertape) mark figures Screener did not provide: {fillSummary(s)}.</p>}
                </Section>
              )}
              <div className="space-y-4">
                <Section t="StockAnalysis scores" hint="Independent view"><StockAnalysisPanel s={s} /></Section>
                <Section t="Tickertape rating" hint="Independent view"><TickertapePanel s={s} /></Section>
              </div>
            </div>
            <Section t="Growth" hint="Green ≥ 10% YoY"><Grid>
              <Cell k="Rev growth YoY" v={safe(g["Revenue Growth YoY (%)"], "%")} tone={cmp(g["Revenue Growth YoY (%)"], 10)} /><Cell k="EPS growth YoY" v={safe(g["EPS Growth YoY (%)"], "%")} tone={cmp(g["EPS Growth YoY (%)"], 10)} />
              <Cell k="Rev CAGR 3Y" v={safe(g["Revenue CAGR 3Y (%)"], "%")} /><Cell k="Rev CAGR 5Y" v={safe(g["Revenue CAGR 5Y (%)"], "%")} /><Cell k="Profit CAGR 3Y" v={safe(g["Profit CAGR 3Y (%)"], "%")} /><Cell k="Profit CAGR 5Y" v={safe(g["Profit CAGR 5Y (%)"], "%")} />
            </Grid></Section>
            <Section t="Profitability" hint="Green ≥ 15% ROCE / ROE"><Grid>
              <Cell k="ROCE" v={safe(p["ROCE (%)"], "%")} tone={cmp(p["ROCE (%)"], 15)} /><Cell k="ROE" v={safe(p["ROE (%)"], "%")} tone={cmp(p["ROE (%)"], 15)} /><Cell k="ROA" v={safe(p["ROA (%)"], "%")} />
              <Cell k="Net margin" v={safe(p["Net Profit Margin (%)"], "%")} /><Cell k="Operating margin" v={safe(p["Operating Margin (%)"])} /><Cell k="Asset turnover" v={safe(p["Asset Turnover (x)"], "x")} />
            </Grid></Section>
            <Section t="Balance sheet" hint="Green: D/E < 1, coverage > 5x"><Grid>
              <Cell k="Debt / Equity" v={safe(f["Debt-to-Equity"])} tone={cmp(f["Debt-to-Equity"], 1, "lt")} /><Cell k="Interest coverage" v={safe(f["Interest Coverage"], "x")} tone={cmp(f["Interest Coverage"], 5)} /><Cell k="Current ratio" v={safe(f["Current Ratio"])} />
              <Cell k="Working capital" v={`₹${safe(f["Working Capital (Cr)"])} Cr`} /><Cell k="Total assets" v={`₹${locale(f["Total Assets (Cr)"])} Cr`} /><Cell k="Investments" v={`₹${locale(f["Investments (Cr)"])} Cr`} />
            </Grid></Section>
            <Section t="Cash conversion"><Grid>
              <Cell k="Free cash flow" v={`₹${safe(c["Free Cash Flow (Cr)"])} Cr`} tone={c["Free Cash Flow (Cr)"] != null ? ((num(c["Free Cash Flow (Cr)"]) ?? 0) >= 0 ? "up" : "down") : ""} /><Cell k="Operating cash flow" v={`₹${safe(c["Operating Cash Flow (Cr)"])} Cr`} />
              <Cell k="OCF / PAT" v={safe(c["OCF / PAT (%)"])} tone={cmp(c["OCF / PAT (%)"], 100)} /><Cell k="FCF yield" v={safe(c["FCF Yield (%)"], "%")} />
            </Grid></Section>
            <Section t="Valuation" hint="Green: PEG ≤ 1.5"><Grid>
              <Cell k="PEG ratio" v={safe(v["PEG Ratio"])} tone={peg !== null ? (peg > 0 && peg <= 1.5 ? "up" : "down") : ""} /><Cell k="P / E" v={safe(v["P/E Ratio"])} /><Cell k="P / B" v={safe(v["P/B Ratio"])} />
              <Cell k="Earnings yield" v={safe(v["Earnings Yield (%)"], "%")} /><Cell k="Dividend yield" v={safe(v["Dividend Yield (%)"], "%")} /><Cell k="Dividend payout" v={safe(v["Dividend Payout (%)"])} />
            </Grid></Section>
            {Object.keys(s.quickCheck || {}).length > 0 && <Section t="Quick check"><Grid>{Object.entries((s.quickCheck || {}) as Dict).map(([k, val]) => <Cell key={k} k={k} v={safe(val)} />)}</Grid></Section>}
          </>
        )}

        {tab === "results" && (
          <>
            <Section t="Last four quarters">
              <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
                <table className="w-full min-w-[480px] text-[13px]">
                  <thead><tr className="border-b border-[var(--line)] bg-[var(--surface-2)]/50 text-left text-[10.5px] uppercase tracking-wider text-[var(--ink-3)]"><th className="px-3 py-3">Quarter</th><th>Sales</th><th>Net profit</th><th>EPS</th><th>OPM</th></tr></thead>
                  <tbody>
                    {((s.quarterlyResults?.lastFourQuarters || []) as Dict[]).map((q, i) => <tr key={i} className="border-b border-[var(--line)]/60 last:border-0"><td className="px-3 py-2.5 font-medium">{safe(q?.quarter)}</td><td className="num">₹{safe(q?.sales)} Cr</td><td className="num">₹{safe(q?.netProfit)} Cr</td><td className="num">{safe(q?.eps)}</td><td className="num">{safe(q?.opm)}</td></tr>)}
                    {!(s.quarterlyResults?.lastFourQuarters || []).length && <tr><td colSpan={5} className="muted py-6 text-center">No quarterly data</td></tr>}
                  </tbody>
                </table>
              </div>
            </Section>
            <Section t="Shareholding pattern" hint="Latest quarter">
              {sh.length ? (
                <>
                  <div className="flex h-8 overflow-hidden rounded-full border border-[var(--line)]" role="img" aria-label="Shareholding split">
                    {sh.map(([k, val]) => { const n = num(val) || 0; return <div key={k} className="grid place-items-center text-[10.5px] font-semibold text-white" style={{ width: `${(n / shTotal) * 100}%`, background: SH_COLORS[k] || "#5b6272" }}>{n >= 6 ? `${n}%` : ""}</div>; })}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">{sh.map(([k, val]) => <span key={k} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SH_COLORS[k] || "#5b6272" }} />{k} <b className="num">{safe(val, "%")}</b></span>)}</div>
                </>
              ) : <p className="muted text-sm">No shareholding data available.</p>}
            </Section>
          </>
        )}

        {tab === "insights" && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <Section t="Pros"><ul className="space-y-2 text-sm text-[var(--ink-2)]">{((s.pros || []) as string[]).map((x, i) => <li key={i} className="flex gap-2"><span className="up">✓</span>{safe(x)}</li>)}{!(s.pros || []).length && <li className="muted">None listed.</li>}</ul></Section>
              <Section t="Cons"><ul className="space-y-2 text-sm text-[var(--ink-2)]">{((s.cons || []) as string[]).map((x, i) => <li key={i} className="flex gap-2"><span className="down">✕</span>{safe(x)}</li>)}{!(s.cons || []).length && <li className="muted">None listed.</li>}</ul></Section>
            </div>
            {!!flags.length && <Section t="Red flags" hint="Worth a closer look"><ul className="space-y-2 text-sm">{flags.map((x, i) => <li key={i} className="flex gap-2 rounded-xl border border-[var(--down)]/30 bg-[var(--down-soft)] px-4 py-2.5 text-[var(--down)]">⚑ {safe(x)}</li>)}</ul></Section>}
            <div className="grid gap-4 md:grid-cols-2">
              <Section t="Peers">{(s.peers || []).length ? <div className="flex flex-wrap gap-2">{(s.peers as string[]).map((x, i) => <span key={i} className="chip">{safe(x)}</span>)}</div> : <p className="muted text-sm">No peers listed.</p>}</Section>
              <Section t="Documents">{docs.length ? <ul className="flex flex-wrap gap-2">{docs.map((d, i) => { const href = httpOnly(d?.link); return <li key={i}>{href ? <a href={href} target="_blank" rel="noreferrer noopener" className="chip hover:!border-[var(--accent)] hover:!text-[var(--accent)]">{safe(d?.title)} ↗</a> : <span className="chip">{safe(d?.title)}</span>}</li>; })}</ul> : <p className="muted text-sm">No documents available.</p>}</Section>
            </div>
          </>
        )}
        </div>
      </div>
    </div>
    </SourcesCtx.Provider>
  );
}

/** Side-by-side comparison, shown when more than one symbol was screened. */
function Compare({ data, active, onPick }: { data: Stock[]; active: number | null; onPick: (i: number) => void }) {
  const rows = data.map((s, i) => ({ s, i })).filter(({ s }) => !s.error);
  if (rows.length < 2) return null;
  const cols: [string, (s: Stock) => React.ReactNode][] = [
    ["CMP", (s) => `₹${safe(s.indicators?.marketData?.["Current Price"])}`], ["Mkt cap (Cr)", (s) => locale(s.indicators?.marketData?.["Market Cap (Cr)"])],
    ["P/E", (s) => safe(s.indicators?.valuation?.["P/E Ratio"])], ["ROE", (s) => safe(s.indicators?.profitability?.["ROE (%)"], "%")], ["ROCE", (s) => safe(s.indicators?.profitability?.["ROCE (%)"], "%")],
    ["D/E", (s) => safe(s.indicators?.financialHealth?.["Debt-to-Equity"])], ["Rev growth", (s) => safe(s.indicators?.growth?.["Revenue Growth YoY (%)"], "%")], ["Div. yield", (s) => safe(s.indicators?.valuation?.["Dividend Yield (%)"], "%")],
    ["Piotroski", (s) => (saScores(s).piotroski ? <span title={saScores(s).piotroski.band} style={{ color: fTone(saScores(s).piotroski.value) }}>{saScores(s).piotroski.value}/9</span> : <span className="muted">—</span>)],
    ["Altman Z", (s) => (saScores(s).altmanZ ? <span title={saScores(s).altmanZ.zone} style={{ color: zTone(saScores(s).altmanZ.value) }}>{saScores(s).altmanZ.value}</span> : <span className="muted" title="Not defined for financial companies">n/a</span>)],
    ["Tickertape", (s) => (ttOk(s) ? <span className="inline-flex items-center gap-1.5" aria-label="Tickertape rating">{TT_PARTS.map(([k, full]) => <span key={k} title={`${full}: ${s.tickertape.scorecard?.[k]?.tag ?? "n/a"}`} className="h-2.5 w-2.5 rounded-full" style={{ background: ttTone(s.tickertape.scorecard?.[k]?.colour) }} />)}</span> : <span className="muted">—</span>)],
    ["Score", (s) => (scoreUnavailable(s) ? <span className="text-[var(--warn)]" title={s.scoreReason || ""}>N/A</span> : safe(s.score, "/10"))],
  ];
  return (
    <section className="card !p-0 overflow-hidden" aria-label="Comparison">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3"><h2 className="text-[15px] font-semibold">Compare</h2><span className="muted text-xs">{rows.length} stocks · click a row to open</span></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead><tr className="text-left text-[10.5px] uppercase tracking-wider text-[var(--ink-3)]"><th className="px-5 py-2.5">Symbol</th>{cols.map(([h]) => <th key={h} className="px-2 py-2.5">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map(({ s, i }) => (
              <tr key={i} onClick={() => onPick(i)} className={`cursor-pointer border-t border-[var(--line)]/60 transition-colors hover:bg-[var(--surface-2)] ${active === i ? "bg-[var(--accent-soft)]" : ""}`}>
                <td className="px-5 py-3 font-semibold">{safe(s.symbol)}</td>
                {cols.map(([h, fn]) => <td key={h} className="num px-2 py-3">{fn(s)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** A metric as a labelled bar: fill length = value on a fixed scale, colour = good/bad against a threshold. */
function MetricBar({ label, raw, text, max, good, dir = "gt" }: { label: string; raw: unknown; text: string; max: number; good?: number; dir?: "gt" | "lt" }) {
  const n = num(raw);
  const w = n === null ? 0 : Math.max(3, Math.min(100, (Math.abs(n) / max) * 100));
  const color = n === null || good === undefined ? "var(--accent)" : (dir === "gt" ? n >= good : n <= good) ? "var(--up)" : "var(--down)";
  return (
    <div>
      <div className="flex items-baseline justify-between text-[12px]"><span className="muted">{label}</span><span className="num font-semibold">{text}</span></div>
      <div className="relative mt-1 h-1.5 rounded-full bg-[var(--line)]" aria-hidden>
        <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700" style={{ width: `${w}%`, background: color }} />
        {good !== undefined && <span className="absolute -top-0.5 h-2.5 w-px bg-[var(--ink-3)]" style={{ left: `${Math.min(100, (good / max) * 100)}%` }} title={`Benchmark ${good}`} />}
      </div>
    </div>
  );
}

function StockCard({ s, i, active, onPick }: { s: Stock; i: number; active: boolean; onPick: () => void }) {
  if (s.error) return <div className="card w-[300px] shrink-0 snap-start sm:w-[340px]"><p className="text-sm"><b>{safe(s.symbol, "", "Symbol")}</b>: <span className="text-[var(--down)]">{safe(s.error, "", "Could not be loaded.")}</span></p></div>;
  const b: Dict[] = s.scoreBreakdown || [];
  const md = s.indicators?.marketData || {}, val = s.indicators?.valuation || {}, pr = s.indicators?.profitability || {}, fh = s.indicators?.financialHealth || {}, gr = s.indicators?.growth || {};
  const na = scoreUnavailable(s);
  const sc = na ? null : num(s.score);
  const flags = s.redFlags?.length || 0;
  const range: unknown[] = Array.isArray(md["52W High / Low"]) ? md["52W High / Low"] : [];
  const [hi, lo, px] = [num(range[0]), num(range[1]), num(md["Current Price"])];
  const rp = hi !== null && lo !== null && px !== null && hi > lo ? Math.max(0, Math.min(100, ((px - lo) / (hi - lo)) * 100)) : null;
  const metCount = b.filter((x) => x?.met).length;
  return (
    <article aria-label={`${safe(s.symbol)} score card`} onClick={onPick} className={`card card-hover rise w-[300px] shrink-0 cursor-pointer snap-start sm:w-[340px] ${active ? "!border-[var(--accent)] shadow-[var(--glow)]" : ""}`} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><button type="button" aria-pressed={active} onClick={(e) => { e.stopPropagation(); onPick(); }} className="display text-left text-2xl hover:text-[var(--accent)]" title="Open details">{safe(s.symbol)}</button><p className="muted truncate text-xs">{safe(s.company)}</p><p className="num mt-2 text-[20px] font-semibold">₹{safe(md["Current Price"])}</p></div>
        {na ? (
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full border-2 border-dashed border-[var(--warn)]/60" role="img" aria-label="Score not available"><b className="num text-[12px] text-[var(--warn)]">N/A</b></div>
        ) : (
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${sc !== null && sc >= 6.5 ? "var(--up)" : sc !== null && sc >= 4.5 ? "var(--warn)" : "var(--down)"} ${(sc ?? 0) * 10}%, var(--surface-2) 0)` }} role="img" aria-label={`Score ${sc ?? "n/a"} out of 10`}><b className="num grid h-[52px] w-[52px] place-items-center rounded-full bg-[var(--surface)] text-[13px] leading-none">{sc ?? "—"}<span className="muted -mt-1 text-[9px] font-normal">/10</span></b></div>
        )}
      </div>

      <nav aria-label={`Open ${safe(s.symbol)} on other sites`} onClick={(e) => e.stopPropagation()} className="mt-3 flex gap-1">
        {sourceLinks(s).map((l) => <a key={l.name} href={l.href} target="_blank" rel="noopener noreferrer" title={`${l.name} — ${l.hint}`} className="flex flex-1 items-center justify-center gap-0.5 whitespace-nowrap rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-1 py-1.5 text-[10.5px] font-semibold text-[var(--accent)] transition hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-[#03120f]">{l.name} <span aria-hidden>↗</span></a>)}
      </nav>

      {na ? (
        <div role="alert" className="mt-3 rounded-xl border border-[var(--warn)]/40 bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] px-3 py-2.5 text-[12px] leading-5">
          <p className="font-semibold text-[var(--warn)]">⚠ Score not available</p>
          <p className="muted">We couldn&apos;t fetch all the data needed to score this stock.{missingList(s).length ? ` Missing: ${missingList(s).slice(0, 3).join(", ")}${missingList(s).length > 3 ? ` +${missingList(s).length - 3} more` : ""}.` : ""}</p>
        </div>
      ) : (
        <>
          <div className="mt-3 flex gap-1" aria-label={`${metCount} of ${b.length} criteria strong`} role="img">{b.map((x, k) => <span key={k} title={`${x?.label || ""}: ${x?.points ?? 0}/${x?.max ?? ""}`} className="h-2 flex-1 rounded-sm" style={{ background: x?.max && x.points / x.max >= 0.6 ? "var(--up)" : x?.max && x.points / x.max >= 0.3 ? "var(--warn)" : "var(--line)" }} />)}</div>
          <p className="muted mt-1 text-[11px]">{s.scoreRating ? `${s.scoreRating} · ` : ""}{metCount}/{b.length} criteria strong</p>
        </>
      )}

      <div className="mt-3 space-y-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)]/40 px-2.5 py-2"><SaChips s={s} /><TtChips s={s} /></div>
      {!na && filledOf(s).length > 0 && <p className="muted mt-2 text-[10.5px]">{filledOf(s).length} figure(s) filled in: {fillSummary(s)}</p>}

      <div className="mt-4 space-y-3">
        <MetricBar label="ROE" raw={pr["ROE (%)"]} text={safe(pr["ROE (%)"], "%")} max={40} good={15} />
        <MetricBar label="ROCE" raw={pr["ROCE (%)"]} text={safe(pr["ROCE (%)"], "%")} max={40} good={15} />
        <MetricBar label="P/E" raw={val["P/E Ratio"]} text={safe(val["P/E Ratio"])} max={60} good={25} dir="lt" />
        <MetricBar label="Debt / Equity" raw={fh["Debt-to-Equity"]} text={safe(fh["Debt-to-Equity"])} max={2} good={1} dir="lt" />
        <MetricBar label="Revenue growth YoY" raw={gr["Revenue Growth YoY (%)"]} text={safe(gr["Revenue Growth YoY (%)"], "%")} max={30} good={10} />
        <MetricBar label="Dividend yield" raw={val["Dividend Yield (%)"]} text={safe(val["Dividend Yield (%)"], "%")} max={6} />
      </div>

      {rp !== null && (
        <div className="mt-4">
          <div className="num flex justify-between text-[10.5px] text-[var(--ink-3)]"><span>₹{lo}</span><span>52-week range</span><span>₹{hi}</span></div>
          <div className="relative mt-1 h-1.5 rounded-full bg-gradient-to-r from-[var(--down)] via-[var(--warn)] to-[var(--up)] opacity-80" aria-hidden><span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--surface)] bg-[var(--ink)]" style={{ left: `${rp}%` }} /></div>
        </div>
      )}
      <div className="mt-4" onClick={(e) => e.stopPropagation()}>
        <span className={`chip ${flags ? "chip-down" : "chip-up"}`}>{flags ? `⚑ ${flags} red flag${flags > 1 ? "s" : ""}` : "✓ no red flags"}</span>
      </div>
    </article>
  );
}

export function Screener() {
  const [input, setInput] = useState("");
  const [data, setData] = useState<Stock[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "idle" | "ok" | "error"; text: string }>({ kind: "idle", text: "Type NSE symbols like TCS, RELIANCE or INFY and press Run screener." });
  const [fetched, setFetched] = useState("—");
  const [dark, setDark] = useState(true);
  const detail = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const read = () => setDark(document.documentElement.dataset.theme !== "light");
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);

  const run = async () => {
    const symbols = input.split(",").map((x) => x.trim()).filter(Boolean).join(",");
    if (!symbols) return setStatus({ kind: "error", text: "Please enter at least one symbol to run the screener." });
    setBusy(true);
    setActive(null);
    setData([]);
    setStatus({ kind: "idle", text: "Fetching fundamentals…" });
    try {
      const json = await getData<{ count?: number; results?: Stock[] }>("screener", { symbols });
      const results = Array.isArray(json.results) ? json.results : [];
      if (!results.length) throw new Error("No data returned");
      setData(results);
      const first = results.findIndex((r) => r && !r.error);
      setActive(first !== -1 ? first : 0);
      setStatus({ kind: "ok", text: `Loaded ${json.count ?? results.length} symbol(s).` });
      setFetched("Fetched " + new Date().toLocaleTimeString());
    } catch (e) {
      // Unlike the original, no placeholder numbers are fabricated when the live API is unreachable.
      setStatus({ kind: "error", text: `Could not load data (${(e as Error).message}). Live fundamentals are unavailable right now — please try again shortly.` });
    } finally {
      setBusy(false);
    }
  };

  const pick = (i: number) => {
    setActive(i);
    if (window.innerWidth < 1024) setTimeout(() => detail.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const tokens = input.split(",").map((x) => x.trim()).filter(Boolean);
  const addExample = (sym: string) => {
    if (tokens.map((t) => t.toUpperCase()).includes(sym) || tokens.length >= 6) return;
    setInput(tokens.length ? `${tokens.join(", ")}, ${sym}` : sym);
  };

  return (
    <div className="container-x pb-6">
      <header className="relative overflow-hidden pb-6 pt-8 md:pt-10">
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[var(--accent)] opacity-[0.07] blur-3xl" />
        <p className="eyebrow">NSE fundamentals · screener</p>
        <h1 className="display mt-3 max-w-4xl text-[clamp(30px,4.4vw,54px)]">Screen any NSE stock in <span className="grad-text">seconds</span></h1>
        <p className="mt-4 max-w-3xl text-[15.5px] leading-7 text-[var(--ink-2)]">Growth, profitability, balance sheet, cash flow and valuation — scored against quality checks, with plain-English context for every number.</p>
        <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-[var(--ink-3)]" aria-label="Highlights">
          {["Consolidated financials preferred", "Up to 6 stocks per run", "Side-by-side comparison", "Live TradingView charts"].map((t) => <li key={t} className="flex items-center gap-1.5"><span aria-hidden className="text-[var(--accent)]">✓</span>{t}</li>)}
        </ul>
      </header>

      <section className="card relative z-10 !p-4 md:!p-5" aria-label="Screener">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-3)]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <label className="sr-only" htmlFor="symbols">Stock symbols</label>
            <input id="symbols" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !busy && run()} spellCheck={false} autoComplete="off" maxLength={140} placeholder="Enter NSE symbols, e.g. TCS, RELIANCE, INFY" className="num w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] py-3.5 pl-11 pr-16 text-[15px] outline-none transition focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--accent-soft)]" />
            <span className={`num absolute right-4 top-1/2 -translate-y-1/2 text-[11px] ${tokens.length > 6 ? "text-[var(--down)]" : "text-[var(--ink-3)]"}`} aria-hidden>{tokens.length}/6</span>
          </div>
          <button onClick={run} disabled={busy} className="btn btn-primary justify-center !px-7 disabled:opacity-60">{busy ? <><span className="inline-block animate-spin">↻</span> Fetching…</> : "Run screener"}</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="muted text-xs">Try:</span>
          {["TCS", "RELIANCE", "INFY", "HDFCBANK", "ITC"].map((x) => <button key={x} onClick={() => addExample(x)} className="chip num hover:!border-[var(--accent)] hover:!text-[var(--accent)]">+ {x}</button>)}
          {input && <button onClick={() => setInput("")} className="muted ml-auto text-xs hover:text-[var(--ink)]">Clear</button>}
        </div>
        <p role="status" aria-live="polite" className={`mt-3 text-[13px] ${status.kind === "ok" ? "sr-only" : ""} ${status.kind === "error" ? "text-[var(--down)]" : status.kind === "ok" ? "text-[var(--up)]" : "text-[var(--ink-3)]"}`}>{status.text}</p>
      </section>

      <div className="mt-5 space-y-5">
        {busy && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>{[0, 1, 2].map((i) => <div key={i} className="skeleton h-[250px]" />)}</div>}
        {!busy && !data.length && (
          <div className="card">
            <p className="eyebrow">How it works</p>
            <ol className="mt-4 grid gap-3 md:grid-cols-3">
              {[["1", "Enter symbols", "Type up to six NSE tickers, separated by commas."], ["2", "Get scored", "Each stock is checked against quality rules and given a score out of 10."], ["3", "Drill down", "Open any stock for financials, results, ownership, charts and red flags."]].map(([n, t, d]) => (
                <li key={n} className="flex gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-2)]/40 p-4"><span className="num grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-sm font-bold text-[var(--accent)]">{n}</span><span><b className="block text-[14px]">{t}</b><span className="muted mt-0.5 block text-[13px] leading-5">{d}</span></span></li>
              ))}
            </ol>
          </div>
        )}
        {!busy && data.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[var(--up)]">{status.kind === "ok" ? status.text : `Loaded ${data.length} symbol(s).`}</p>
              <div className="flex items-center gap-2"><span className="muted hidden text-xs sm:inline">Scroll →</span><button onClick={() => rail.current?.scrollBy({ left: -360, behavior: "smooth" })} aria-label="Scroll left" className="btn btn-ghost !px-3 !py-1.5">←</button><button onClick={() => rail.current?.scrollBy({ left: 360, behavior: "smooth" })} aria-label="Scroll right" className="btn btn-ghost !px-3 !py-1.5">→</button></div>
            </div>
            <div ref={rail} className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-4 [scrollbar-width:thin]" aria-label="Screened stocks">{data.map((s, i) => <StockCard key={`${s.symbol}-${i}`} s={s} i={i} active={active === i} onPick={() => pick(i)} />)}</div>
          </div>
        )}
        {!busy && <Compare data={data} active={active} onPick={pick} />}
        <div ref={detail} className="scroll-mt-24">{!busy && active !== null && data[active] && <Detail key={`${data[active].symbol}-${dark}`} s={data[active]} dark={dark} />}</div>
      </div>

      <section className="mt-8 grid gap-4 md:grid-cols-2" aria-label="Beginner guide">
        <div className="card"><h2 className="display text-xl">Quick beginner guide</h2><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-[var(--ink-2)]"><li><strong className="text-[var(--ink)]">Score:</strong> Higher means the stock meets more quality checks.</li><li><strong className="text-[var(--ink)]">P/E ratio:</strong> A lower number can mean the stock is more affordable.</li><li><strong className="text-[var(--ink)]">ROE:</strong> A higher number means the company is earning well from investor capital.</li></ol></div>
        <div className="card"><h2 className="display text-xl">Why these numbers matter</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-[var(--ink-2)]"><li>Current price tells you the market value now.</li><li>Dividend yield shows how much cash a company returns to shareholders.</li><li>Debt ratio and cash flow help you spot companies with healthier balance sheets.</li></ul></div>
      </section>
      <p className="muted mt-5 flex flex-wrap justify-between gap-2 text-xs"><span>Educational tool only · not investment advice · score is not a buy or sell signal · standalone shown only on fallback</span><span>{fetched}</span></p>
    </div>
  );
}
