"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { AllIndicesModal, FLAGS, IndexDetailModal, signed, sortIndices, tone, type GlobalIndex } from "@/components/shell/IndicesModals";
import { fmtNum } from "@/lib/format";
import { useApi } from "@/lib/useApi";

export type Resp = { success: boolean; timestamp?: string; data?: { regions?: { indices: GlobalIndex[] }[] } };

/** Day-range bar: where the close sits between the session low and high. */
function Range({ i }: { i: GlobalIndex }) {
  const { low, high, close } = i;
  if (low == null || high == null || close == null || high <= low) return <div className="h-1" />;
  const p = Math.max(0, Math.min(100, ((close - low) / (high - low)) * 100));
  return (
    <div aria-hidden className="relative mt-3 h-1 rounded-full bg-[var(--line)]">
      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${p}%`, background: (i.changePercent || 0) >= 0 ? "var(--up)" : "var(--down)", opacity: 0.55 }} />
      <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--surface)] bg-[var(--ink)]" style={{ left: `${p}%` }} />
    </div>
  );
}

/** Global indices strip from the original home page: summary stats, scrollable cards, View All table. */
export function GlobalIndices({ initial }: { initial?: Resp | null }) {
  const res = useApi<Resp>("world", 0, undefined, initial);
  const [all, setAll] = useState(false);
  const [detail, setDetail] = useState<GlobalIndex | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const closeAll = useCallback(() => setAll(false), []);
  const closeDetail = useCallback(() => setDetail(null), []);

  const data = useMemo(() => (res.data?.success && res.data.data?.regions ? sortIndices(res.data.data.regions.flatMap((r) => r.indices)) : null), [res.data]);
  const up = data?.filter((i) => (i.changePercent || 0) > 0).length ?? 0;
  const down = data?.filter((i) => (i.changePercent || 0) < 0).length ?? 0;
  const stamp = res.data?.timestamp ? new Date(res.data.timestamp).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) + " IST" : "";
  const scroll = (d: number) => track.current?.scrollBy({ left: d * track.current.clientWidth * 0.8, behavior: "smooth" });

  return (
    <section id="indices" className="scroll-mt-28" aria-label="Global indices">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Markets</p>
          <h2 className="section-title mt-1">Global indices</h2>
          {data && (
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
              <span className="chip chip-up !py-0.5">▲ {up} advancing</span>
              <span className="chip chip-down !py-0.5">▼ {down} declining</span>
              <span className="muted">{data.length} indices{stamp ? ` · ${stamp}` : ""}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => scroll(-1)} aria-label="Scroll left" className="btn btn-ghost !px-3 !py-2">←</button>
          <button onClick={() => scroll(1)} aria-label="Scroll right" className="btn btn-ghost !px-3 !py-2">→</button>
          {data && <button onClick={() => setAll(true)} className="btn btn-primary !py-2">View all →</button>}
        </div>
      </div>

      {res.error ? (
        <div role="alert" className="card text-sm text-[var(--down)]">⚠ Global indices unavailable right now.</div>
      ) : !data ? (
        <div className="flex gap-3 overflow-hidden" aria-hidden>{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-[132px] w-[210px] shrink-0" />)}</div>
      ) : (
        <div ref={track} className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-3 [scrollbar-width:thin]">
          {data.map((i, n) => {
            const pct = i.changePercent || 0;
            return (
              <button key={`${i.indexName}${n}`} onClick={() => setDetail(i)} className="card card-hover w-[210px] shrink-0 snap-start !p-4 text-left">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2"><span aria-hidden className="text-lg">{FLAGS[i.country || ""] || "•"}</span><span className="truncate text-[13px] font-semibold">{i.indexName}</span></span>
                  {i.priority && <span aria-label="Priority" className="text-[11px] text-[var(--accent)]">★</span>}
                </div>
                <p className="num mt-3 text-[22px] font-semibold leading-none">{fmtNum(i.close)}</p>
                <p className={`num mt-1 text-[12.5px] font-medium ${tone(pct)}`}>{pct > 0 ? "▲" : pct < 0 ? "▼" : "•"} {signed(i.change)} ({signed(pct)}%)</p>
                <Range i={i} />
                <p className="muted mt-1.5 truncate text-[10.5px]">{i.country}{i.lastTradingDate ? ` · ${i.lastTradingDate}` : ""}</p>
              </button>
            );
          })}
        </div>
      )}
      <AllIndicesModal open={all} onClose={closeAll} data={data ?? []} onPick={(i) => setDetail(i)} />
      <IndexDetailModal idx={detail} onClose={closeDetail} />
    </section>
  );
}
