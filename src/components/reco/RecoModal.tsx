"use client";

import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { advisorOf, avatarBg, LtpDelta, Legend, Progress, RiskReward } from "./RecoCard";
import { BREAKOUT_LABELS, type Reco } from "./types";

const price = (n?: number | null) => (n == null ? "—" : Number(n).toLocaleString("en-IN"));

export function RecoModal({ reco, onClose }: { reco: Reco | null; onClose: () => void }) {
  if (!reco) return <Modal open={false} onClose={onClose} title="Recommendation">{null}</Modal>;
  const upside = reco.upsidePotential ?? 0;
  const { adv, name, type } = advisorOf(reco);
  const date = reco.addedDate ? new Date(reco.addedDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" }) : "";
  const advisor = (
    <>
      <span className="grid h-9 w-9 place-items-center rounded-full text-sm font-semibold text-white" style={{ background: avatarBg(name) }}>{(name || "?")[0].toUpperCase()}</span>
      <span><span className="block text-sm font-medium">{name || "Unknown"}</span><span className="muted block text-xs">{type}</span></span>
    </>
  );

  return (
    <Modal open onClose={onClose} title={reco.symbol || "Recommendation"}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <Legend r={reco} />
        <p className={`num text-2xl font-medium ${upside < 0 ? "down" : "up"}`}><span className="eyebrow mr-2 !text-[10px]">Upside</span>{upside < 0 ? "" : "+"}{upside}%</p>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        {([["Entry", reco.entryPrice, ""], ["Target", reco.exitPrice, "up"], ["Stop loss", reco.stopLoss, "down"]] as const).map(([l, v, c]) => (
          <div key={l} className="stat"><label>{l}</label><div className={`num v ${c}`}>₹{price(v)}</div></div>
        ))}
      </div>

      {reco.ltp != null && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="chip chip-gold num">LTP ₹{price(reco.ltp)}</span>
          <LtpDelta r={reco} />
        </div>
      )}
      <Progress r={reco} />
      <RiskReward r={reco} />

      {reco.reason?.trim() && (
        <div className="mt-6"><p className="eyebrow">Analysis</p><p className="mt-2 whitespace-pre-line text-sm leading-7 text-[var(--ink-2)]">{reco.reason.trim()}</p></div>
      )}
      {!!reco.breakoutType?.length && (
        <div className="mt-6"><p className="eyebrow">Breakout patterns</p><div className="mt-2 flex flex-wrap gap-2">{reco.breakoutType.map((c) => <span key={c} className="chip chip-gold">{BREAKOUT_LABELS[c] || c}</span>)}</div></div>
      )}
      {!!reco.timeline?.length && (
        <div className="mt-6"><p className="eyebrow">Timeline targets</p><div className="mt-2 flex flex-wrap gap-2">{reco.timeline.map((t, i) => <span key={i} className="chip">{t.target}{t.value ? ` ₹${t.value}` : ""} · {t.status || "pending"}</span>)}</div></div>
      )}

      <div className="mt-7 flex items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
        {adv ? <Link href={`/advisor-profile?id=${adv._id}`} className="flex items-center gap-3 hover:opacity-80" aria-label={`View ${name}'s profile`}>{advisor}</Link> : <div className="flex items-center gap-3">{advisor}</div>}
        <span className="muted text-xs">{date}</span>
      </div>
    </Modal>
  );
}
