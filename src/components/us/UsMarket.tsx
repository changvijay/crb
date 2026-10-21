"use client";

import { useMemo, useState } from "react";
import { Treemap, TipRow, type TmGroup, type TmItem } from "@/components/market/Treemap";
import { Col, DataTable, Empty, ErrorBox, Loading, Logo, Marquee, PageHero, Rank, SectionCard, Tabs } from "@/components/market/Kit";
import { fmtCapUS, fmtPct, fmtUS, fmtVolShort, sign, tone } from "@/lib/fmt-market";
import { useApi } from "@/lib/useApi";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Q = Record<string, any>;
export type Dash = { success: boolean; error?: string; timestamp?: string; indices?: { cached?: boolean; data?: Q[] }; gainers?: { cached?: boolean; quotes?: Q[] }; losers?: { quotes?: Q[] }; mostActive?: { cached?: boolean; quotes?: Q[] }; fiftyTwo?: { cached?: boolean; nearHighs?: Q[]; nearLows?: Q[] }; heatmap?: { cached?: boolean; sectors?: Record<string, Q[]> } };

const logo = (s: string) => `https://assets.parqet.com/logos/symbol/${encodeURIComponent(s)}?format=jpg`;
const ORDER = ["Major Indices", "Sector Indices", "Volatility & Rates", "Commodities & FX", "Other"];

const stockCell = (s: Q) => (
  <div className="flex items-center gap-2.5">
    <Logo src={s.symbol && !String(s.symbol).startsWith("^") ? logo(s.symbol) : null} alt={s.symbol} />
    <div className="min-w-0"><div className="font-semibold">{s.symbol}</div><div className="muted max-w-[200px] truncate text-[11px]">{s.name || "–"}</div></div>
  </div>
);
const pctCell = (v: number) => <span className={`num font-semibold ${tone(v)}`}>{sign(v)}{fmtUS(v)}%</span>;

const stockCols: Col<Q>[] = [
  { head: "#", cell: (_, i) => <Rank i={i} /> },
  { head: "Stock", cell: stockCell },
  { head: "Price", align: "right", cell: (s) => <span className="num">${fmtUS(s.price)}</span> },
  { head: "Change", align: "right", cell: (s) => <span className={`num ${tone(s.changePercent)}`}>{sign(s.change)}{fmtUS(s.change)}</span> },
  { head: "Chg %", align: "right", cell: (s) => pctCell(s.changePercent) },
  { head: "Volume", align: "right", cell: (s) => <span className="num muted">{fmtVolShort(s.volume)}</span> },
  { head: "Mkt cap", align: "right", cell: (s) => <span className="num">{fmtCapUS(s.marketCap)}</span> },
  { head: "P/E", align: "right", cell: (s) => <span className="num muted">{fmtUS(s.pe, 1)}</span> },
];

function weekCols(isHighs: boolean): Col<Q>[] {
  return [
    { head: "#", cell: (_, i) => <Rank i={i} /> },
    { head: "Stock", cell: stockCell },
    { head: "Price", align: "right", cell: (s) => <span className="num">${fmtUS(s.price)}</span> },
    { head: "Today %", align: "right", cell: (s) => pctCell(s.changePercent) },
    { head: isHighs ? "From 52H" : "From 52L", align: "right", cell: (s) => (isHighs ? <span className="num up">{fmtUS(s.pctFrom52High)}%</span> : <span className="num down">+{fmtUS(s.pctFrom52Low)}%</span>) },
    {
      head: "52W range",
      cell: (s) => {
        const lo = s.fiftyTwoWeekLow || 0, hi = s.fiftyTwoWeekHigh || 0, r = hi - lo;
        const pct = r > 0 ? Math.min(100, ((s.price - lo) / r) * 100) : 50;
        return (
          <div className="w-40">
            <div className="h-1.5 rounded-full bg-[var(--surface-2)]"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: isHighs ? "var(--up)" : "var(--down)" }} /></div>
            <div className="num muted mt-1 flex justify-between text-[10px]"><span>{fmtUS(lo)}</span><span>{fmtUS(hi)}</span></div>
          </div>
        );
      },
    },
    { head: "Volume", align: "right", cell: (s) => <span className="num muted">{fmtVolShort(s.volume)}</span> },
  ];
}

/** Original sector grouping: only stocks with market cap, weighted change, sectors sorted by total cap. */
function sectorGroups(sectors: Record<string, Q[]>): TmGroup[] {
  return Object.entries(sectors)
    .map(([name, stocks]) => {
      const items = (stocks || []).filter((s) => Number(s.marketCap) > 0).map((s) => ({ symbol: s.symbol as string, name: (s.name as string) || "", pct: Number(s.changePercent) || 0, value: Number(s.marketCap) || 0, data: { price: Number(s.price) || 0 } }));
      const total = items.reduce((a, s) => a + s.value, 0);
      const avg = total > 0 ? items.reduce((a, s) => a + s.pct * s.value, 0) / total : 0;
      return { name, items, total, avg };
    })
    .filter((g) => g.items.length)
    .sort((a, b) => b.total - a.total);
}

function indexGroups(all: Q[]): TmGroup[] {
  const groups: Record<string, Q[]> = {};
  all.forEach((i) => (groups[i.group || "Other"] ||= []).push(i));
  const names = [...ORDER.filter((g) => groups[g]?.length), ...Object.keys(groups).filter((g) => !ORDER.includes(g) && groups[g].length)];
  return names.map((name) => {
    const items = groups[name].map((i) => ({ symbol: (i.shortName || i.symbol || "—") as string, name: (i.name || i.shortName || "—") as string, pct: Number(i.changePercent || 0), value: 1, data: { price: Number(i.price || 0), change: Number(i.change || 0) } }));
    return { name, items, avg: items.reduce((s, c) => s + c.pct, 0) / (items.length || 1) };
  });
}

const tileBase = (it: TmItem, w: number, h: number, extra: (it: TmItem, w: number, h: number) => React.ReactNode, logoOn: boolean) => (
  <>
    {logoOn && !it.symbol.startsWith("^") && w >= 44 && h >= 44 && (
      // eslint-disable-next-line @next/next/no-img-element
      <img className="tm-logo" src={logo(it.symbol)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.display = "none")} />
    )}
    {w >= 34 && h >= 24 && <div className="tm-sym">{it.symbol}</div>}
    {w >= 38 && h >= 38 && <div className="tm-pct">{it.pct == null || Number.isNaN(it.pct) ? "—" : `${it.pct >= 0 ? "+" : ""}${it.pct.toFixed(2)}%`}</div>}
    {extra(it, w, h)}
  </>
);

export function UsMarket({ initial }: { initial?: Dash | null }) {
  const [tick, setTick] = useState(0);
  const { data, error, loading } = useApi<Dash>("us", tick, undefined, initial);
  const [gl, setGl] = useState<"gainers" | "losers">("gainers");
  const [wk, setWk] = useState<"highs" | "lows">("highs");
  const [q, setQ] = useState("");

  const ok = data?.success ? data : undefined;
  const failMsg = error ?? (data && !data.success ? data.error || "API error" : undefined);
  const indices = useMemo(() => ok?.indices?.data ?? [], [ok]);
  const sectors = useMemo(() => (ok?.heatmap?.sectors ? sectorGroups(ok.heatmap.sectors) : []), [ok]);
  const term = q.trim().toLowerCase();
  const filtered = useMemo(() => (term ? indices.filter((i) => [i.name, i.shortName, i.symbol, i.group, i.marketState].filter(Boolean).join(" ").toLowerCase().includes(term)) : indices), [indices, term]);
  const idxGroups = useMemo(() => indexGroups(filtered), [filtered]);

  const state = (indices.find((i) => i.symbol === "^GSPC") || indices[0])?.marketState || "";
  const badge = state === "REGULAR" ? ["Market open", "chip-up"] : state === "PRE" ? ["Pre-market", "chip-gold"] : state === "POST" ? ["After hours", "chip-gold"] : indices.length ? ["Market closed", ""] : ["Checking…", ""];
  const mq = indices.map((i, n) => ({ key: `${i.symbol}${n}`, node: (<><span className="text-[var(--ink-2)]">{i.shortName || i.symbol}</span><span className="num font-medium">{fmtUS(i.price)}</span><span className={`num font-semibold ${tone(i.changePercent)}`}>{sign(i.changePercent)}{fmtUS(i.changePercent)}%</span></>) }));

  return (
    <>
      <PageHero
        eyebrow="Wall Street"
        title={<>US market dashboard — equities, gainers &amp; <span className="grad-text">sector heatmap</span></>}
        intro={<>Real-time US stock market tracking on <strong>Chang Research Base (CRB)</strong>. Monitor S&amp;P 500 sector heatmaps, Nasdaq 100, Dow Jones, US 10-year Treasury yields, crude oil, gold and FX, with top gainers, losers, most active stocks and 52-week highs and lows.</>}
        right={<>
          <span className={`chip ${badge[1]}`}><span className="live-dot h-1.5 w-1.5 rounded-full bg-current" />{badge[0]}</span>
          <button onClick={() => setTick((t) => t + 1)} disabled={loading} className="btn btn-ghost !py-2 disabled:opacity-50"><span className={loading ? "inline-block animate-spin" : ""}>↻</span> Refresh</button>
          <span className="muted text-xs" suppressHydrationWarning>{ok?.timestamp ? "Updated " + new Date(ok.timestamp).toLocaleTimeString() : "–"}</span>
        </>}
      />

      <div className="container-x space-y-4 pb-6">
        <Marquee items={mq} label="US indices" />

        {failMsg && <ErrorBox msg={failMsg} />}

        <SectionCard title="S&P 500 sector heatmap" sub="Market cap weighted by sector · coloured by % change" cached={ok?.heatmap?.cached}>
          {loading && !ok ? <Loading h={480} /> : sectors.length ? (
            <Treemap
              label="S&P 500 sector heatmap"
              groups={sectors}
              heightFor={(w) => Math.min(680, Math.max(480, Math.round(w * 0.56)))}
              tile={(it, w, h) => tileBase(it, w, h, (x, ww, hh) => ww >= 56 && hh >= 56 && <div className="tm-price">{fmtCapUS(x.value)}</div>, true)}
              tooltip={(it) => (<><div className="font-semibold">{it.symbol}</div><div className="muted text-[11px]">{it.name}</div><TipRow k="Price" v={`$${Number(it.data.price).toFixed(2)}`} /><TipRow k="Change" v={fmtPct(it.pct)} tone={it.pct >= 0 ? "up" : "down"} />{it.value > 0 && <TipRow k="Mkt cap" v={fmtCapUS(it.value)} />}</>)}
            />
          ) : <Empty>Heatmap data unavailable</Empty>}
        </SectionCard>

        <SectionCard
          title="All US indices"
          sub="Grouped by category · coloured by % change"
          cached={ok?.indices?.cached}
          right={<div className="flex items-center gap-3"><span className="chip">{term ? `${filtered.length} of ${indices.length}` : `${indices.length || "—"} total`}</span><label className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm focus-within:border-[var(--accent)]">⌕<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search indices" autoComplete="off" aria-label="Search indices" className="w-40 bg-transparent outline-none" /></label></div>}
        >
          {loading && !ok ? <Loading h={480} /> : !indices.length ? <Empty>No index data available.</Empty> : !filtered.length ? <Empty>No matching indices found.</Empty> : (
            <Treemap
              label="US indices heatmap"
              groups={idxGroups}
              heightFor={(w) => Math.min(680, Math.max(480, Math.round(w * 0.56)))}
              tile={(it, w, h) => tileBase(it, w, h, (x, ww, hh) => ww >= 54 && hh >= 54 && <div className="tm-price">${fmtUS(x.data.price)}</div>, false)}
              tooltip={(it) => (<><div className="font-semibold">{it.symbol}</div><div className="muted text-[11px]">{it.name}</div><TipRow k="Price" v={`$${Number(it.data.price).toFixed(2)}`} /><TipRow k="Change" v={fmtPct(it.pct)} tone={it.pct >= 0 ? "up" : "down"} /></>)}
            />
          )}
        </SectionCard>

        <SectionCard title="Gainers & losers" cached={ok?.gainers?.cached} right={<Tabs label="Gainers or losers" value={gl} onChange={setGl} tabs={[["gainers", "📈 Top gainers"], ["losers", "📉 Top losers"]]} />}>
          {loading && !ok ? <Loading /> : <DataTable label={gl === "gainers" ? "Top gainers" : "Top losers"} rows={(gl === "gainers" ? ok?.gainers?.quotes : ok?.losers?.quotes) ?? []} cols={stockCols} />}
        </SectionCard>

        <SectionCard title="Most active stocks" cached={ok?.mostActive?.cached}>
          {loading && !ok ? <Loading /> : (() => {
            const quotes = ok?.mostActive?.quotes ?? [];
            const max = Math.max(0, ...quotes.map((s) => s.volume || 0));
            const cols: Col<Q>[] = [
              { head: "#", cell: (_, i) => <Rank i={i} /> },
              { head: "Stock", cell: stockCell },
              { head: "Price", align: "right", cell: (s) => <span className="num">${fmtUS(s.price)}</span> },
              { head: "Chg %", align: "right", cell: (s) => pctCell(s.changePercent) },
              { head: "Volume", cell: (s) => (<div className="flex w-48 items-center gap-3"><div className="h-1.5 flex-1 rounded-full bg-[var(--surface-2)]"><div className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)]" style={{ width: `${max > 0 ? ((s.volume || 0) / max) * 100 : 0}%` }} /></div><span className="num muted w-16 text-right text-[11.5px]">{fmtVolShort(s.volume)}</span></div>) },
              { head: "Mkt cap", align: "right", cell: (s) => <span className="num">{fmtCapUS(s.marketCap)}</span> },
            ];
            return <DataTable label="Most active stocks" rows={quotes} cols={cols} />;
          })()}
        </SectionCard>

        <SectionCard title="52-week highs & lows" cached={ok?.fiftyTwo?.cached} right={<Tabs label="52-week highs or lows" value={wk} onChange={setWk} tabs={[["highs", "⬆️ Near 52W high"], ["lows", "⬇️ Near 52W low"]]} />}>
          {loading && !ok ? <Loading /> : <DataTable label="52-week" rows={(wk === "highs" ? ok?.fiftyTwo?.nearHighs : ok?.fiftyTwo?.nearLows) ?? []} cols={weekCols(wk === "highs")} />}
        </SectionCard>
      </div>
    </>
  );
}
