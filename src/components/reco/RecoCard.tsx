"use client";

import Link from "next/link";
import type { KeyboardEvent } from "react";
import { fmtNum } from "@/lib/format";
import { ADVISOR_LABEL, BREAKOUT_LABELS, TERM_LABEL, type Reco } from "./types";

const price = (n?: number | null) => (n == null ? "—" : Number(n).toLocaleString("en-IN"));
const valid = (n?: number | null): n is number => n != null && !Number.isNaN(n);
const OBJECT_ID = /^[a-fA-F0-9]{24}$/;

export const advisorOf = (r: Reco) => {
  const adv = r.advisor?._id && OBJECT_ID.test(r.advisor._id) ? r.advisor : null;
  const name = adv?.displayName || r.addedBy?.name || "";
  const type = adv ? ADVISOR_LABEL[adv.advisorType ?? ""] || "" : r.addedBy ? "Advisor" : "";
  return { adv, name, type };
};

const GRADS = [["#3d5a80", "#293f5c"], ["#2f7d5b", "#1f5a41"], ["#7a5a9c", "#563f72"], ["#b9852f", "#8a6221"], ["#b04a3f", "#85352d"], ["#2e8a96", "#1f6670"]];
export const avatarBg = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  const [a, b] = GRADS[Math.abs(h) % GRADS.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
};

const statusChip = (s?: string) => (s === "OPEN" ? "chip-gold" : s === "SUCCESS" ? "chip-up" : s === "FAILED" ? "chip-down" : "");
const tlTone = (s?: string) => (s === "hit" || s === "achieved" || s === "success" ? "chip-up" : s === "missed" || s === "failed" ? "chip-down" : "");

export function Legend({ r }: { r: Reco }) {
  const buy = r.tradeType === "BUY";
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Recommendation metadata">
      <span className={`chip ${buy ? "chip-up" : "chip-down"}`}><span className="opacity-60">Type</span> {r.tradeType}</span>
      <span className={`chip ${statusChip(r.status)}`}><span className="opacity-60">Status</span> {r.status}</span>
      <span className="chip"><span className="opacity-60">Term</span> {TERM_LABEL[r.term ?? ""] || r.term}</span>
    </div>
  );
}

export function Progress({ r }: { r: Reco }) {
  const { stopLoss: sl, entryPrice: entry, exitPrice: tgt, ltp } = r;
  if (!valid(sl) || !valid(entry) || !valid(tgt) || !valid(ltp) || sl === tgt) return null;
  const pct = Math.min(100, Math.max(0, ((ltp - sl) / (tgt - sl)) * 100));
  const color = ltp >= entry ? "var(--up)" : ltp >= sl ? "var(--warn)" : "var(--down)";
  return (
    <div className="mt-4">
      <div className="num mb-1.5 flex justify-between text-[10.5px] text-[var(--ink-3)]">
        <span>SL ₹{price(sl)}</span><span>Entry ₹{price(entry)}</span><span>Target ₹{price(tgt)}</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-[var(--surface-2)]" role="img" aria-label={`Price is ${pct.toFixed(0)}% of the way from stop loss to target`}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
        <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--surface)]" style={{ left: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export function RiskReward({ r }: { r: Reco }) {
  const { entryPrice: e, stopLoss: sl, exitPrice: t } = r;
  if (!valid(e) || !valid(sl) || !valid(t) || e === sl) return null;
  const risk = Math.abs(e - sl);
  if (risk <= 0) return null;
  const rr = Math.abs(t - e) / risk;
  return (
    <div className="mt-3 flex items-center justify-between text-xs">
      <span className="text-[var(--ink-3)]">Risk : Reward</span>
      <span className={`num font-semibold ${rr >= 2 ? "up" : rr >= 1 ? "text-[var(--warn)]" : "down"}`}>1 : {rr.toFixed(2)}</span>
    </div>
  );
}

export function LtpDelta({ r }: { r: Reco }) {
  if (!valid(r.ltp) || !valid(r.entryPrice) || r.entryPrice === 0) return null;
  const d = ((r.ltp - r.entryPrice) / r.entryPrice) * 100;
  return <span className={`num text-xs font-semibold ${d > 0 ? "up" : d < 0 ? "down" : "muted"}`}>{d > 0 ? "+" : ""}{d.toFixed(2)}% vs entry</span>;
}

export function RecoCard({ r, index, onOpen }: { r: Reco; index: number; onOpen: (r: Reco) => void }) {
  const buy = r.tradeType === "BUY";
  const upside = r.upsidePotential ?? 0;
  const { adv, name, type } = advisorOf(r);
  const date = r.addedDate ? new Date(r.addedDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" }) : "";
  const onKey = (e: KeyboardEvent) => {
    if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onOpen(r);
    }
  };

  const advisor = (
    <>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold text-white" style={{ background: avatarBg(name) }}>{(name || "?")[0].toUpperCase()}</span>
      <span className="min-w-0 text-left">
        <span className="block truncate text-[13px] font-medium">{name || "Unknown"}</span>
        <span className="muted block truncate text-[11px]">{type}</span>
      </span>
    </>
  );

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`View details for ${r.symbol}`}
      onClick={() => onOpen(r)}
      onKeyDown={onKey}
      className="card rise relative flex cursor-pointer flex-col overflow-hidden !p-5 transition hover:-translate-y-1 hover:border-[var(--gold)]"
      style={{ animationDelay: `${Math.min(index * 45, 300)}ms`, borderTop: `3px solid ${buy ? "var(--up)" : "var(--down)"}` }}
    >
      <div className="flex items-start justify-between gap-3">
        <a
          href={r.symbol ? `https://www.screener.in/company/${encodeURIComponent(r.symbol)}/` : undefined}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="display text-3xl hover:text-[var(--gold)]"
        >
          {r.symbol}
        </a>
        <div className="text-right">
          <p className="eyebrow !tracking-wider">Upside</p>
          <p className={`num text-xl font-medium ${upside < 0 ? "down" : "up"}`}>{upside < 0 ? "" : "+"}{upside}%</p>
          {valid(r.ltp) && <p className="num muted text-[11px]">LTP ₹{fmtNum(r.ltp)}</p>}
        </div>
      </div>

      <div className="mt-3"><Legend r={r} /></div>
      <div className="my-4 h-px bg-[var(--line)]" />

      <div className="grid grid-cols-3 gap-2">
        {([["Entry", r.entryPrice, ""], ["Stop loss", r.stopLoss, "down"], ["Target", r.exitPrice, "up"]] as const).map(([l, v, c]) => (
          <div key={l} className="rounded-lg bg-[var(--surface-2)] px-2.5 py-2">
            <p className="text-[10px] uppercase tracking-wider text-[var(--ink-3)]">{l}</p>
            <p className={`num text-[15px] font-medium ${c}`}>₹{price(v)}</p>
          </div>
        ))}
      </div>

      {valid(r.ltp) && <div className="mt-3"><LtpDelta r={r} /></div>}
      <Progress r={r} />
      <RiskReward r={r} />

      {!!r.breakoutType?.length && (
        <div className="mt-3 flex flex-wrap gap-1.5">{r.breakoutType.slice(0, 5).map((c) => <span key={c} className="chip chip-gold">{BREAKOUT_LABELS[c] || c}</span>)}</div>
      )}
      {!!r.timeline?.length && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {r.timeline.slice(0, 4).map((t, i) => <span key={i} className={`chip ${tlTone(t.status)}`}>{t.target}{t.value ? ` ₹${t.value}` : ""}</span>)}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 pt-5">
        {adv ? (
          <Link href={`/advisor-profile?id=${adv._id}`} onClick={(e) => e.stopPropagation()} aria-label={`View ${name}'s profile`} className="flex min-w-0 items-center gap-2.5 hover:opacity-80">{advisor}</Link>
        ) : (
          <div className="flex min-w-0 items-center gap-2.5">{advisor}</div>
        )}
        <span className="muted shrink-0 text-xs">{date}</span>
      </div>
    </article>
  );
}
