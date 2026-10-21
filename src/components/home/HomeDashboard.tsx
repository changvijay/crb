"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Gauge } from "@/components/ui/Gauge";
import { Modal } from "@/components/ui/Modal";
import { fmtReportDate } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { FlowsPanel, FlowTile, LiveIndexTile, LivePanel, parseFlows, type Chart, type IntradayResp } from "./FlowsLive";
import { INDEX_DEFS, IndexHead, IndexWorkspace, clean, type IndexKey } from "./IndexWorkspace";
import { GlobalIndices, type Resp } from "./GlobalIndices";
import { Reveal } from "./Reveal";
import { EventsPanel, GlobalPanel, OptionsPanel, RisksPanel } from "./ReportPanels";
import type { Dict, RecentReports, Report, SevenDay, TechnicalData } from "./types";

type Section = "options" | "events" | "global" | "risks" | "flows" | "live";
type Target = IndexKey | Section;
const INDEX_LABEL: Record<IndexKey, string> = { nifty50: "Nifty 50", bankNifty: "Bank Nifty", sensex: "Sensex" };
// Same order as the original page: flows → intraday charts → the three index reports → outlook/options → global → events → risks.
const SECTIONS: [string, string][] = [
  ["indices", "World indices"],
  ["flows", "FII / DII"], ["live", "Intraday"], ["nifty50", "Nifty 50"], ["bankNifty", "Bank Nifty"], ["sensex", "Sensex"],
  ["options", "Outlook & options"], ["global", "Global"], ["events", "Events"], ["risks", "Risks"],
];

function Collapse({ open, onToggle, head, label, children }: { open: boolean; onToggle: () => void; head: React.ReactNode; label: string; children: React.ReactNode }) {
  // Content mounts on first open (no delayed effect → no jump) and stays mounted so closing animates smoothly.
  const [everOpen, setEverOpen] = useState(open);
  if (open && !everOpen) setEverOpen(true);
  return (
    <div className="card !p-0">
      <button onClick={onToggle} aria-expanded={open} aria-label={`${label} technical analysis`} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        {head}
        <span aria-hidden className={`ml-1 shrink-0 text-[var(--ink-3)] transition-transform duration-300 ${open ? "rotate-180" : ""}`}>⌄</span>
      </button>
      <div className="collapse-grid" data-open={open} inert={!open}>
        <div className="min-h-0 overflow-hidden"><div className="px-4 pb-4">{everOpen && children}</div></div>
      </div>
    </div>
  );
}

function SectionHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <div className="mb-4"><p className="eyebrow">{eyebrow}</p><h2 className="section-title mt-1">{title}</h2></div>;
}

const SENTIMENT: Record<string, { score: number; chip: string }> = {
  bullish: { score: 90, chip: "chip-up" }, "mildly-bullish": { score: 72, chip: "chip-up" }, neutral: { score: 50, chip: "chip-gold" },
  "mildly-bearish": { score: 28, chip: "chip-down" }, bearish: { score: 10, chip: "chip-down" },
};

function matchChart(charts: Chart[] | undefined, key: IndexKey) {
  const re = key === "nifty50" ? /^(?!.*bank).*nifty/i : key === "bankNifty" ? /bank/i : /sensex/i;
  return charts?.find((c) => re.test(c.name));
}

export type HomeInitial = { reports?: RecentReports | null; sevenDay?: SevenDay | null; flows?: { success: boolean; data?: Dict } | null; intraday?: IntradayResp | null; world?: Resp | null };

export function HomeDashboard({ initial = {} }: { initial?: HomeInitial }) {
  const reports = useApi<RecentReports>("reports", 0, undefined, initial.reports);
  const sevenDay = useApi<SevenDay>("sevenDay", 0, undefined, initial.sevenDay);
  const flowsRes = useApi<{ success: boolean; data?: Dict }>("flows", 0, undefined, initial.flows);
  const [tick, setTick] = useState(0);
  const intraday = useApi<IntradayResp>("intraday", tick, undefined, initial.intraday);
  const [active, setActive] = useState(0);
  const [openIdx, setOpenIdx] = useState<Record<IndexKey, boolean>>({ nifty50: true, bankNifty: false, sensex: false });
  const [spy, setSpy] = useState("flows");
  const progress = useRef<HTMLDivElement>(null);
  const [hd, setHd] = useState(false);
  const closeHd = useCallback(() => setHd(false), []);

  const list = reports.data?.reports ?? [];
  const current = active === 0 && reports.data?.latestReport ? reports.data.latestReport : (list[active] as { report: Report; technicalData?: TechnicalData } | undefined);
  const report = current?.report;
  const td = current?.technicalData;
  const m: Dict = report?.overallMarketSummary || {};
  const sentimentRaw: string = m.sentimentIndicator || "Neutral";
  const sentiment = SENTIMENT[sentimentRaw.toLowerCase().replace(/\s+/g, "-")] ?? SENTIMENT.neutral;
  const charts = intraday.data?.data?.charts;
  const flows = useMemo(() => (flowsRes.data?.success ? parseFlows(flowsRes.data.data) : null), [flowsRes.data]);

  const open = (t: Target) => {
    if (t in INDEX_DEFS) setOpenIdx((o) => ({ ...o, [t]: true }));
    document.getElementById(t)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Scroll progress bar + scroll-spy for the jump nav.
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const h = document.documentElement;
        progress.current?.style.setProperty("--p", String(Math.min(1, h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight))));
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setSpy(e.target.id)), { rootMargin: "-35% 0px -55% 0px" });
    SECTIONS.forEach(([id]) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); io.disconnect(); };
  }, []);

  const oc = td?.optionChain;
  const pcr = Number(oc?.pcr);

  return (
    <div className="container-x space-y-4 py-5">
      <div className="grid gap-4 lg:grid-cols-12">
        {/* ── Pulse hero ── */}
        <section className="card rise relative overflow-hidden lg:col-span-8" aria-label="Market pulse">
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[var(--accent)] opacity-[0.07] blur-3xl" />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="eyebrow flex items-center gap-2"><span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />Pre-market report</p>
            {list.length > 0 && (
              <div className="seg" role="group" aria-label="Select report date">
                {list.map((r, i) => <button key={r.id} aria-pressed={i === active} onClick={() => setActive(i)}>{fmtReportDate(r.generatedAt)}</button>)}
              </div>
            )}
          </div>

          {reports.loading ? (
            <div className="mt-6 space-y-3"><h1 className="display text-[clamp(34px,4.6vw,58px)]">Daily Nifty, Bank Nifty &amp; Sensex market report</h1><div className="skeleton h-20" aria-hidden /></div>
          ) : reports.error || !report ? (
            <div className="mt-6" role={reports.error ? "alert" : undefined}>
              <h1 className="display text-3xl">{reports.error ? "Reports are unavailable" : "No reports in the last 7 days"}</h1>
              <p className="muted mt-2 text-sm">{reports.error ?? "Reports are generated by the admin. Please check back later."}</p>
            </div>
          ) : (
            <div className="mt-6 grid items-center gap-6 md:grid-cols-[1fr_220px]">
              <div>
                <h1 className="display text-[clamp(34px,4.6vw,58px)]">The market reads <span className="grad-text">{sentimentRaw}</span></h1>
                {m.intradayOutlook && <p className="mt-4 line-clamp-4 max-w-2xl text-[15px] leading-7 text-[var(--ink-2)]">{m.intradayOutlook}</p>}
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button onClick={() => open("nifty50")} className="btn btn-primary">Open full analysis ↓</button>
                  <Link href="/learning" className="btn btn-ghost">Learn the method</Link>
                </div>
              </div>
              <div className="mx-auto w-full max-w-[240px]">
                <Gauge value={sentiment.score} display="" label={`Sentiment ${sentimentRaw}`} zones={[[20, "var(--down)"], [40, "var(--warn)"], [60, "var(--ink-3)"], [80, "var(--info)"], [100, "var(--up)"]]} />
                <p className="muted -mt-1 text-center text-[11px]">Bearish ←  sentiment  → Bullish</p>
              </div>
            </div>
          )}
        </section>

        {/* ── Brand tile ── */}
        <section className="card rise relative overflow-hidden !p-0 lg:col-span-4" style={{ animationDelay: "80ms" }} aria-label="Chang Research Base">
          <Image src="/CRB_ChangResearchBase.png" alt="Chang Research Base market analysis dashboard" fill priority sizes="(min-width:1024px) 420px, 100vw" className="object-cover object-[22%_center]" />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/40 to-transparent" />
          <div className="relative flex h-full min-h-[260px] flex-col justify-end p-5">
            <p className="eyebrow">Chang Research Base · CRB</p>
            <p className="display mt-2 text-2xl">Market insights, simplified.</p>
            <button onClick={() => setHd(true)} className="chip mt-4 w-fit backdrop-blur" aria-label="View full HD dashboard preview">⤢ HD view</button>
          </div>
        </section>

        {/* ── Index tiles ── 
        {(Object.keys(INDEX_DEFS) as IndexKey[]).map((k, i) => {
          const n: Dict = report?.overallMarketSummary?.[INDEX_DEFS[k].analysisKey] || {};
          return (
            <div key={k} className="lg:col-span-4" style={{ animationDelay: `${i * 60}ms` }}>
              <LiveIndexTile chart={matchChart(charts, k)} levels={report ? { s1: clean(n.supportLevels?.[0]), r1: clean(n.resistanceLevels?.[0]) } : undefined} onOpen={() => open(k)} />
            </div>
          );
        })}
          */}

        {/* ── Flows + options 
        <div className="lg:col-span-7"><FlowTile data={flows} onOpen={() => open("flows")} /></div>
        <section className="card card-hover lg:col-span-5" aria-label="Option chain snapshot">
          <div className="flex items-center justify-between"><p className="eyebrow">Option chain</p><button onClick={() => open("options")} className="text-xs font-semibold text-[var(--accent)] hover:underline">Details →</button></div>
          {oc ? (
            <div className="mt-3 grid grid-cols-[120px_1fr] items-center gap-4">
              <div><Gauge value={Math.min(pcr / 2, 1) * 100} display={Number.isFinite(pcr) ? pcr.toFixed(2) : "—"} label="Put-call ratio" zones={[[35, "var(--down)"], [50, "var(--ink-3)"], [100, "var(--up)"]]} /><p className="muted -mt-1 text-center text-[11px]">PCR</p></div>
              <div className="space-y-2">
                <div className="flex justify-between text-[13px]"><span className="muted">Max call OI</span><span className="num down font-medium">{oc.maxCallOIStrike ?? "—"}</span></div>
                <div className="flex justify-between text-[13px]"><span className="muted">Max put OI</span><span className="num up font-medium">{oc.maxPutOIStrike ?? "—"}</span></div>
                <div className="flex justify-between text-[13px]"><span className="muted">Spot</span><span className="num font-medium">{oc.spotPrice ?? "—"}</span></div>
                {oc.pcrSignal && <span className="chip">{oc.pcrSignal}</span>}
              </div>
            </div>
          ) : <p className="muted mt-4 text-sm">{reports.loading ? "Loading…" : "Option chain data not available in this report."}</p>}
        </section>
        ── */}
      </div>

      <div ref={progress} className="scroll-progress" aria-hidden />

      <Reveal><div className="pt-2"><GlobalIndices initial={initial.world} /></div></Reveal>

      {/* ── Jump nav ── */}
      <nav aria-label="Report sections" className="sticky top-11 z-30 -mx-1 overflow-x-auto">
        <div className="jump-nav seg !flex w-fit max-w-full backdrop-blur-md">
          {SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`} aria-current={spy === id} onClick={(e) => { e.preventDefault(); open(id as Target); }}>{label}</a>)}
        </div>
      </nav>

      {/* ── Sections in the original page order ── */}
      <Reveal>
        <section id="flows" className="scroll-mt-28 pt-8" aria-label="FII / DII flows">
          <SectionHead eyebrow="Institutional money" title="FII / DII flows" />
          {flows ? <FlowsPanel data={flows} /> : flowsRes.error ? <div role="alert" className="card text-sm text-[var(--down)]">⚠ {flowsRes.error}</div> : <div className="skeleton h-[320px]" aria-hidden />}
        </section>
      </Reveal>

      <Reveal>
        <section id="live" className="scroll-mt-28 pt-8" aria-label="Live charts">
          <SectionHead eyebrow="Intraday" title="Live charts" />
          <LivePanel charts={charts ?? null} session={intraday.data?.data?.summary?.tradingSession || ""} updated={intraday.data?.timestamp ? "Updated " + new Date(intraday.data.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : ""} busy={intraday.loading} error={intraday.error} onRefresh={() => setTick((t) => t + 1)} />
        </section>
      </Reveal>

      {(Object.keys(INDEX_DEFS) as IndexKey[]).map((k) => (
        <Reveal key={k}>
          <section id={k} className="scroll-mt-28 pt-3" aria-label={`${INDEX_LABEL[k]} analysis`}>
            <Collapse
              open={openIdx[k]}
              onToggle={() => setOpenIdx((o) => ({ ...o, [k]: !o[k] }))}
              label={INDEX_LABEL[k]}
              head={(() => {
                const c = matchChart(charts, k);
                const tdk = td?.[INDEX_DEFS[k].tdKey];
                return <IndexHead k={k} price={c?.currentPrice ?? (Number(tdk?.currentPrice) || undefined)} change={c?.change} pct={c?.changePercent} signal={tdk?.overallSignal} asOf={intraday.data?.timestamp ? "As of " + new Date(intraday.data.timestamp).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) + " IST" : undefined} />;
              })()}
            >
              {reports.loading ? <div className="skeleton h-[420px]" aria-hidden /> : !report ? <div className="card text-center muted">{reports.error ?? "No report available."}</div> : (
                <IndexWorkspace key={`${k}-${active}`} def={INDEX_DEFS[k]} report={report} technicalData={td} days={sevenDay.data?.[k]?.days} commentary={k === "nifty50" ? m.technicalAnalysis : undefined} />
              )}
            </Collapse>
          </section>
        </Reveal>
      ))}

      <Reveal>
        <section id="options" className="scroll-mt-28 pt-8" aria-label="Options">
          <SectionHead eyebrow="Derivatives" title="Options & open interest" />
          {report ? <OptionsPanel report={report} technicalData={td} /> : <div className="skeleton h-[260px]" aria-hidden />}
        </section>
      </Reveal>

      <Reveal>
        <section id="global" className="scroll-mt-28 pt-8" aria-label="Global markets">
          <SectionHead eyebrow="World" title="Global cues" />
          {report ? <GlobalPanel report={report} /> : <div className="skeleton h-[260px]" aria-hidden />}
        </section>
      </Reveal>

      <Reveal>
        <section id="events" className="scroll-mt-28 pt-8" aria-label="Events">
          <SectionHead eyebrow="Catalysts" title="Events to watch" />
          {report ? <EventsPanel key={active} report={report} /> : <div className="skeleton h-[260px]" aria-hidden />}
        </section>
      </Reveal>

      <Reveal>
        <section id="risks" className="scroll-mt-28 pt-8" aria-label="Risks and opportunities">
          <SectionHead eyebrow="Outlook" title="Risks & opportunities" />
          {report ? <RisksPanel report={report} /> : <div className="skeleton h-[260px]" aria-hidden />}
          {report && (
            <p className="mt-5 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)]/50 p-4 text-[12.5px] leading-6 text-[var(--ink-2)]">
              <strong>⚠ Disclaimer:</strong> {report.disclaimer || "This report is AI-generated for informational purposes only. Not financial advice."}
            </p>
          )}
        </section>
      </Reveal>

      <Modal open={hd} onClose={closeHd} title="Chang Research Base" wide>
        <Image src="/CRB_ChangResearchBase.png" alt="Chang Research Base market analysis dashboard, full size" width={1800} height={1200} sizes="90vw" className="h-auto w-full rounded-xl" />
      </Modal>
    </div>
  );
}
