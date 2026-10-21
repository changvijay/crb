"use client";

import { useMemo, useState } from "react";
import { Treemap, TipRow, type TmGroup } from "@/components/market/Treemap";
import { Col, DataTable, Empty, ErrorBox, Loading, Logo, Marquee, PageHero, Rank, SectionCard, Tabs } from "@/components/market/Kit";
import { fmtCapUS, fmtCount, fmtPct, fmtPrice, fmtVolUSD, tone } from "@/lib/fmt-market";
import { safeHref } from "@/lib/safe-url";
import { useApi } from "@/lib/useApi";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Q = Record<string, any>;
export type Dash = { success: boolean; error?: string; timestamp?: string; markets?: { cached?: boolean; data?: Q[] }; trending?: { cached?: boolean; data?: Q[] }; gainers?: { cached?: boolean; data?: Q[] }; losers?: { data?: Q[] }; mostActive?: { cached?: boolean; data?: Q[] }; mostVolume?: { data?: Q[] }; fiftyTwo?: { cached?: boolean; nearHighs?: Q[]; nearLows?: Q[] } };

const chg = (v: number | null | undefined) => <span className={`num font-semibold ${tone(v)}`}>{fmtPct(v)}</span>;
const coinCell = (c: Q) => (
  <div className="flex items-center gap-2.5"><Logo src={c.image} alt={c.symbol} round /><div className="min-w-0"><div className="max-w-[180px] truncate font-semibold">{c.name}</div><div className="muted text-[11px] uppercase">{c.symbol}</div></div></div>
);

/** Original tiering: top 50 by market cap into 4 cap tiers, weighted 24h change, tile size = sqrt(market cap). */
function tierGroups(coins: Q[]): TmGroup[] {
  const top = coins.slice(0, 50);
  const ORDER = ["Mega Cap (>$50B)", "Large Cap ($10B–$50B)", "Mid Cap ($1B–$10B)", "Small Cap (<$1B)"];
  const tiers: Record<string, Q[]> = Object.fromEntries(ORDER.map((t) => [t, []]));
  top.forEach((c) => {
    const mc = c.marketCap || 0;
    tiers[mc >= 50e9 ? ORDER[0] : mc >= 10e9 ? ORDER[1] : mc >= 1e9 ? ORDER[2] : ORDER[3]].push(c);
  });
  return ORDER.filter((t) => tiers[t].length).map((name) => {
    const items = tiers[name];
    const total = items.reduce((s, c) => s + (c.marketCap || 0), 0);
    const avg = total > 0 ? items.reduce((s, c) => s + (c.changePercent24h || 0) * (c.marketCap || 0), 0) / total : 0;
    return {
      name, avg,
      items: items.map((c) => ({ symbol: c.symbol as string, name: c.name as string, pct: c.changePercent24h as number, value: Math.sqrt(c.marketCap || 1), data: { image: c.image || "", price: c.price, pct7d: c.changePercent7d, cap: c.marketCap } })),
    };
  });
}

function pairCols(metric: "tradeCount" | "quoteVolume" | "priceChangePercent", rows: Q[]): Col<Q>[] {
  const max = Math.max(0, ...rows.map((p) => Math.abs(p[metric] || 0)));
  const label = metric === "tradeCount" ? "Trades" : "USD volume";
  return [
    { head: "#", cell: (_, i) => <Rank i={i} /> },
    { head: "Pair", cell: (p) => <div><div className="font-semibold">{p.symbol}</div><div className="muted text-[11px]">/ USDT</div></div> },
    { head: "Price", align: "right", cell: (p) => <span className="num">{fmtPrice(p.lastPrice)}</span> },
    { head: "24h %", align: "right", cell: (p) => chg(p.priceChangePercent) },
    { head: "24h high", align: "right", cell: (p) => <span className="num muted">{fmtPrice(p.high24h)}</span> },
    { head: "24h low", align: "right", cell: (p) => <span className="num muted">{fmtPrice(p.low24h)}</span> },
    {
      head: label,
      cell: (p) => (
        <div className="flex w-44 items-center gap-3">
          <div className="h-1.5 flex-1 rounded-full bg-[var(--surface-2)]"><div className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)]" style={{ width: `${max > 0 ? Math.min(100, (Math.abs(p[metric] || 0) / max) * 100) : 0}%` }} /></div>
          <span className="num muted w-16 text-right text-[11.5px]">{metric === "tradeCount" ? fmtCount(p[metric]) : fmtVolUSD(p[metric])}</span>
        </div>
      ),
    },
    { head: "USD vol", align: "right", cell: (p) => <span className="num">{fmtVolUSD(p.quoteVolume)}</span> },
  ];
}

function weekCols(isHighs: boolean): Col<Q>[] {
  const bar = (dist: number | null, color: string, l: string) => {
    const pct = dist != null ? Math.max(0, Math.min(100, 100 + dist)) : 50;
    return (
      <div className="w-40"><div className="h-1.5 rounded-full bg-[var(--surface-2)]"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} /></div><div className="num muted mt-1 flex justify-between text-[10px]"><span>{l}</span><span>{pct.toFixed(1)}%</span></div></div>
    );
  };
  const distCell = (d: number | null) => (d != null ? <span className={`num font-semibold ${d >= 0 ? "up" : "down"}`}>{fmtPct(d)}</span> : "–");
  return isHighs
    ? [
        { head: "#", cell: (_: Q, i: number) => <Rank i={i} /> }, { head: "Coin", cell: coinCell },
        { head: "Price", align: "right", cell: (c: Q) => <span className="num">{fmtPrice(c.price)}</span> },
        { head: "24h %", align: "right", cell: (c: Q) => chg(c.changePercent24h) },
        { head: "52W high (ATH)", align: "right", cell: (c: Q) => <span className="num">{c.ath != null ? fmtPrice(c.ath) : "–"}</span> },
        { head: "From 52W H", align: "right", cell: (c: Q) => distCell(c.pctFromHigh ?? null) },
        { head: "Proximity", cell: (c: Q) => bar(c.pctFromHigh ?? null, "var(--up)", "ATH") },
        { head: "Mkt cap", align: "right", cell: (c: Q) => <span className="num muted">{fmtCapUS(c.marketCap)}</span> },
      ]
    : [
        { head: "#", cell: (_: Q, i: number) => <Rank i={i} /> }, { head: "Coin", cell: coinCell },
        { head: "Price", align: "right", cell: (c: Q) => <span className="num">{fmtPrice(c.price)}</span> },
        { head: "24h %", align: "right", cell: (c: Q) => chg(c.changePercent24h) },
        { head: "1Y return", align: "right", cell: (c: Q) => distCell(c.pctFrom1yAgo ?? null) },
        { head: "Depth", cell: (c: Q) => bar(c.pctFrom1yAgo ?? null, "var(--down)", "−100%") },
        { head: "Mkt cap", align: "right", cell: (c: Q) => <span className="num muted">{fmtCapUS(c.marketCap)}</span> },
      ];
}

export function Crypto({ initial }: { initial?: Dash | null }) {
  const [tick, setTick] = useState(0);
  const { data, error, loading } = useApi<Dash>("crypto", tick, undefined, initial);
  const [gl, setGl] = useState<"gainers" | "losers">("gainers");
  const [act, setAct] = useState<"active" | "volume">("active");
  const [wk, setWk] = useState<"highs" | "lows">("highs");
  const [q, setQ] = useState("");

  const ok = data?.success ? data : undefined;
  const failMsg = error ?? (data && !data.success ? data.error || "API error" : undefined);
  const coins = useMemo(() => ok?.markets?.data ?? [], [ok]);
  const tiers = useMemo(() => tierGroups(coins), [coins]);
  const term = q.trim().toLowerCase();
  const filtered = useMemo(() => (term ? coins.filter((c) => [c.name, c.symbol, c.id].join(" ").toLowerCase().includes(term)) : coins), [coins, term]);
  const maxCap = useMemo(() => Math.max(0, ...filtered.map((c) => c.marketCap || 0)), [filtered]);

  const marketCols: Col<Q>[] = [
    { head: "#", align: "right", cell: (c, i) => <Rank i={(c.rank ? c.rank - 1 : i)} /> },
    { head: "Coin", cell: coinCell },
    { head: "Price", align: "right", cell: (c) => <span className="num">{fmtPrice(c.price)}</span> },
    { head: "24h %", align: "right", cell: (c) => chg(c.changePercent24h) },
    { head: "7d %", align: "right", cell: (c) => (c.changePercent7d != null ? chg(c.changePercent7d) : <span className="muted">–</span>) },
    { head: "Market cap", align: "right", cell: (c) => <span className="num">{fmtCapUS(c.marketCap)}</span> },
    { head: "Volume (24h)", cell: (c) => (<div className="flex w-44 items-center gap-3"><div className="h-1.5 flex-1 rounded-full bg-[var(--surface-2)]"><div className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)]" style={{ width: `${maxCap > 0 ? Math.min(100, ((c.marketCap || 0) / maxCap) * 100) : 0}%` }} /></div><span className="num muted w-16 text-right text-[11.5px]">{fmtVolUSD(c.volume24h)}</span></div>) },
  ];

  const mq = coins.slice(0, 20).map((c) => ({ key: c.id ?? c.symbol, node: (<><Logo src={c.image} alt={c.symbol} round /><span className="font-semibold uppercase">{c.symbol}</span><span className="num">{fmtPrice(c.price)}</span><span className={`num font-semibold ${tone(c.changePercent24h)}`}>{fmtPct(c.changePercent24h)}</span></>) }));

  const pairSet = (key: "gainers" | "losers") => (key === "gainers" ? ok?.gainers?.data : ok?.losers?.data) ?? [];
  const actRows = (act === "active" ? ok?.mostActive?.data : ok?.mostVolume?.data) ?? [];

  return (
    <>
      <PageHero
        eyebrow="Digital assets"
        title={<>Crypto dashboard — live prices, gainers, trending &amp; <span className="grad-text">heatmap</span></>}
        intro={<>Live cryptocurrency tracking on <strong>Chang Research Base (CRB)</strong>: Bitcoin and Ethereum prices, the top 100 coins, trending cryptocurrencies, top gainers and losers, most active pairs, highest volume, and 52-week highs and lows.</>}
        right={<>
          <button onClick={() => setTick((t) => t + 1)} disabled={loading} className="btn btn-ghost !py-2 disabled:opacity-50"><span className={loading ? "inline-block animate-spin" : ""}>↻</span> Refresh</button>
          <span className="muted text-xs" suppressHydrationWarning>{ok?.timestamp ? "Updated " + new Date(ok.timestamp).toLocaleTimeString() : "–"}</span>
        </>}
      />

      <div className="container-x space-y-4 pb-6">
        <Marquee items={mq} label="Top 20 coins" />
        {failMsg && <ErrorBox msg={failMsg} />}

        <SectionCard title="Crypto heatmap" sub="Top 50 by market cap · grouped by tier · coloured by 24h % change" cached={ok ? false : undefined}>
          {loading && !ok ? <Loading h={380} /> : tiers.length ? (
            <Treemap
              label="Top 50 coins heatmap"
              groups={tiers}
              heightFor={(w) => Math.min(560, Math.max(380, Math.round(w * 0.48)))}
              tile={(it, w, h) => (
                <>
                  {safeHref(it.data.image as string) && w >= 44 && h >= 44 && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="tm-logo !rounded-full" src={safeHref(it.data.image as string)!} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.display = "none")} />
                  )}
                  {w >= 32 && h >= 22 && <div className="tm-sym">{it.symbol}</div>}
                  {w >= 36 && h >= 36 && <div className="tm-pct">{fmtPct(it.pct)}</div>}
                  {w >= 56 && h >= 56 && <div className="tm-price">{fmtPrice(it.data.price)}</div>}
                </>
              )}
              tooltip={(it) => (<><div className="font-semibold uppercase">{it.symbol}</div><div className="muted text-[11px]">{it.name}</div><TipRow k="Price" v={fmtPrice(it.data.price)} /><TipRow k="24h %" v={fmtPct(it.pct)} tone={it.pct >= 0 ? "up" : "down"} />{it.data.pct7d != null && <TipRow k="7d %" v={fmtPct(it.data.pct7d)} tone={Number(it.data.pct7d) >= 0 ? "up" : "down"} />}{Number(it.data.cap) > 0 && <TipRow k="Mkt cap" v={fmtCapUS(it.data.cap)} />}</>)}
            />
          ) : <Empty>No heatmap data</Empty>}
        </SectionCard>

        <SectionCard
          title="Top 100 by market cap"
          cached={ok?.markets?.cached}
          right={<div className="flex items-center gap-3"><span className="chip">{filtered.length} coins</span><label className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm focus-within:border-[var(--accent)]">⌕<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or symbol" autoComplete="off" aria-label="Search coins" className="w-44 bg-transparent outline-none" /></label></div>}
        >
          {loading && !ok ? <Loading h={420} /> : <DataTable key={term} label="Top 100 coins" rows={filtered} cols={marketCols} pager empty="No market data available." />}
        </SectionCard>

        <SectionCard title="Trending" cached={ok?.trending?.cached}>
          {loading && !ok ? <Loading h={180} /> : !(ok?.trending?.data ?? []).length ? <Empty>No trending data available.</Empty> : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {(ok?.trending?.data ?? []).map((c, i) => {
                const spark = safeHref(c.sparkline);
                return (
                  <article key={c.id ?? i} className="card card-hover !p-4">
                    <p className="eyebrow !text-[10px]">{i === 0 ? "🔥" : i === 1 ? "🚀" : "📈"} Trending #{i + 1}{c.rank ? ` · Rank #${c.rank}` : ""}</p>
                    <div className="mt-3 flex items-center gap-2.5"><Logo src={c.image} alt={c.symbol} round /><div className="min-w-0"><div className="truncate text-[13px] font-semibold">{c.name}</div><div className="muted text-[11px] uppercase">{c.symbol}</div></div></div>
                    <p className="num mt-3 text-[15px] font-medium">{c.price != null ? fmtPrice(Number(c.price)) : "–"}</p>
                    {c.changePercent24h != null && <p className={`num text-xs font-semibold ${tone(c.changePercent24h)}`}>{c.changePercent24h > 0 ? "▲" : c.changePercent24h < 0 ? "▼" : ""}{fmtPct(c.changePercent24h)}</p>}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {spark && <img src={spark} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.display = "none")} className="mt-3 h-10 w-full object-contain opacity-90" />}
                  </article>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Gainers & losers" sub="Binance USDT pairs" cached={ok?.gainers?.cached} right={<Tabs label="Gainers or losers" value={gl} onChange={setGl} tabs={[["gainers", "📈 Top gainers"], ["losers", "📉 Top losers"]]} />}>
          {loading && !ok ? <Loading /> : <DataTable key={gl} label={gl} rows={pairSet(gl)} cols={pairCols("quoteVolume", pairSet(gl))} pager />}
        </SectionCard>

        <SectionCard title="Most active & highest volume" cached={ok?.mostActive?.cached} right={<Tabs label="Most active or volume" value={act} onChange={setAct} tabs={[["active", "⚡ Most active"], ["volume", "💰 Most volume"]]} />}>
          {loading && !ok ? <Loading /> : <DataTable key={act} label={act} rows={actRows} cols={pairCols(act === "active" ? "tradeCount" : "quoteVolume", actRows)} pager />}
        </SectionCard>

        <SectionCard title="52-week highs & lows" cached={ok?.fiftyTwo?.cached} right={<Tabs label="52-week highs or lows" value={wk} onChange={setWk} tabs={[["highs", "⬆️ Near 52W high"], ["lows", "⬇️ Near 52W low"]]} />}>
          {loading && !ok ? <Loading /> : <DataTable key={wk} label="52-week" rows={(wk === "highs" ? ok?.fiftyTwo?.nearHighs : ok?.fiftyTwo?.nearLows) ?? []} cols={weekCols(wk === "highs")} pager />}
        </SectionCard>
      </div>
    </>
  );
}
