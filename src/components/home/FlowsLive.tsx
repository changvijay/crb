"use client";

import type { ChartConfiguration } from "chart.js";
import { useMemo, useState } from "react";
import { CHART, ChartCanvas } from "@/components/ui/ChartCanvas";
import { Spark } from "@/components/ui/Spark";
import { fmtCr, fmtCrFull, fmtDay, fmtMonth, fmtNum } from "@/lib/format";
import type { Dict } from "./types";

/* ───────────────────────── FII / DII ───────────────────────── */
export type FlowPayload = { days: Dict[]; daysChron: Dict[]; monthsChron: Dict[]; years: Dict[] };
export function parseFlows(raw: Dict | undefined): FlowPayload {
  const days: Dict[] = Array.isArray(raw?.day) ? raw!.day : [];
  const months: Dict[] = Array.isArray(raw?.month) ? raw!.month : [];
  return { days, daysChron: [...days].reverse(), monthsChron: [...months].reverse(), years: Array.isArray(raw?.year) ? raw!.year : [] };
}

type Tab = "7d" | "30d" | "monthly" | "yearly";
const TABS: [Tab, string][] = [["7d", "7 days"], ["30d", "30 days"], ["monthly", "Monthly"], ["yearly", "Yearly"]];
const SERIES = [{ name: "FII", sub: "Foreign institutional", color: "#60a5fa" }, { name: "DII", sub: "Domestic institutional", color: "#34d399" }, { name: "Net", sub: "FII + DII combined", color: "#5eead4" }] as const;
const tone = (v: number) => (v >= 0 ? "up" : "down");

function barConfig(labels: string[], values: number[], label: string): ChartConfiguration {
  return {
    type: "bar",
    data: { labels, datasets: [{ label, data: values, backgroundColor: values.map((v) => (v >= 0 ? "rgba(52,211,153,0.8)" : "rgba(251,113,133,0.8)")), borderRadius: 4, borderSkipped: false }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${label}: ₹${fmtCrFull(c.raw)} Cr` } } },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 9, family: CHART.font.family }, color: CHART.tick, maxRotation: 50, minRotation: 0 } },
        y: { grid: { color: CHART.grid }, border: { display: false }, ticks: { font: { size: 9, family: CHART.font.family }, color: CHART.tick, callback: (v) => fmtCr(Number(v)) } },
      },
    },
  };
}

function Charts({ records, labelFn, keys, window }: { records: Dict[]; labelFn: (r: Dict) => string; keys: [string, string, string]; window: string }) {
  const configs = useMemo(() => {
    const labels = records.map(labelFn);
    return keys.map((k, i) => barConfig(labels, records.map((r) => Number(r[k]) || 0), SERIES[i].name));
  }, [records, labelFn, keys]);
  if (!records.length) return <p className="muted py-10 text-center text-sm">No data available for this range</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {SERIES.map((s, i) => (
        <div key={s.name} className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)]/40 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.name} flows</p>
          <p className="muted mb-3 text-[11px]">{s.sub} · {window} · ₹ Cr</p>
          <ChartCanvas config={configs[i]} label={`${s.name} flows ${window}`} className="h-[210px]" />
        </div>
      ))}
    </div>
  );
}

const dayLabel = (r: Dict) => fmtDay(r.date);
const monthLabel = (r: Dict) => fmtMonth(r.month);
const KD: [string, string, string] = ["fii", "dii", "netFlow"];
const KM: [string, string, string] = ["fiiTotal", "diiTotal", "netFlowTotal"];

export function FlowsPanel({ data }: { data: FlowPayload }) {
  const [tab, setTab] = useState<Tab>("7d");
  const sevenDays = useMemo(() => data.daysChron.slice(-7), [data]);
  const latest = data.days[0];
  const fii = latest?.fii ?? 0, dii = latest?.dii ?? 0, net = latest?.netFlow ?? fii + dii;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {([["Latest FII", fii, SERIES[0].color], ["Latest DII", dii, SERIES[1].color], ["Net (latest day)", net, SERIES[2].color]] as const).map(([l, v, c]) => (
          <div key={l} className="card !p-5">
            <p className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-[var(--ink-3)]"><span className="h-2 w-2 rounded-full" style={{ background: c }} />{l}</p>
            <p className={`num mt-2 text-2xl font-medium ${tone(v)}`}>₹{fmtCrFull(v)} Cr</p>
            <p className="muted mt-1 text-xs">{latest?.date ? `As of ${fmtDay(latest.date)}` : "—"}</p>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="seg mb-5" role="tablist" aria-label="FII/DII range">
          {TABS.map(([id, l]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{l}</button>)}
        </div>
        <div role="tabpanel">
          {tab === "7d" && <Charts records={sevenDays} labelFn={dayLabel} keys={KD} window="7 days" />}
          {tab === "30d" && <Charts records={data.daysChron} labelFn={dayLabel} keys={KD} window="30 days" />}
          {tab === "monthly" && <Charts records={data.monthsChron} labelFn={monthLabel} keys={KM} window="monthly" />}
          {tab === "yearly" && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead><tr className="border-b border-[var(--line)] text-left text-[11px] uppercase tracking-wider text-[var(--ink-3)]"><th className="py-2.5">Year</th><th>FII total</th><th>DII total</th><th>Net flow</th><th>Months</th></tr></thead>
                <tbody>
                  {data.years.map((y) => (
                    <tr key={y.year} className="border-b border-[var(--line)]/60">
                      <td className="py-3 font-medium">{y.year}</td>
                      <td className={`num ${tone(y.fiiTotal)}`}>₹{fmtCrFull(y.fiiTotal)} Cr</td>
                      <td className={`num ${tone(y.diiTotal)}`}>₹{fmtCrFull(y.diiTotal)} Cr</td>
                      <td className={`num font-semibold ${tone(y.netFlowTotal)}`}>₹{fmtCrFull(y.netFlowTotal)} Cr</td>
                      <td className="muted">{y.monthCount ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.years.length && <p className="muted py-8 text-center text-sm">No data available for this range</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Dashboard tile: latest numbers + last 7 sessions of net flow as bars. */
export function FlowTile({ data, onOpen }: { data: FlowPayload | null; onOpen: () => void }) {
  const rows = data?.daysChron.slice(-7) ?? [];
  const latest = data?.days[0];
  const max = Math.max(1, ...rows.map((r) => Math.abs(Number(r.netFlow ?? r.fii + r.dii) || 0)));
  return (
    <section className="card card-hover flex h-full flex-col" aria-label="FII and DII flows">
      <div className="flex items-center justify-between"><p className="eyebrow">Institutional flows</p><button onClick={onOpen} className="text-xs font-semibold text-[var(--accent)] hover:underline">Details →</button></div>
      {!data ? <div className="skeleton mt-4 h-32" aria-hidden /> : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {([["FII", latest?.fii], ["DII", latest?.dii], ["Net", latest?.netFlow ?? (latest?.fii ?? 0) + (latest?.dii ?? 0)]] as const).map(([l, v]) => (
              <div key={l}><p className="muted text-[11px]">{l}</p><p className={`num text-[17px] font-medium ${tone(Number(v) || 0)}`}>{fmtCrFull(v)}</p></div>
            ))}
          </div>
          <p className="muted mt-1 text-[11px]">₹ Cr · {latest?.date ? fmtDay(latest.date) : "—"}</p>
          <div className="mt-auto flex h-20 items-center gap-1.5 pt-4" role="img" aria-label="Net flow, last seven sessions">
            {rows.map((r, i) => {
              const v = Number(r.netFlow ?? r.fii + r.dii) || 0;
              return (
                <div key={i} className="flex h-full flex-1 flex-col justify-center" title={`${fmtDay(r.date)}: ₹${fmtCrFull(v)} Cr`}>
                  <div className="flex h-1/2 items-end">{v > 0 && <div className="w-full rounded-t bg-[var(--up)]" style={{ height: `${(v / max) * 100}%` }} />}</div>
                  <div className="flex h-1/2 items-start">{v < 0 && <div className="w-full rounded-b bg-[var(--down)]" style={{ height: `${(Math.abs(v) / max) * 100}%` }} />}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

/* ───────────────────────── Intraday ───────────────────────── */
export type Chart = Dict & { code: string; name: string; color: string; currency?: string; currentPrice?: number; change?: number; changePercent?: number; dayHigh?: number; dayLow?: number; trend?: string; chartPoints?: Dict[] };
export type IntradayResp = { success: boolean; error?: string; timestamp?: string; data?: { charts?: Chart[]; summary?: { tradingSession?: string } } };

export const SESSION: Record<string, string> = { MARKET: "Market open", PRE_MARKET: "Pre-market", POST_MARKET: "Post-market", CLOSED: "Market closed" };
const px = (c: Chart) => (c.currency === "INR" ? "₹" : "");
const chg = (c: Chart) => (c.change == null ? "" : `${c.change >= 0 ? "+" : ""}${fmtNum(c.change)} (${c.change >= 0 ? "+" : ""}${Number(c.changePercent).toFixed(2)}%)`);

function lineConfig(c: Chart): ChartConfiguration {
  const points = c.chartPoints || [];
  const labels = points.map((p) => p.timeLabel || String(p.time).slice(11, 16));
  const prices = points.map((p) => p.price as number);
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const pad = Math.max(10, (hi - lo) * 0.25);
  const color = c.trend === "bullish" ? "#34d399" : c.trend === "bearish" ? "#fb7185" : c.color;
  return {
    type: "line",
    data: { labels, datasets: [{ label: c.name, data: prices, borderColor: color, backgroundColor: color + "22", fill: true, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.25 }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 400 }, interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (i) => ` ${c.name}: ${px(c)}${fmtNum(i.raw)}` } } },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: CHART.tick, font: CHART.font, maxRotation: 0, maxTicksLimit: 5 } },
        y: { min: Math.floor(lo - pad), max: Math.ceil(hi + pad), grid: { color: CHART.grid }, border: { display: false }, ticks: { color: CHART.tick, font: CHART.font, callback: (v) => px(c) + Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 }) } },
      },
    },
  };
}

export function LivePanel({ charts, session, updated, busy, error, onRefresh }: { charts: Chart[] | null; session: string; updated: string; busy: boolean; error?: string; onRefresh: () => void }) {
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {session && <span className={`chip ${session === "MARKET" ? "chip-up" : ""}`}>{SESSION[session] || session}</span>}
        {updated && <span className="muted text-xs">{updated}</span>}
        <button onClick={onRefresh} disabled={busy} className="btn btn-ghost !px-3 !py-1.5 disabled:opacity-50" aria-label="Refresh intraday charts"><span className={busy ? "inline-block animate-spin" : ""}>↻</span> Refresh</button>
      </div>
      {error && <div role="alert" className="card mb-4 text-sm text-[var(--down)]">⚠ {error}</div>}
      {!charts ? (
        !error && <div className="grid gap-4 lg:grid-cols-3" aria-hidden>{[0, 1, 2].map((i) => <div key={i} className="skeleton h-[300px]" />)}</div>
      ) : !charts.length ? <p className="muted text-center text-sm">No intraday chart data available</p> : (
        <div className="grid gap-4 lg:grid-cols-3">
          {charts.map((c) => (
            <article key={c.code} className="card" style={{ borderTop: `3px solid ${c.color}` }}>
              <header className="flex items-baseline justify-between"><h3 className="text-sm font-semibold">{c.name}</h3><span className="chip">{c.trend || "neutral"}</span></header>
              <p className="num mt-2 text-2xl font-medium">{px(c)}{fmtNum(c.currentPrice)}</p>
              <p className={`num text-xs font-semibold ${(c.changePercent || 0) >= 0 ? "up" : "down"}`}>{chg(c)}</p>
              <p className="num muted mt-1 text-[11px]">H {px(c)}{fmtNum(c.dayHigh)} · L {px(c)}{fmtNum(c.dayLow)}</p>
              <div className="mt-4">{c.chartPoints?.length ? <ChartCanvas config={lineConfig(c)} label={`${c.name} intraday price chart`} className="h-[190px]" /> : <p className="muted py-12 text-center text-sm">No intraday data</p>}</div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

/** Dashboard tile for one index: live price + sparkline; click opens its workspace tab. */
export function LiveIndexTile({ chart, levels, onOpen }: { chart?: Chart; levels?: { s1?: string; r1?: string }; onOpen: () => void }) {
  if (!chart) return <div className="skeleton h-[190px]" aria-hidden />;
  const up = (chart.changePercent || 0) >= 0;
  return (
    <button onClick={onOpen} className="card card-hover rise w-full text-left" aria-label={`Open ${chart.name} analysis`}>
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[13px] font-semibold">{chart.name}</p><p className="muted text-[11px]">{SESSION[chart.session as string] || "Intraday"}</p></div>
        <span className={`chip ${up ? "chip-up" : "chip-down"}`}>{up ? "▲" : "▼"} {Math.abs(chart.changePercent || 0).toFixed(2)}%</span>
      </div>
      <p className="num mt-3 text-[28px] font-medium leading-none">{px(chart)}{fmtNum(chart.currentPrice)}</p>
      <p className={`num mt-1 text-xs font-semibold ${up ? "up" : "down"}`}>{chg(chart)}</p>
      <div className="mt-3"><Spark values={(chart.chartPoints || []).map((p) => p.price as number)} up={up} label={chart.name} /></div>
      {levels && (levels.s1 || levels.r1) && (
        <div className="num mt-3 flex justify-between border-t border-[var(--line)] pt-3 text-[11.5px]">
          <span className="up">S1 {levels.s1 || "—"}</span><span className="muted">report levels</span><span className="down">R1 {levels.r1 || "—"}</span>
        </div>
      )}
    </button>
  );
}
