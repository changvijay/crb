"use client";

import { hierarchy as d3Hierarchy, treemap as d3Treemap } from "d3-hierarchy";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * Heatmap core, ported 1:1 from the original dashboards (US stocks / US indices / crypto):
 *   d3.hierarchy(root).sum(value).sort(value desc)
 *   d3.treemap().size([W,H]).paddingOuter(3).paddingTop(26).paddingInner(2).round(true)
 * plus the same colour scale, intensity classes and 120 ms debounced resize relayout.
 * Only the presentation around it differs.
 */
export type TmItem = { symbol: string; name: string; pct: number; value: number; data: Record<string, unknown> };
export type TmGroup = { name: string; avg: number; items: TmItem[] };

const PAD = 8; // matches the container padding below
const HEADER = 26; // px reserved for each group label

/** Original 11-step heat scale (unchanged). */
export function heatColor(pct: number | null | undefined): string {
  if (pct == null || Number.isNaN(pct)) return "#1e2430";
  const v = Number(pct);
  if (v >= 4) return "#14532d";
  if (v >= 2.5) return "#166534";
  if (v >= 1.5) return "#15803d";
  if (v >= 0.75) return "#16a34a";
  if (v >= 0.1) return "#22c55e";
  if (v > -0.1) return "#374151";
  if (v >= -0.75) return "#dc2626";
  if (v >= -1.5) return "#b91c1c";
  if (v >= -2.5) return "#991b1b";
  if (v >= -4) return "#7f1d1d";
  return "#6b0e0e";
}

type Root = { name: string; children: { name: string; avg: number; children: TmItem[] }[] };
type Laid = { name: string; avg: number; x: number; y: number; w: number; h: number; tiles: { item: TmItem; x: number; y: number; w: number; h: number; ratio: number }[] };

function layout(groups: TmGroup[], W: number, H: number): Laid[] {
  const rootData: Root = { name: "root", children: groups.map((g) => ({ name: g.name, avg: g.avg, children: g.items })) };
  const root = d3Hierarchy<Root | Root["children"][number] | TmItem>(rootData as never, (d) => ("children" in d ? (d.children as never) : undefined))
    .sum((d) => ("value" in d ? ((d as TmItem).value || 0) : 0))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  d3Treemap<Root | Root["children"][number] | TmItem>().size([W, H]).paddingOuter(3).paddingTop(HEADER).paddingInner(2).round(true)(root as never);

  return (root.children ?? []).map((s) => {
    const sNode = s as unknown as { x0: number; y0: number; x1: number; y1: number; value: number; data: Root["children"][number]; children?: { x0: number; y0: number; x1: number; y1: number; value: number; data: TmItem }[] };
    return {
      name: sNode.data.name,
      avg: sNode.data.avg,
      x: sNode.x0, y: sNode.y0, w: sNode.x1 - sNode.x0, h: sNode.y1 - sNode.y0,
      tiles: (sNode.children ?? []).map((t) => ({
        item: t.data, x: t.x0 - sNode.x0, y: t.y0 - sNode.y0, w: t.x1 - t.x0, h: t.y1 - t.y0, ratio: t.value / (sNode.value || 1),
      })),
    };
  });
}

export function Treemap({ groups, heightFor, tile, tooltip, label, intensity = [0.08, 0.22] }: {
  groups: TmGroup[];
  heightFor: (width: number) => number;
  tile: (item: TmItem, w: number, h: number) => ReactNode;
  tooltip: (item: TmItem) => ReactNode;
  label: string;
  /** Share-of-group thresholds for the i-lo / i-mid / i-hi size classes (original defaults 0.08 / 0.22). */
  intensity?: [number, number];
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [tip, setTip] = useState<{ item: TmItem; left: number; top: number } | null>(null);
  const tipEl = useRef<HTMLDivElement>(null);

  // 120 ms debounced relayout on resize (same as the original ResizeObserver).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout>;
    const measure = () => setWidth(el.clientWidth);
    const first = requestAnimationFrame(measure);
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(measure, 120);
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(first);
      clearTimeout(timer);
      ro.disconnect();
    };
  }, []);

  const W = (width || 960) - PAD * 2;
  const H = heightFor(W);
  const laid = useMemo(() => (width ? layout(groups, W, H) : []), [groups, W, H, width]);

  // Same tooltip placement rule as the original (computed in the event handler, not during render).
  const show = (e: { clientX: number; clientY: number }, item: TmItem) => {
    const bw = tipEl.current?.offsetWidth || 220;
    const bh = tipEl.current?.offsetHeight || 140;
    const tx = e.clientX + 16;
    const ty = e.clientY - 12;
    setTip({ item, left: tx + bw > window.innerWidth - 8 ? tx - bw - 30 : tx, top: ty + bh > window.innerHeight - 8 ? ty - bh : ty });
  };

  return (
    <div ref={box} className="relative w-full overflow-hidden rounded-2xl border border-[var(--line)] bg-[#0b0e14]" style={{ padding: PAD }} role="img" aria-label={label}>
      <div className="tm-canvas" style={{ width: W, height: H }}>
        {laid.map((s) => (
          <div key={s.name} className="tm-sector" style={{ left: s.x, top: s.y, width: s.w, height: s.h }}>
            <div className="tm-sector-head"><span className="truncate">{s.name}</span><span className={`tm-sector-avg ${s.avg > 0 ? "up" : s.avg < 0 ? "dn" : "neu"}`}>{`${s.avg >= 0 ? "+" : ""}${s.avg.toFixed(2)}%`}</span></div>
            {s.tiles.map((t, ti) => {
              if (t.w < 4 || t.h < 4) return null;
              const cls = t.ratio < intensity[0] ? "i-lo" : t.ratio < intensity[1] ? "i-mid" : "i-hi";
              return (
                <div
                  key={`${t.item.symbol}-${ti}`}
                  className={`tm-stock ${cls}`}
                  style={{ left: t.x, top: t.y, width: t.w, height: t.h, background: heatColor(t.item.pct) }}
                  onMouseEnter={(e) => show(e, t.item)}
                  onMouseMove={(e) => show(e, t.item)}
                  onMouseLeave={() => setTip(null)}
                >
                  {tile(t.item, t.w, t.h)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {tip && (
        <div ref={tipEl} role="tooltip" className="pointer-events-none fixed z-[90] min-w-[200px] rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-[12px] shadow-2xl" style={{ left: tip.left, top: tip.top }}>
          {tooltip(tip.item)}
        </div>
      )}
    </div>
  );
}

export function TipRow({ k, v, tone }: { k: string; v: ReactNode; tone?: "up" | "down" }) {
  return <div className="mt-1 flex justify-between gap-6"><span className="muted">{k}</span><span className={`num font-medium ${tone ?? ""}`}>{v}</span></div>;
}
