"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { fmtNum, fmtVolume } from "@/lib/format";

export type GlobalIndex = {
  indexName: string;
  symbol?: string;
  country?: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  change?: number;
  changePercent?: number;
  volume?: number;
  marketCap?: string;
  currency?: string;
  lastTradingDate?: string;
  timezone?: string;
  dataSource?: string;
  priority?: boolean;
};

export const FLAGS: Record<string, string> = {
  India: "🇮🇳", "United States": "🇺🇸", "United Kingdom": "🇬🇧", Germany: "🇩🇪", France: "🇫🇷", Japan: "🇯🇵",
  China: "🇨🇳", "Hong Kong": "🇭🇰", "South Korea": "🇰🇷", Australia: "🇦🇺", Brazil: "🇧🇷", Canada: "🇨🇦",
  Taiwan: "🇹🇼", Singapore: "🇸🇬", Indonesia: "🇮🇩", Mexico: "🇲🇽", Switzerland: "🇨🇭", Europe: "🇪🇺", Global: "🌐",
};
const TZ: Record<string, string> = {
  IST: "IST UTC+5:30", SGT: "SGT UTC+8:00", EDT: "EDT UTC-4:00", JST: "JST UTC+9:00",
  HKT: "HKT UTC+8:00", CST: "CST UTC+8:00", BST: "BST UTC+1:00", CEST: "CEST UTC+2:00",
};

export const tone = (p = 0) => (p > 0 ? "up" : p < 0 ? "down" : "muted");
export const signed = (n = 0, d = 2) => `${n > 0 ? "+" : ""}${n.toFixed(d)}`;

export function sortIndices(list: GlobalIndex[]): GlobalIndex[] {
  return [...list].sort((a, b) => {
    if (a.indexName === "GIFT Nifty") return -1;
    if (b.indexName === "GIFT Nifty") return 1;
    if (a.priority && !b.priority) return -1;
    if (!a.priority && b.priority) return 1;
    return (b.changePercent || 0) - (a.changePercent || 0);
  });
}

type SortCol = "indexName" | "country" | "open" | "high" | "low" | "close" | "change" | "changePercent" | "lastTradingDate";
const COLS: [SortCol, string][] = [
  ["indexName", "Index"], ["country", "Country"], ["open", "Open"], ["high", "High"], ["low", "Low"],
  ["close", "Close"], ["change", "Change"], ["changePercent", "Change %"], ["lastTradingDate", "Last Trading"],
];

export function AllIndicesModal({ open, onClose, data, onPick }: { open: boolean; onClose: () => void; data: GlobalIndex[]; onPick: (i: GlobalIndex) => void }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "positive" | "negative">("all");
  const [col, setCol] = useState<SortCol>("changePercent");
  const [asc, setAsc] = useState(false);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data
      .filter((i) => !term || i.indexName.toLowerCase().includes(term) || (i.country || "").toLowerCase().includes(term))
      .filter((i) => filter === "all" || (filter === "positive" ? (i.changePercent || 0) > 0 : (i.changePercent || 0) < 0))
      .sort((a, b) => {
        const av = a[col] ?? "";
        const bv = b[col] ?? "";
        const r = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
        return asc ? r : -r;
      });
  }, [data, q, filter, col, asc]);

  const sortBy = (c: SortCol) => {
    if (c === col) setAsc((a) => !a);
    else {
      setCol(c);
      setAsc(c === "indexName" || c === "country");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="All Global Indices" wide>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search index or country…"
          aria-label="Search indices"
          className="min-w-[200px] flex-1 rounded-full border border-[var(--line)] bg-[var(--bg)] px-4 py-2 text-sm outline-none focus:border-[var(--gold)]"
        />
        {(["all", "positive", "negative"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`chip ${filter === f ? "chip-gold" : ""}`}>
            {f === "all" ? "All" : f === "positive" ? "▲ Gainers" : "▼ Losers"}
          </button>
        ))}
        <span className="muted text-xs">{rows.length} of {data.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-left text-[11px] uppercase tracking-wider text-[var(--ink-3)]">
              {COLS.map(([c, label]) => (
                <th key={c} className="cursor-pointer select-none px-2 py-2.5" onClick={() => sortBy(c)} aria-sort={c === col ? (asc ? "ascending" : "descending") : "none"}>
                  {label} <span className={c === col ? "text-[var(--gold)]" : ""}>{c === col ? (asc ? "↑" : "↓") : "⇅"}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((i, n) => (
              <tr key={`${i.indexName}-${n}`} onClick={() => onPick(i)} className="cursor-pointer border-b border-[var(--line)]/60 hover:bg-[var(--surface-2)]">
                <td className="px-2 py-2.5 font-medium">{i.indexName}</td>
                <td className="px-2 py-2.5">{FLAGS[i.country || ""] || ""} {i.country}</td>
                <td className="num px-2 py-2.5">{fmtNum(i.open)}</td>
                <td className="num px-2 py-2.5">{fmtNum(i.high)}</td>
                <td className="num px-2 py-2.5">{fmtNum(i.low)}</td>
                <td className="num px-2 py-2.5">{fmtNum(i.close)}</td>
                <td className={`num px-2 py-2.5 ${tone(i.change)}`}>{i.change != null ? signed(i.change) : "—"}</td>
                <td className={`num px-2 py-2.5 font-semibold ${tone(i.changePercent)}`}>{signed(i.changePercent || 0)}%</td>
                <td className="muted px-2 py-2.5">{i.lastTradingDate || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted py-8 text-center text-sm">No indices match your search.</p>}
      </div>
    </Modal>
  );
}

function Candle({ o, h, l, c }: { o?: number; h?: number; l?: number; c?: number }) {
  if ([o, h, l, c].some((v) => typeof v !== "number")) return <p className="muted text-sm">OHLC data unavailable</p>;
  const [O, H, L, C] = [o!, h!, l!, c!];
  const range = H - L || 1;
  const y = (v: number) => 8 + ((H - v) / range) * 144;
  const upDay = C >= O;
  const color = upDay ? "var(--up)" : "var(--down)";
  return (
    <svg viewBox="0 0 120 160" className="mx-auto h-40 w-28" role="img" aria-label={`OHLC candle: open ${O}, high ${H}, low ${L}, close ${C}`}>
      <line x1="60" x2="60" y1={y(H)} y2={y(L)} stroke={color} strokeWidth="2" />
      <rect x="40" width="40" y={Math.min(y(O), y(C))} height={Math.max(3, Math.abs(y(O) - y(C)))} fill={color} rx="2" />
    </svg>
  );
}

export function IndexDetailModal({ idx, onClose }: { idx: GlobalIndex | null; onClose: () => void }) {
  if (!idx) return <Modal open={false} onClose={onClose} title="Index details">{null}</Modal>;
  const pct = idx.changePercent || 0;
  const fields: [string, string, string?][] = [
    ["Open", fmtNum(idx.open)],
    ["Close", fmtNum(idx.close)],
    ["High", fmtNum(idx.high), "up"],
    ["Low", fmtNum(idx.low), "down"],
    ["Change", idx.change ? signed(idx.change) : "—", tone(idx.change)],
    ["Change %", signed(pct) + "%", tone(pct)],
    ["Volume", idx.volume ? fmtVolume(idx.volume) : "—"],
    ["Market cap", idx.marketCap || "—"],
    ["Currency", idx.currency || "—"],
    ["Last trading", idx.lastTradingDate || "—"],
    ["Timezone", idx.timezone ? TZ[idx.timezone] || idx.timezone : "UTC"],
  ];
  return (
    <Modal open onClose={onClose} title={idx.indexName || "Index details"}>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="chip num">{idx.symbol || "—"}</span>
        <span className="chip">{FLAGS[idx.country || ""] || ""} {idx.country || "—"}</span>
        {idx.priority && <span className="chip chip-gold">📌 Priority</span>}
        <span className={`chip ${pct > 0 ? "chip-up" : pct < 0 ? "chip-down" : ""}`}>
          {pct > 0 ? "▲" : pct < 0 ? "▼" : "—"} {signed(pct)}%
        </span>
      </div>
      <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {fields.map(([k, v, t]) => (
            <div key={k} className="stat">
              <label>{k}</label>
              <div className={`num v ${t || ""}`}>{v}</div>
            </div>
          ))}
        </dl>
        <Candle o={idx.open} h={idx.high} l={idx.low} c={idx.close} />
      </div>
      <p className="muted mt-5 text-xs">Source: {idx.dataSource || "Yahoo Finance"}</p>
    </Modal>
  );
}
