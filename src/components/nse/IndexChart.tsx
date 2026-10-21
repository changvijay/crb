"use client";

import { ColorType, CrosshairMode, createChart, type IChartApi, type ISeriesApi, type MouseEventParams, type Time } from "lightweight-charts";
import { useCallback, useEffect, useRef, useState } from "react";
import { getData } from "@/lib/api";

const COLORS = ["#2962ff", "#2eb872", "#ff6d00", "#9c27b0", "#00bcd4", "#f44336", "#ffd600", "#e91e63", "#8bc34a", "#ff5722", "#3f51b5", "#009688", "#795548", "#607d8b", "#673ab7", "#4caf50", "#ff9800", "#cddc39", "#2196f3", "#ad1457"];
const DEFAULTS = ["NIFTY 50", "NIFTY BANK", "NIFTY IT", "SENSEX", "S&P 500", "NASDAQ 100"];
const ALL = [
  "NIFTY 50", "SENSEX", "NIFTY BANK", "NIFTY IT", "NIFTY AUTO", "NIFTY FMCG", "NIFTY PHARMA", "NIFTY METAL", "NIFTY REALTY", "NIFTY ENERGY",
  "NIFTY MIDCAP 100", "NIFTY SMALLCAP 100", "NIFTY NEXT 50", "NIFTY FIN SERVICE", "NIFTY PSU BANK", "NIFTY PRIVATE BANK",
  "S&P 500", "NASDAQ 100", "NASDAQ COMPOSITE", "DOW JONES", "RUSSELL 2000", "PHLX SEMICONDUCTOR", "NYSE FANG+", "US 10Y TREASURY YIELD",
];
const INDIA = ALL.slice(0, 12);
const US = ALL.slice(16);
const PRESETS: [string, string, string[]][] = [
  ["broad", "Broad market", ["NIFTY 50", "SENSEX", "NIFTY BANK", "NIFTY MIDCAP 100", "S&P 500", "DOW JONES"]],
  ["global", "India vs US", ["NIFTY 50", "NIFTY BANK", "NIFTY IT", "S&P 500", "NASDAQ 100", "DOW JONES"]],
  ["banking", "Banking", ["NIFTY BANK", "NIFTY FIN SERVICE", "NIFTY PSU BANK", "NIFTY PRIVATE BANK", "S&P 500"]],
  ["tech", "Tech", ["NIFTY IT", "NASDAQ 100", "NASDAQ COMPOSITE", "PHLX SEMICONDUCTOR", "NYSE FANG+"]],
  ["sectoral", "Sectoral", ["NIFTY IT", "NIFTY PHARMA", "NIFTY AUTO", "NIFTY FMCG", "NIFTY METAL", "NIFTY REALTY", "NIFTY ENERGY"]],
  ["midcap", "Mid & small", ["NIFTY MIDCAP 100", "NIFTY SMALLCAP 100", "NIFTY NEXT 50", "RUSSELL 2000"]],
  ["india", "India", INDIA],
  ["us", "US", US],
  ["all", "All", ALL],
];
const PERIODS: [number, string][] = [[30, "1M"], [90, "3M"], [180, "6M"], [365, "1Y"], [730, "2Y"]];
const MAX = 8;

type Proxy = { ticker: string; name: string; exact: boolean };
type Entry = { key: string; label: string; data: { time: string; value: number }[]; proxy?: Proxy };
/** A proxied series is an ETF, not the index itself, and is labelled as such everywhere it appears. */
const shownLabel = (e: { label: string; proxy?: unknown }) => (e.proxy ? `${e.label} (ETF)` : e.label);
const colorOf = (key: string, i = 0) => COLORS[(ALL.indexOf(key) >= 0 ? ALL.indexOf(key) : i) % COLORS.length];
type BizDay = { year: number; month: number; day: number };
const toTime = (t: unknown): Date | null => {
  if (typeof t === "number") return new Date(t * 1000);
  if (typeof t === "string") return new Date(t);
  const b = t as Partial<BizDay> | null;
  return b && b.year != null && b.month != null && b.day != null ? new Date(b.year, b.month - 1, b.day) : null;
};

function themeColors() {
  const dark = document.documentElement.dataset.theme !== "light";
  return { bg: dark ? "#0b0f18" : "#ffffff", grid: dark ? "#161c2b" : "#eef1f6", txt: dark ? "#8892a4" : "#6b7280", bdr: dark ? "#1f2638" : "#e2e7ef" };
}

export function IndexChart() {
  const box = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<Record<string, ISeriesApi<"Line">>>({});
  const [selected, setSelected] = useState<string[]>(DEFAULTS);
  const [preset, setPreset] = useState<string | null>("broad");
  const [days, setDays] = useState(365);
  const [panel, setPanel] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [thin, setThin] = useState<string[]>([]);
  const [proxied, setProxied] = useState<{ label: string; proxy: Proxy }[]>([]);
  const [legend, setLegend] = useState<{ date: string; rows: { key: string; val: number | null; color: string }[] } | null>(null);

  // Create the chart once; keep colours in sync with the theme.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const t = themeColors();
    const chart = createChart(el, {
      width: el.clientWidth, height: 460,
      layout: { background: { type: ColorType.Solid, color: t.bg }, textColor: t.txt },
      grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: t.bdr, scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: t.bdr, timeVisible: true, secondsVisible: false },
      handleScroll: true, handleScale: true,
    });
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth }));
    ro.observe(el);
    const mo = new MutationObserver(() => {
      const c = themeColors();
      chart.applyOptions({ layout: { background: { type: ColorType.Solid, color: c.bg }, textColor: c.txt }, grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } }, rightPriceScale: { borderColor: c.bdr }, timeScale: { borderColor: c.bdr } });
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const onMove = (p: MouseEventParams<Time>) => {
      const has = p.time && p.seriesData.size > 0;
      if (!has) return setLegend(null);
      const d = toTime(p.time);
      const rows = Object.entries(seriesRef.current).map(([key, s], i) => {
        const pt = p.seriesData.get(s) as { value?: number } | undefined;
        return { key, val: pt?.value ?? null, color: colorOf(key, i) };
      }).sort((a, b) => (b.val ?? -Infinity) - (a.val ?? -Infinity));
      setLegend({ date: d ? d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "", rows });
    };
    chart.subscribeCrosshairMove(onMove);
    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      ro.disconnect();
      mo.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = {};
    };
  }, []);

  // Fetch + render whenever the selection or period changes (same request as the original).
  useEffect(() => {
    if (!selected.length) return;
    const ctl = new AbortController();
    getData<{ success: boolean; error?: string; data: Entry[] }>("idxCompare", { indices: selected.join(","), days: String(days) }, ctl.signal)
      .then((json) => {
        if (!json.success) throw new Error(json.error || "API error");
        const chart = chartRef.current;
        if (!chart) return;
        Object.values(seriesRef.current).forEach((s) => chart.removeSeries(s));
        seriesRef.current = {};
        json.data.forEach((entry, i) => {
          if (!entry.data || entry.data.length < 2) return;
          const first = entry.data[0].value;
          const series = chart.addLineSeries({
            color: colorOf(entry.key, i), lineWidth: 2, title: shownLabel(entry),
            priceFormat: { type: "custom", formatter: (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`, minMove: 0.01 },
            crosshairMarkerVisible: true, crosshairMarkerRadius: 5, lastValueVisible: true, priceLineVisible: false,
          });
          series.setData(entry.data.map((d) => ({ time: d.time as Time, value: first === 0 ? 0 : +((d.value / first - 1) * 100).toFixed(3) })));
          seriesRef.current[entry.key] = series;
        });
        chart.timeScale().fitContent();
        setEntries(json.data);
        setError("");
        setThin(json.data.filter((e) => !e.data || e.data.length < 10).map((e) => e.label));
        setProxied(json.data.flatMap((e) => (e.proxy ? [{ label: e.label, proxy: e.proxy }] : [])));
        setLoading(false);
      })
      .catch((e: Error) => {
        if (e.name === "AbortError") return;
        setError(e.message);
        setLoading(false);
      });
    return () => ctl.abort();
  }, [selected, days]);

  const choose = useCallback((names: string[], p: string | null) => {
    setSelected(names.slice(0, MAX));
    setPreset(p);
    setLoading(true);
  }, []);
  const toggle = (name: string) => {
    setPreset(null);
    setLoading(true);
    setSelected((s) => (s.includes(name) ? s.filter((k) => k !== name) : s.length >= MAX ? s : [...s, name]));
  };

  const valid = entries.filter((e) => e.data?.length >= 2);
  const cards = valid.map((e, i) => {
    const first = e.data[0].value, last = e.data[e.data.length - 1].value;
    return { e, ret: first === 0 ? 0 : (last / first - 1) * 100, last, color: colorOf(e.key, i) };
  }).sort((a, b) => b.ret - a.ret);
  const maxAbs = Math.max(...cards.map((c) => Math.abs(c.ret)), 1);
  const times = valid.map((e) => [e.data[0].time, e.data[e.data.length - 1].time]);
  const fmtD = (t: string) => new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
  const range = times.length ? `${fmtD(times.map((t) => t[0]).sort()[0])} – ${fmtD(times.map((t) => t[1]).sort().pop()!)}` : "";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Index presets">
        {PRESETS.map(([id, label, names]) => (
          <button key={id} onClick={() => choose(names, id)} aria-pressed={preset === id} className={`chip transition ${preset === id ? "chip-gold !border-[var(--accent)]" : "hover:border-[var(--accent)]"}`}>{label}</button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative">
          <button onClick={() => setPanel((o) => !o)} aria-expanded={panel} className="btn btn-ghost !py-2">{selected.length} {selected.length === 1 ? "Index" : "Indices"} ▾</button>
          {panel && (
            <div className="card absolute left-0 top-12 z-30 max-h-[340px] w-72 overflow-auto !p-2" role="listbox" aria-label="Choose indices (max 8)">
              <div className="flex gap-2 p-2"><button className="chip" onClick={() => choose(ALL.slice(0, MAX), null)}>First 8</button><button className="chip" onClick={() => choose(["NIFTY 50"], null)}>Clear</button><span className="muted ml-auto text-[11px]">max {MAX}</span></div>
              {ALL.map((name, i) => {
                const on = selected.includes(name);
                const maxed = !on && selected.length >= MAX;
                return (
                  <label key={name} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] ${maxed ? "opacity-40" : "cursor-pointer hover:bg-[var(--surface-2)]"}`}>
                    <input type="checkbox" checked={on} disabled={maxed} onChange={() => toggle(name)} />
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />{name}
                  </label>
                );
              })}
            </div>
          )}
        </div>
        <div className="seg" role="group" aria-label="Period">
          {PERIODS.map(([d, l]) => <button key={d} aria-pressed={days === d} onClick={() => { setDays(d); setLoading(true); }}>{l}</button>)}
        </div>
        <button onClick={() => chartRef.current?.timeScale().fitContent()} className="btn btn-ghost !py-2" title="Fit all data in view">⊞ Fit view</button>
        {range && <span className="muted text-xs">{range}</span>}
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-[var(--line)]">
        <div ref={box} className="h-[460px] w-full" />
        {loading && <div className="absolute inset-0 grid place-items-center bg-[var(--bg)]/60 backdrop-blur-[2px]"><span className="animate-spin text-2xl text-[var(--accent)]">↻</span></div>}
        {legend && (
          <div className="pointer-events-none absolute left-3 top-3 z-10 min-w-[190px] rounded-xl border border-white/10 bg-[#0b0f18]/90 p-3 text-[12px] text-white shadow-xl backdrop-blur">
            <div className="mb-1.5 text-[11px] text-white/60">{legend.date}</div>
            {legend.rows.map((r) => (
              <div key={r.key} className="flex items-center gap-2 py-0.5"><span className="h-2 w-2 rounded-full" style={{ background: r.color }} /><span className="flex-1 truncate">{proxied.some((x) => x.label === r.key) ? `${r.key} (ETF)` : r.key}</span><span className="num font-semibold" style={{ color: r.val == null ? "rgba(255,255,255,.45)" : r.val >= 0 ? "#2eb872" : "#f44336" }}>{r.val == null ? "—" : `${r.val >= 0 ? "+" : ""}${r.val.toFixed(2)}%`}</span></div>
            ))}
          </div>
        )}
      </div>

      {!error && proxied.length > 0 && <p role="status" className="mt-3 text-sm text-[var(--ink-3)]">The data provider has no index history for some sectors, so these lines show the return of an NSE-listed ETF that tracks the index: {proxied.map((x) => `${x.label} → ${x.proxy.name}${x.proxy.exact ? "" : " (tracks a neighbouring index, not an exact match)"}`).join("; ")}.</p>}
      {!error && thin.length > 0 && <p role="status" className="mt-3 text-sm text-[var(--ink-3)]">No price history or tracking ETF is available for: {thin.join(", ")}. They are left off the chart.</p>}
      {error && <p role="alert" className="mt-3 text-sm text-[var(--down)]">⚠️ Chart unavailable: {error}</p>}

      {cards.length > 0 && (
        <>
          <p className="eyebrow mb-3 mt-6">Performance ranking</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map(({ e, ret, last, color }, rank) => (
              <div key={e.key} className="stat relative overflow-hidden" style={{ borderLeft: `3px solid ${color}` }}>
                <span className={`chip absolute right-3 top-3 !text-[10px] ${rank < 3 ? "chip-gold" : ""}`}>#{rank + 1}</span>
                <label>{shownLabel(e)}</label>
                <div className="num v">{last.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</div>
                {e.proxy && <div className="muted truncate text-[10.5px]" title={e.proxy.name}>ETF price · {e.proxy.name}</div>}
                <div className={`num text-[13px] font-semibold ${ret >= 0 ? "up" : "down"}`}>{ret >= 0 ? "+" : ""}{ret.toFixed(2)}% <span className="muted font-normal">({days}d)</span></div>
                <div className="absolute bottom-0 left-0 h-[3px]" style={{ width: `${(Math.abs(ret) / maxAbs) * 100}%`, background: ret >= 0 ? "var(--up)" : "var(--down)", opacity: 0.55 }} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
