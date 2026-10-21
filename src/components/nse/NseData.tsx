"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Empty, ErrorBox, Loading, PageHero, SectionCard } from "@/components/market/Kit";
import type { DataKey, DataParams } from "@/lib/data-keys";
import { useApi } from "@/lib/useApi";
import { Bhav } from "./Bhav";
import { NseHeatmap, WorldHeatmap } from "./Heatmaps";
import { IndexChart } from "./IndexChart";
import { GainersLosers, Ipo, IndicesTable, MostActive, Penny, PriceBand, Week52 } from "./Tables";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Q = Record<string, any>;
type Resp<T = Q> = T & { success: boolean; error?: string };

const SECTIONS: [string, string][] = [
  ["sec-heatmap", "Heatmap"], ["sec-bhavcopy", "BhavCopy"], ["sec-idx-compare", "Index chart"], ["sec-world", "World"], ["sec-gainers", "Gainers / Losers"],
  ["sec-week52", "52-Week"], ["sec-penny", "Penny stocks"], ["sec-circuits", "Price band"], ["sec-mostactive", "Most active"], ["sec-indices", "Indices"], ["sec-ipo", "IPO / GMP"],
];

function useOk<T extends Q>(key: DataKey, initial?: unknown, params?: DataParams, refetch = false) {
  const r = useApi<Resp<T>>(key, 0, params, initial as Resp<T> | null | undefined, refetch);
  const ok = r.data?.success ? r.data : undefined;
  const failMsg = r.error ?? (r.data && !r.data.success ? r.data.error || "API error" : undefined);
  return { ok, failMsg, loading: r.loading && !r.data };
}

function SectionNav() {
  const [active, setActive] = useState(SECTIONS[0][0]);
  useEffect(() => {
    const els = SECTIONS.map(([id]) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver((entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)), { rootMargin: "-120px 0px -60% 0px", threshold: 0 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return (
    <nav aria-label="Sections" className="sticky top-[92px] z-20 -mx-1 overflow-x-auto px-1 py-2 lg:top-9">
      <div className="seg">
        {SECTIONS.map(([id, label]) => (
          <button key={id} aria-pressed={active === id} onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{label}</button>
        ))}
      </div>
    </nav>
  );
}

function Stat({ label, a, b, aTone = "up", bTone = "down", aMark = "↑", bMark = "↓" }: { label: string; a: ReactLike; b?: ReactLike; aTone?: string; bTone?: string; aMark?: string; bMark?: string }) {
  return (
    <div className="stat">
      <label>{label}</label>
      <div className="flex items-baseline gap-4"><span className={`num v ${aTone}`}><span className="mr-1 text-xs">{aMark}</span>{a}</span>{b !== undefined && <span className={`num v ${bTone}`}><span className="mr-1 text-xs">{bMark}</span>{b}</span>}</div>
    </div>
  );
}
type ReactLike = string | number;

export type NseInitial = Partial<Record<"heat" | "gl" | "wk" | "penny" | "band" | "ipo" | "active" | "bhav" | "world" | "idx", unknown>>;

export function NseData({ initial = {} }: { initial?: NseInitial }) {
  const heat = useOk<{ data: Q[] }>("nseHeat", initial.heat);
  const gl = useOk<{ gainers: Q[]; losers: Q[] }>("nseGainers", initial.gl);
  const wk = useOk<{ high: Q[]; low: Q[] }>("nse52", initial.wk);
  const penny = useOk<{ stocks: Q[] }>("nsePenny", initial.penny);
  const band = useOk<{ stocks: Q[]; summary: Q }>("nseBand", initial.band);
  const ipo = useOk<{ ipoList: Q[]; totalRecords: number }>("nseIpo", initial.ipo);
  const active = useOk<Q>("nseActive", initial.active);
  const bhav = useOk<{ stocks: Q[]; latestDate?: string; count?: number }>("nseBhav", initial.bhav, undefined, true);
  const world = useOk<{ data: { regions: { indices: Q[] }[] } }>("world", initial.world);
  const [exchange, setExchange] = useState<"NSE" | "BSE">("NSE");
  const idx = useOk<{ indices: Q[] }>("nseIndices", exchange === "NSE" ? initial.idx : undefined, { exchange });

  const worldIdx = useMemo(() => (world.ok?.data?.regions ?? []).flatMap((r) => r.indices), [world.ok]);
  const vg: Q[] = active.ok?.volumeGainers?.right?.data ?? [];
  const rs: Q[] = active.ok?.recoveryStocks?.right?.data ?? [];
  const indices = idx.ok?.indices ?? [];
  const ipoList = ipo.ok?.ipoList ?? [];
  const s = band.ok?.summary ?? {};

  return (
    <>
      <PageHero
        eyebrow="Indian market · NSE"
        title={<>Live NSE market data, <span className="grad-text">heatmap</span> &amp; technicals</>}
        intro={<>Real-time NSE dashboard on <strong>Chang Research Base (CRB)</strong>: market heatmap, BhavCopy technicals, index comparison, global indices, gainers and losers, 52-week highs and lows, circuit breakers, IPO grey-market premium and more.</>}
        right={<Link href="/fundamental-stock-analysis" className="btn btn-primary">Start fundamental analysis →</Link>}
      />

      <div className="container-x space-y-4 pb-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6" role="region" aria-label="Market summary">
          <Stat label="Gainers / Losers" a={gl.ok?.gainers?.length ?? "—"} b={gl.ok?.losers?.length ?? "—"} />
          <Stat label="52W High / Low" a={wk.ok?.high?.length ?? "—"} b={wk.ok?.low?.length ?? "—"} />
          <Stat label="Upper / Lower" a={band.ok ? Number(s.UPPER || 0) : "—"} b={band.ok ? Number(s.LOWER || 0) : "—"} />
          <Stat label="IPOs open" a={ipo.ok ? ipoList.filter((i) => i.status === "Open").length : "—"} aTone="text-[var(--info)]" aMark="🚀" />
          <Stat label="Indices up / down" a={idx.ok ? indices.filter((i) => i.price_change_per >= 0).length : "—"} b={idx.ok ? indices.filter((i) => i.price_change_per < 0).length : "—"} />
          <Stat label="Volume / Recovery" a={active.ok ? vg.length : "—"} b={active.ok ? rs.length : "—"} aMark="V" bMark="R" bTone="muted" />
        </div>

        <SectionNav />

        <div id="sec-heatmap" className="scroll-mt-32">
          <SectionCard title="Market heatmap" sub="Market cap weighted by sector · coloured by % change">
            {heat.failMsg ? <ErrorBox msg={heat.failMsg} /> : heat.loading ? <Loading h={480} /> : <NseHeatmap data={heat.ok?.data ?? []} />}
          </SectionCard>
        </div>

        <div id="sec-bhavcopy" className="scroll-mt-32">
          <SectionCard title="BhavCopy — EQ technical analysis" sub="RSI, MACD, Bollinger, delivery and volume breakouts for every NSE equity">
            {bhav.loading ? <Loading h={420} /> : bhav.failMsg ? <Empty>No BhavCopy data — run a sync from the admin panel.</Empty> : <Bhav stocks={bhav.ok?.stocks ?? []} latestDate={bhav.ok?.latestDate} total={bhav.ok?.count} />}
          </SectionCard>
        </div>

        <div id="sec-idx-compare" className="scroll-mt-32">
          <SectionCard title="Index comparison" sub="Normalised % return · compare up to 8 Indian and US indices">
            <IndexChart />
          </SectionCard>
        </div>

        <div id="sec-world" className="scroll-mt-32">
          <SectionCard title="Global market indices" sub="Grouped by country · priority indices weigh more">
            {world.failMsg ? <Empty>World indices unavailable: {world.failMsg}</Empty> : world.loading ? <Loading h={480} /> : <WorldHeatmap indices={worldIdx} />}
          </SectionCard>
        </div>

        <div id="sec-gainers" className="scroll-mt-32 space-y-3"><SectionTitle t="Gainers & losers" />{gl.failMsg ? <ErrorBox msg={gl.failMsg} /> : gl.loading ? <Loading h={320} /> : <GainersLosers gainers={gl.ok?.gainers ?? []} losers={gl.ok?.losers ?? []} />}</div>
        <div id="sec-week52" className="scroll-mt-32 space-y-3"><SectionTitle t="52-week highs & lows" />{wk.failMsg ? <ErrorBox msg={wk.failMsg} /> : wk.loading ? <Loading h={320} /> : <Week52 high={wk.ok?.high ?? []} low={wk.ok?.low ?? []} />}</div>

        <div id="sec-penny" className="scroll-mt-32">
          <SectionCard title="Penny stocks" right={<span className="chip">{penny.ok?.stocks?.length ?? 0}</span>}>
            {penny.failMsg ? <ErrorBox msg={penny.failMsg} /> : penny.loading ? <Loading h={320} /> : <Penny stocks={penny.ok?.stocks ?? []} />}
          </SectionCard>
        </div>

        <div id="sec-circuits" className="scroll-mt-32 space-y-3"><SectionTitle t="Price band hitters" />{band.failMsg ? <ErrorBox msg={band.failMsg} /> : band.loading ? <Loading h={320} /> : <PriceBand stocks={band.ok?.stocks ?? []} />}</div>
        <div id="sec-mostactive" className="scroll-mt-32 space-y-3"><SectionTitle t="Most active stocks" />{active.failMsg ? <ErrorBox msg={active.failMsg} /> : active.loading ? <Loading h={320} /> : <MostActive volumeGainers={vg} recovery={rs} />}</div>

        <div id="sec-indices" className="scroll-mt-32">
          <SectionCard title="NSE & BSE indices" sub="Source: Research360">
            {idx.failMsg ? <Empty>Indices unavailable: {idx.failMsg}</Empty> : <IndicesTable indices={indices} exchange={exchange} onExchange={setExchange} loading={idx.loading} />}
          </SectionCard>
        </div>

        <div id="sec-ipo" className="scroll-mt-32">
          <SectionCard title="IPO & grey market premium">
            {ipo.failMsg ? <ErrorBox msg={ipo.failMsg} /> : ipo.loading ? <Loading h={320} /> : <Ipo list={ipoList} total={ipo.ok?.totalRecords ?? ipoList.length} />}
          </SectionCard>
        </div>
      </div>
    </>
  );
}

const SectionTitle = ({ t }: { t: string }) => <h2 className="section-title !text-[22px] pt-2">{t}</h2>;
