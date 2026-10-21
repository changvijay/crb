"use client";

import { useCallback, useEffect, useState } from "react";
import { getData } from "@/lib/api";
import { fmtNum } from "@/lib/format";
import { AllIndicesModal, FLAGS, IndexDetailModal, signed, sortIndices, tone, type GlobalIndex } from "./IndicesModals";

/** Live global-indices tape, pinned above every page. Click for the full table. */
export function MarketTape() {
  const [data, setData] = useState<GlobalIndex[] | null>(null);
  const [error, setError] = useState(false);
  const [all, setAll] = useState(false);
  const [detail, setDetail] = useState<GlobalIndex | null>(null);

  useEffect(() => {
    let alive = true;
    getData<{ success: boolean; data?: { regions?: { indices: GlobalIndex[] }[] } }>("world")
      .then((j) => {
        if (!alive) return;
        if (!j.success || !j.data?.regions) throw new Error("bad");
        setData(sortIndices(j.data.regions.flatMap((r) => r.indices)));
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);

  const closeAll = useCallback(() => setAll(false), []);
  const closeDetail = useCallback(() => setDetail(null), []);

  const row = (suffix: string) =>
    (data ?? []).map((i, n) => {
      const pct = i.changePercent || 0;
      return (
        <button key={`${suffix}${i.indexName}${n}`} onClick={() => setDetail(i)} aria-hidden={suffix === "b" || undefined} tabIndex={suffix === "b" ? -1 : 0} className="flex shrink-0 items-center gap-2 px-4 text-[12px] transition hover:text-[var(--accent)]">
          <span aria-hidden>{FLAGS[i.country || ""] || "•"}</span>
          <span className="text-[var(--ink-2)]">{i.indexName}</span>
          <span className="num font-medium">{fmtNum(i.close)}</span>
          <span className={`num font-semibold ${tone(pct)}`}>{pct > 0 ? "▲" : pct < 0 ? "▼" : "•"}{signed(pct)}%</span>
        </button>
      );
    });

  return (
    <div className="tape flex h-9 items-stretch border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] backdrop-blur-xl" aria-label="Global indices">
      <div className="flex shrink-0 items-center gap-2 border-r border-[var(--line)] px-3.5">
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--up)]" />
        <span className="eyebrow !text-[10px]">Live</span>
      </div>
      <div className="relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_24px,black_calc(100%-24px),transparent)]">
        {error ? (
          <p className="muted flex h-full items-center px-4 text-xs">Global indices unavailable right now.</p>
        ) : !data ? (
          <div className="flex h-full items-center gap-6 px-4" aria-hidden>{Array.from({ length: 8 }).map((_, i) => <span key={i} className="skeleton h-3 w-28" />)}</div>
        ) : (
          <div className="tape-track flex h-full w-max items-center">{row("a")}{row("b")}</div>
        )}
      </div>
      {data && (
        <button onClick={() => setAll(true)} className="flex shrink-0 items-center border-l border-[var(--line)] px-3.5 text-[11px] font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft)]">
          All {data.length} →
        </button>
      )}
      <AllIndicesModal open={all} onClose={closeAll} data={data ?? []} onPick={(i) => setDetail(i)} />
      <IndexDetailModal idx={detail} onClose={closeDetail} />
    </div>
  );
}
