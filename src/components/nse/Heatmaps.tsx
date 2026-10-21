"use client";

import { Treemap, TipRow, type TmGroup } from "@/components/market/Treemap";
import { Empty } from "@/components/market/Kit";
import { fmtN } from "./format";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Q = Record<string, any>;

const rupee = (n: number) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
const heightFor = (w: number) => Math.min(680, Math.max(480, Math.round(w * 0.56)));
/** Logos ship with this app under /logos; anything else falls back to initials. */
const localLogo = (s: unknown) => (typeof s === "string" && /^\/logos\/[\w.-]+$/.test(s) ? s : null);

/** NSE market heatmap. Core is the original: group value = stock.value||1, group avg = plain mean of changes. */
export function NseHeatmap({ data }: { data: Q[] }) {
  if (!data.length) return <Empty>No heatmap data</Empty>;
  const groups: TmGroup[] = data.map((sector) => {
    const items = (sector.children || []).map((st: Q) => ({
      symbol: st.name as string,
      name: (st.displayName || st.name) as string,
      pct: st.change || 0,
      value: st.value || 1,
      data: { price: st.price || 0, logo: localLogo(st.logo) },
    }));
    return { name: sector.name as string, items, avg: items.reduce((s: number, c: { pct: number }) => s + c.pct, 0) / (items.length || 1) };
  });
  return (
    <Treemap
      label="NSE market heatmap"
      groups={groups}
      heightFor={heightFor}
      tile={(it, w, h) => (
        <>
          {w >= 48 && h >= 52 && (it.data.logo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={it.data.logo as string} alt="" loading="lazy" className="tm-logo" onError={(e) => (e.currentTarget.style.display = "none")} />
            : <div className="tm-logo-fb">{it.symbol.substring(0, 2).toUpperCase()}</div>)}
          {w >= 34 && h >= 24 && <div className="tm-sym">{it.symbol}</div>}
          {w >= 38 && h >= 38 && <div className="tm-pct">{(it.pct >= 0 ? "+" : "") + fmtN(it.pct) + "%"}</div>}
          {w >= 54 && h >= 68 && <div className="tm-price">{rupee(Number(it.data.price))}</div>}
        </>
      )}
      tooltip={(it) => (<><div className="font-semibold">{it.symbol}</div>{it.name !== it.symbol && <div className="muted text-[11px]">{it.name}</div>}<TipRow k="Price" v={rupee(Number(it.data.price))} /><TipRow k="Change" v={(it.pct >= 0 ? "+" : "") + it.pct.toFixed(2) + "%"} tone={it.pct >= 0 ? "up" : "down"} /></>)}
    />
  );
}

const REGION_ORDER = ["India", "United States", "United Kingdom", "Germany", "France", "Europe", "Japan", "China", "Hong Kong", "South Korea", "Australia", "Brazil", "Canada", "Taiwan", "Singapore", "Indonesia", "Malaysia", "Mexico", "Switzerland", "Middle East", "Africa", "Global"];

/** World indices heatmap: grouped by country, priority indices weigh 3×, own intensity thresholds (0.15 / 0.45). */
export function WorldHeatmap({ indices }: { indices: Q[] }) {
  if (!indices.length) return <Empty>No world indices data</Empty>;
  const byRegion: Record<string, Q[]> = {};
  indices.forEach((i) => (byRegion[i.country || i.region || "Other"] ||= []).push(i));
  const names = [...REGION_ORDER.filter((r) => byRegion[r]), ...Object.keys(byRegion).filter((r) => !REGION_ORDER.includes(r))];
  const groups: TmGroup[] = names.filter((r) => byRegion[r]?.length).map((name) => {
    const items = byRegion[name].map((i) => ({
      symbol: (i.indexName ?? i.name ?? i.symbol ?? "—") as string,
      name: (i.indexName ?? i.name ?? i.symbol ?? "—") as string,
      pct: (i.changePercent ?? i.pChange ?? 0) as number,
      value: i.priority ? 3 : 1,
      data: { close: i.close ?? i.last ?? 0, currency: i.currency || "" },
    }));
    return { name, items, avg: items.reduce((s, c) => s + (c.pct || 0), 0) / (items.length || 1) };
  });
  const price = (it: { data: Record<string, unknown> }) => {
    const c = it.data.currency as string;
    return c && c !== "₹" ? Number(it.data.close).toLocaleString("en-US", { maximumFractionDigits: 2 }) : rupee(Number(it.data.close));
  };
  return (
    <Treemap
      label="World indices heatmap"
      groups={groups}
      heightFor={heightFor}
      intensity={[0.15, 0.45]}
      tile={(it, w, h) => (
        <>
          {w >= 42 && h >= 26 && <div className="tm-sym" style={{ fontSize: ".64rem" }}>{it.symbol}</div>}
          {w >= 42 && h >= 42 && <div className="tm-pct">{(it.pct >= 0 ? "+" : "") + (it.pct || 0).toFixed(2) + "%"}</div>}
          {w >= 56 && h >= 60 && <div className="tm-price">{fmtN(it.data.close)}</div>}
        </>
      )}
      tooltip={(it) => (<><div className="font-semibold">{it.symbol}</div><TipRow k="Price" v={price(it)} /><TipRow k="Change" v={(it.pct >= 0 ? "+" : "") + (it.pct || 0).toFixed(2) + "%"} tone={it.pct >= 0 ? "up" : "down"} /></>)}
    />
  );
}
