"use client";

import { useState } from "react";
import type { Dict, Report, TechnicalData } from "./types";

const impactTone = (s?: string) => { const l = (s || "").toLowerCase(); return l.includes("positive") ? "var(--up)" : l.includes("negative") ? "var(--down)" : "var(--ink-3)"; };
const impactChip = (s?: string) => { const l = (s || "").toLowerCase(); return l.includes("positive") ? "chip-up" : l.includes("negative") ? "chip-down" : ""; };
const verification = (s?: string) => { const l = (s || "").toLowerCase(); return l.includes("confirmed") ? "chip-up" : l.includes("official") ? "chip-gold" : l.includes("rumor") || l.includes("assumption") ? "chip-down" : ""; };

export function OptionsPanel({ report, technicalData }: { report: Report; technicalData?: TechnicalData }) {
  const oc = technicalData?.optionChain;
  const m: Dict = report.overallMarketSummary || {};
  const pcr = Number(oc?.pcr);
  const pcrTone = pcr > 1 ? "up" : pcr < 0.7 ? "down" : "";
  const call = Number(oc?.totalCallOI) || 0;
  const put = Number(oc?.totalPutOI) || 0;
  const putShare = call + put ? (put / (call + put)) * 100 : 50;
  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <section className="card lg:col-span-7">
        <p className="eyebrow">Option chain · support &amp; resistance</p>
        {oc ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="stat"><label>Spot</label><div className="num v">{oc.spotPrice ?? "—"}</div></div>
              <div className="stat"><label>PCR</label><div className={`num v ${pcrTone}`}>{oc.pcr ?? "—"}</div><div className="s">{oc.pcrSignal}</div></div>
              <div className="stat"><label>Max call OI</label><div className="num v down">{oc.maxCallOIStrike ?? "—"}</div><div className="s">Resistance</div></div>
              <div className="stat"><label>Max put OI</label><div className="num v up">{oc.maxPutOIStrike ?? "—"}</div><div className="s">Support</div></div>
            </div>
            <div className="mt-6">
              <div className="mb-2 flex justify-between text-[11px]"><span className="down num">Calls {call.toLocaleString("en-IN")}</span><span className="up num">Puts {put.toLocaleString("en-IN")}</span></div>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-[var(--down)]/80" role="img" aria-label={`Put share of open interest ${putShare.toFixed(0)}%`}><div className="bg-[var(--up)]" style={{ width: `${putShare}%` }} /></div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="stat"><label>Expiry</label><div className="num v">{oc.nearestExpiry ?? "—"}</div></div>
              <div className="stat"><label>IV signal</label><div className="v text-[14px]">{oc.ivSignal ?? "—"}</div></div>
            </div>
          </>
        ) : <p className="muted mt-4 text-sm">Option chain data not available (NSE API restricted). Using price-based analysis.</p>}
      </section>
      <section className="card lg:col-span-5">
        <p className="eyebrow">Read</p>
        <p className="mt-3 text-[14.5px] leading-7 text-[var(--ink-2)]">{m.optionChainAnalysis || "No option chain commentary in this report."}</p>
        {m.intradayOutlook && <><p className="eyebrow mt-6">Intraday outlook</p><p className="mt-2 text-[14.5px] leading-7 text-[var(--ink-2)]">{m.intradayOutlook}</p></>}
      </section>
    </div>
  );
}

function Event({ ev }: { ev: Dict }) {
  const [open, setOpen] = useState(false);
  const tags: string[] = ev.affectedMarkets || [];
  const more = ev.historicalComparison || ev.estimatedImpactPercent || tags.length;
  return (
    <li className="relative pl-8">
      <span className="absolute left-0 top-1.5 grid h-6 w-6 place-items-center rounded-full border-2 border-[var(--surface)] text-[10px] font-bold text-[#04110f]" style={{ background: impactTone(ev.expectedImpact) }}>{ev.eventNumber || "•"}</span>
      <article className="card !p-5">
        <h4 className="display text-[19px] leading-snug">{ev.title}</h4>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {ev.category && <span className="chip chip-gold">{ev.category}</span>}
          {ev.newsDate && <span className="chip">{ev.newsDate}</span>}
          <span className={`chip ${impactChip(ev.expectedImpact)}`}>{ev.expectedImpact || "N/A"}</span>
          <span className="chip">{ev.impactSeverity || "N/A"} impact</span>
          <span className={`chip ${verification(ev.verificationStatus)}`}>{ev.verificationStatus || "Unverified"}</span>
        </div>
        <p className="mt-4 text-[14px] leading-7 text-[var(--ink-2)]">{ev.detailedSummary}</p>
        {more ? (
          <>
            <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-3 text-xs font-semibold text-[var(--accent)] hover:underline">{open ? "Show less ▴" : "Context & impact ▾"}</button>
            {open && (
              <div className="mt-4 grid gap-4 border-t border-[var(--line)] pt-4 md:grid-cols-3">
                <div><p className="eyebrow">Historical</p><p className="mt-1 text-[13px] text-[var(--ink-2)]">{ev.historicalComparison || "Nothing similar recently"}</p></div>
                {ev.estimatedImpactPercent && <div><p className="eyebrow">Expected impact</p><p className="mt-1 text-[13px] text-[var(--ink-2)]">{ev.estimatedImpactPercent}</p></div>}
                {tags.length > 0 && <div><p className="eyebrow">Affected</p><div className="mt-1 flex flex-wrap gap-1.5">{tags.map((t) => <span key={t} className="chip">{t}</span>)}</div></div>}
              </div>
            )}
          </>
        ) : null}
      </article>
    </li>
  );
}

export function EventsPanel({ report }: { report: Report }) {
  const [filter, setFilter] = useState("all");
  const events: Dict[] = report.events || [];
  const shown = events.filter((e) => filter === "all" || (e.expectedImpact || "").toLowerCase().includes(filter));
  if (!events.length) return <div className="card text-center muted">No key events in this report.</div>;
  return (
    <div>
      <div className="seg mb-5" role="group" aria-label="Filter events by impact">
        {[["all", "All"], ["positive", "Positive"], ["negative", "Negative"], ["neutral", "Neutral"]].map(([v, l]) => (
          <button key={v} aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</button>
        ))}
      </div>
      <ol className="relative space-y-4 before:absolute before:left-3 before:top-2 before:h-[calc(100%-16px)] before:w-px before:bg-[var(--line)]">
        {shown.map((ev, i) => <Event key={ev.eventNumber ?? i} ev={ev} />)}
      </ol>
      {!shown.length && <p className="muted py-8 text-center text-sm">No events with that impact.</p>}
    </div>
  );
}

export function GlobalPanel({ report }: { report: Report }) {
  const gs: Dict = report.globalMarketSnapshot || {};
  const items: [string, string, string][] = [["usMarkets", "US markets", "🇺🇸"], ["europeanMarkets", "European", "🇪🇺"], ["asianMarkets", "Asian", "🌏"], ["commodities", "Commodities", "🛢"], ["currencies", "Currencies", "💱"]];
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      {items.map(([k, label, flag]) => (
        <div key={k} className="card card-hover">
          <p className="flex items-center gap-2 text-sm font-semibold"><span className="text-lg" aria-hidden>{flag}</span>{label}</p>
          <p className="mt-3 text-[13.5px] leading-7 text-[var(--ink-2)]">{gs[k] || "Data not available"}</p>
        </div>
      ))}
    </div>
  );
}

export function RisksPanel({ report }: { report: Report }) {
  const m: Dict = report.overallMarketSummary || {};
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {([["Key risks", m.keyRisks, "var(--down)", "▼"], ["Key opportunities", m.keyOpportunities, "var(--up)", "▲"]] as const).map(([title, list, color, mark]) => (
        <section key={title} className="card" style={{ borderTop: `3px solid ${color}` }}>
          <h4 className="eyebrow" style={{ color }}>{mark} {title}</h4>
          <ol className="mt-4 space-y-3">
            {((list as string[]) || []).map((t, i) => (
              <li key={i} className="flex gap-3 text-[14px] leading-6 text-[var(--ink-2)]"><span className="num shrink-0 font-semibold" style={{ color }}>{String(i + 1).padStart(2, "0")}</span>{t}</li>
            ))}
            {!(list as string[])?.length && <li className="muted text-sm">None listed.</li>}
          </ol>
        </section>
      ))}
    </div>
  );
}
