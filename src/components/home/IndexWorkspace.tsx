"use client";

import type { ChartConfiguration } from "chart.js";
import { useMemo } from "react";
import { CHART, ChartCanvas } from "@/components/ui/ChartCanvas";
import type { Dict, Report, TechnicalData } from "./types";

const clean = (v: unknown) => (v ? String(v).split("(")[0].trim() : "—");
const num = (v: unknown) => parseFloat(String(v).split("(")[0].replace(/,/g, "").trim()) || 0;
const f2 = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

export const INDEX_DEFS = {
  nifty50: { title: "Nifty 50", analysisKey: "nifty50Analysis", tdKey: "nifty50", accent: "#5eead4" },
  bankNifty: { title: "Bank Nifty", analysisKey: "bankniftyAnalysis", tdKey: "bankNifty", accent: "#60a5fa" },
  sensex: { title: "BSE Sensex", analysisKey: "sensexAnalysis", tdKey: "sensex", accent: "#a78bfa" },
} as const;
export type IndexKey = keyof typeof INDEX_DEFS;

/** Support / resistance table: tone chip, level, and distance from the live price. */
function Levels({ sup, res, current }: { sup: number[]; res: number[]; current: number }) {
  const rows = [
    ...[2, 1, 0].map((i) => ({ k: `R${i + 1}`, v: res[i], tone: "down" })),
    { k: "Now", v: current, tone: "now" },
    ...[0, 1, 2].map((i) => ({ k: `S${i + 1}`, v: sup[i], tone: "up" })),
  ].filter((r) => r.v > 0);
  if (rows.length < 3) return <p className="muted text-xs">Levels unavailable.</p>;
  return (
    <ul className="space-y-1" aria-label="Support and resistance levels">
      {rows.map((r) => {
        const d = current && r.tone !== "now" ? ((r.v - current) / current) * 100 : null;
        const chip = r.tone === "down" ? "bg-[var(--down-soft)] text-[var(--down)]" : r.tone === "up" ? "bg-[var(--up-soft)] text-[var(--up)]" : "bg-[var(--accent)] text-[#03120f]";
        return (
          <li key={r.k} className={`flex items-center gap-3 rounded-lg px-1.5 py-1 ${r.tone === "now" ? "bg-[var(--accent-soft)]" : ""}`}>
            <span className={`num w-11 rounded-md py-0.5 text-center text-[11.5px] font-bold ${chip}`}>{r.k}</span>
            <span className="num flex-1 text-right text-[14px] font-medium">{f2(r.v)}</span>
            <span className={`num w-16 text-right text-[11.5px] ${d === null ? "muted" : d > 0 ? "up" : "down"}`}>{d === null ? "–" : `${d > 0 ? "+" : ""}${d.toFixed(2)}%`}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function priceChart(days: Dict[] | undefined, td: Dict | undefined, accent: string): ChartConfiguration | null {
  const ind = td?.indicators || {};
  const has = !!days?.length;
  const rows = has ? days!.filter((d) => typeof d.close === "number") : [];
  const labels = rows.length ? rows.map((d) => d.label) : ["Current"];
  const price = rows.length ? rows.map((d) => d.close) : [td?.currentPrice];
  const sma20 = rows.length ? rows.map((d) => d.sma20) : [ind.sma20];
  const ema9 = rows.length ? rows.map((d) => d.ema9) : [ind.ema9];
  const ema21 = rows.length ? rows.map((d) => d.ema21) : [ind.ema21];
  const all = [...price, ...sma20, ...ema9, ...ema21].filter((v) => typeof v === "number" && !Number.isNaN(v)) as number[];
  if (!all.length) return null;
  const line = (label: string, data: number[], color: string, dash: number[]) => ({ label, data, borderColor: color, backgroundColor: "transparent", borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 4, borderDash: dash, tension: 0.3 });
  return {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Close", data: price, borderColor: accent, backgroundColor: accent + "1f", fill: true, borderWidth: 2, pointBackgroundColor: accent, pointBorderColor: "#05070c", pointBorderWidth: 1, pointRadius: 2.5, pointHoverRadius: 5, tension: 0.3 },
        line("SMA 20", sma20, "#22d3ee", [5, 5]),
        line("EMA 9", ema9, "#a78bfa", [2, 2]),
        line("EMA 21", ema21, "#fb923c", [8, 3]),
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom", labels: { color: CHART.tick, font: { size: 11, family: CHART.font.family }, usePointStyle: true, pointStyle: "line", padding: 10, boxWidth: 18, boxHeight: 6 } },
        tooltip: {
          callbacks: {
            label: (c) => `${c.dataset.label}: ₹${Number(c.parsed.y).toFixed(2)}`,
            afterBody: (items) => {
              const i = items[0].dataIndex;
              return [price[i] > sma20[i] ? "▲ Above SMA 20" : "▼ Below SMA 20", ema9[i] > ema21[i] ? "▲ EMA 9 > EMA 21 (bullish)" : "▼ EMA 9 < EMA 21 (bearish)"];
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: CHART.tick, font: CHART.font } },
        y: { min: Math.min(...all) * 0.998, max: Math.max(...all) * 1.002, grid: { color: CHART.grid }, border: { display: false }, ticks: { color: CHART.tick, font: CHART.font, callback: (v) => "₹" + Number(v).toFixed(0) } },
      },
    },
  };
}

const TONE = { up: "var(--up)", down: "var(--down)", info: "var(--info)", violet: "var(--violet)", warn: "var(--warn)", accent: "var(--accent)" } as const;

function Tile({ icon, tone, label, value, sub, valueTone, visual, className = "" }: { icon: string; tone: keyof typeof TONE; label: string; value: React.ReactNode; sub?: React.ReactNode; valueTone?: string; visual?: React.ReactNode; className?: string }) {
  return (
    <div className={`group flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)]/40 px-3.5 py-3 transition-colors hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--line))] ${className}`}>
      <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[15px] font-bold" style={{ background: `color-mix(in srgb, ${TONE[tone]} 16%, transparent)`, color: TONE[tone] }}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="muted truncate text-[11px] font-medium">{label}</p>
        <p className={`num truncate text-[17px] font-semibold leading-tight ${valueTone || ""}`}>{value}</p>
        {sub ? <p className="muted truncate text-[11px]">{sub}</p> : null}
      </div>
      {visual}
    </div>
  );
}

/** Horizontal gauge track with a marker; zone ends at `lo` and `hi` (0–100). */
function Track({ pct, lo, hi, hot }: { pct: number; lo: number; hi: number; hot?: boolean }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="w-16 shrink-0" aria-hidden>
      <div className="relative h-1.5 rounded-full" style={{ background: hot ? "linear-gradient(90deg,var(--line),var(--down))" : "var(--line)" }}>
        <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--surface)] bg-[var(--ink)]" style={{ left: `${p}%` }} />
      </div>
      <div className="num muted mt-1 flex justify-between text-[9.5px]"><span>{lo}</span><span>{hi}</span></div>
    </div>
  );
}

const FLAG: Record<IndexKey, string> = { nifty50: "🇮🇳", bankNifty: "🇮🇳", sensex: "🇮🇳" };
const SUBTITLE: Record<IndexKey, string> = { nifty50: "NSE: NIFTY50", bankNifty: "NSE: BANKNIFTY", sensex: "BSE: SENSEX" };

/** Rich accordion header: identity, live price, analyst signal. */
export function IndexHead({ k, price, change, pct, asOf, signal }: { k: IndexKey; price?: number; change?: number; pct?: number; asOf?: string; signal?: string }) {
  const up = (change ?? 0) >= 0;
  const buy = /buy/i.test(signal || ""), sell = /sell/i.test(signal || "");
  return (
    <span className="flex w-full flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <span className="flex items-center gap-3">
        <span aria-hidden className="grid h-11 w-11 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface-2)] text-xl">{FLAG[k]}</span>
        <span>
          <span className="display block text-[26px] leading-none">{INDEX_DEFS[k].title}</span>
          <span className="eyebrow mt-1 block !text-[10px]">{SUBTITLE[k]} &nbsp;|&nbsp; Technical analysis</span>
        </span>
      </span>
      <span className="flex items-center gap-5">
        {price ? (
          <span className="text-right">
            <span className="num block text-[24px] font-semibold leading-none">₹{f2(price)}</span>
            {change !== undefined && <span className={`num text-[12.5px] font-medium ${up ? "up" : "down"}`}>{up ? "+" : ""}{f2(change)} ({up ? "+" : ""}{(pct ?? 0).toFixed(2)}%) {up ? "▲" : "▼"}</span>}
            {asOf && <span className="muted block text-[10.5px]">{asOf}</span>}
          </span>
        ) : null}
        {signal && (
          <span className={`flex flex-col items-center rounded-2xl px-4 py-1.5 ${buy ? "bg-[var(--up-soft)] text-[var(--up)]" : sell ? "bg-[var(--down-soft)] text-[var(--down)]" : "bg-[var(--surface-2)] text-[var(--ink-2)]"}`}>
            <span className="text-[15px] font-bold">{buy ? "↗ " : sell ? "↘ " : ""}{signal}</span>
            <span className="muted text-[10px]">Analyst signal</span>
          </span>
        )}
      </span>
    </span>
  );
}

export function IndexWorkspace({ def, report, technicalData, days, commentary }: { def: (typeof INDEX_DEFS)[IndexKey]; report: Report; technicalData?: TechnicalData; days?: Dict[]; commentary?: string }) {
  const n: Dict = report.overallMarketSummary?.[def.analysisKey] || {};
  const td: Dict | undefined = technicalData?.[def.tdKey];
  const ind: Dict = td?.indicators || {};
  const piv: Dict = td?.pivotPoints || {};
  const sup = ((n.supportLevels || []) as unknown[]).map(num);
  const res = ((n.resistanceLevels || []) as unknown[]).map(num);
  const current = num(n.currentPrice || td?.currentPrice);
  const config = useMemo(() => priceChart(days, td, def.accent), [days, td, def.accent]);
  const rsi = Number(n.rsi || ind.rsi14);
  const stoch = Number(ind.stochasticRSI);
  const sig: string = td?.overallSignal || "";
  const sigTone = sig.includes("Buy") ? "up" : sig.includes("Sell") ? "down" : "";
  const cp = Number(td?.currentPrice);
  const rel = (v: unknown) => (cp && v ? (cp > Number(v) ? "Price above" : "Price below") : "");
  const arrow = (v: unknown) => (cp && v ? <span className={`text-sm ${cp > Number(v) ? "up" : "down"}`} aria-hidden>{cp > Number(v) ? "▲" : "▼"}</span> : null);
  const hist = Number(ind.macd?.histogram);
  const cross = ind.ema9 && ind.ema21 ? (ind.ema9 > ind.ema21 ? "Bullish cross" : "Bearish cross") : "";
  const reads: [string, string, string | undefined][] = [
    ["RSI Analysis", "info", n.rsiSignal], ["MACD", "up", n.macdSignal], ["Moving Averages", "warn", n.movingAverages],
    ["Bollinger Bands & ATR", "violet", [n.bollingerBandPosition, n.atr].filter(Boolean).join(" ") || undefined],
  ];
  const shown = reads.filter(([, , t]) => t);
  const view = sigTone === "up" ? "Bullish" : sigTone === "down" ? "Bearish" : "Neutral";

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(270px,0.8fr)_minmax(0,2fr)]">
        <section aria-label={`${def.title} support and resistance`} className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)]/30 p-4">
          <p className="eyebrow mb-3 !text-[var(--ink-2)]">Support &amp; resistance</p>
          <Levels sup={sup} res={res} current={current} />
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--line)] pt-3 text-[12px]">
            <span className="muted">Momentum <b className="ml-1 rounded-md bg-[var(--surface)] px-2 py-0.5 text-[var(--ink)]">{n.momentum || "—"}</b></span>
            <span className="muted">Volatility <b className="ml-1 rounded-md bg-[var(--surface)] px-2 py-0.5 text-[var(--ink)]">{n.volatilityExpectation || "—"}</b></span>
          </div>
        </section>
        <section aria-label={`${def.title} chart`} className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)]/30 p-4">
          <div className="mb-1 flex items-center justify-between"><p className="eyebrow !text-[var(--ink-2)]">7-day trend</p><span className="chip chip-gold !py-0.5 !text-[11px]">1W</span></div>
          {config ? <ChartCanvas config={config} label={`${def.title} price versus moving averages`} className="h-[300px]" /> : <p className="muted py-16 text-center text-xs">Chart data unavailable.</p>}
        </section>
      </div>

      {td || n.rsi ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6" aria-label="Indicators">
            <Tile icon="∿" tone="info" label="RSI (14)" value={rsi ? rsi.toFixed(1) : "—"} sub={ind.rsiSignal} visual={<Track pct={rsi} lo={30} hi={70} />} />
            <Tile icon="≋" tone="violet" label="Stoch RSI" value={Number.isFinite(stoch) ? stoch : "—"} sub={ind.stochSignal} visual={<Track pct={stoch * 100} lo={20} hi={80} hot={stoch > 0.8} />} />
            <Tile icon="▮" tone="up" label="MACD" value={ind.macd?.signal || "—"} valueTone={hist > 0 ? "up" : "down"} sub={`Hist ${ind.macd?.histogram ?? "—"}`} visual={<span className={`text-sm ${hist > 0 ? "up" : "down"}`} aria-hidden>{hist > 0 ? "▲" : "▼"}</span>} />
            <Tile icon="↗" tone="info" label="SMA 20" value={ind.sma20 ?? "—"} sub={rel(ind.sma20)} visual={arrow(ind.sma20)} />
            <Tile icon="↗" tone="violet" label="SMA 50" value={ind.sma50 ?? "—"} sub={rel(ind.sma50)} visual={arrow(ind.sma50)} />
            <Tile icon="↗" tone="warn" label="EMA 9 / 21" value={`${ind.ema9 ?? "—"} / ${ind.ema21 ?? "—"}`} sub={cross} visual={<span className={`text-sm ${cross.startsWith("Bull") ? "up" : "down"}`} aria-hidden>{cross.startsWith("Bull") ? "▲" : "▼"}</span>} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile icon="◠" tone="violet" label="Bollinger Bands" value={ind.bollingerBands?.position || "—"} sub={`BW ${ind.bollingerBands?.bandwidth ?? "—"}%`} />
            <Tile icon="M" tone="warn" label="ATR (14)" value={ind.atr14 ?? "—"} sub="Average day range" />
            <Tile icon="◎" tone="down" label="Pivot point" value={piv.pivot || n.pivotPoint || "—"} sub={`S1 ${piv.s1 ?? "—"} · R1 ${piv.r1 ?? "—"}`} />
            <Tile icon="◉" tone="accent" label="Signal" value={sig || "—"} valueTone={sigTone} sub="Based on technical indicators" />
          </div>
        </>
      ) : <p className="muted text-xs">Indicator data unavailable.</p>}

      {(shown.length > 0 || commentary) && (
        <section aria-label="Analyst read" className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-2)]/30">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--accent-soft)] px-4 py-3">
            <div className="flex items-center gap-3">
              <span aria-hidden className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--up-soft)] text-[var(--up)]">▤</span>
              <div><p className="text-[16px] font-semibold leading-tight">Analyst read</p><p className="muted text-[11.5px]">Key technical insights for {def.title}</p></div>
            </div>
            <span className={`chip ${sigTone === "up" ? "chip-up" : sigTone === "down" ? "chip-down" : ""}`}>Overall view: <b>{view}</b></span>
          </div>
          {shown.length > 0 && (
            <div className="grid divide-y divide-[var(--line)] md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-4">
              {shown.map(([label, tone, text], i) => (
                <div key={label} className="p-4">
                  <p className="mb-1.5 flex items-center gap-2 text-[13.5px] font-semibold" style={{ color: TONE[tone as keyof typeof TONE] }}>
                    <span className="num grid h-6 w-6 place-items-center rounded-full text-[11px]" style={{ background: `color-mix(in srgb, ${TONE[tone as keyof typeof TONE]} 18%, transparent)` }}>{String(i + 1).padStart(2, "0")}</span>{label}
                  </p>
                  <p className="text-[12.5px] leading-5 text-[var(--ink-2)]">{text}</p>
                </div>
              ))}
            </div>
          )}
          {commentary && (
            <p className="m-3 rounded-xl bg-[var(--info)]/10 px-4 py-3 text-[12.5px] leading-5 text-[var(--ink-2)]"><b className="mr-2 text-[var(--ink)]">Summary:</b>{commentary}</p>
          )}
        </section>
      )}
    </div>
  );
}

export { clean, num };
