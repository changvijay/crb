"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Marquee } from "@/components/market/Kit";
import { IconArrow } from "@/components/ui/icons";
import { CYCLE_WORDS, MODULES, PINS, SHOWCASE, type Level, type Mod } from "./data";

const LEVEL_CHIP: Record<string, string> = { beginner: "chip-up", intermediate: "chip-gold", advanced: "chip-violet" };
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function useInterval(fn: () => void, ms: number, key: unknown) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, key]);
}

function Hero() {
  const [word, setWord] = useState(0);
  const [slide, setSlide] = useState(0);
  useInterval(() => setWord((w) => (w + 1) % CYCLE_WORDS.length), 2300, "w");
  useInterval(() => setSlide((s) => (s + 1) % SHOWCASE.length), 3000, slide); // restarts when a dot is clicked
  const cur = SHOWCASE[slide];
  const live = PINS.length;

  return (
    <section className="container-x grid items-center gap-10 py-10 md:py-16 lg:grid-cols-[1.15fr_1fr]" aria-label="Learning center overview">
      <div className="rise">
        <span className="chip chip-gold">📚 Curriculum v2.0</span>
        <h1 className="display mt-5 text-[clamp(38px,5.6vw,72px)]">
          Master the<br />
          <span className="relative inline-block h-[1.1em] min-w-[8ch] align-bottom" aria-live="polite">
            {CYCLE_WORDS.map((w, i) => (
              <span key={w} aria-hidden={i !== word} className={`grad-text absolute left-0 top-0 whitespace-nowrap transition-all duration-500 ${i === word ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}>{w}</span>
            ))}
            <span className="invisible">Fundamentals</span>
          </span>
          <br />
          <span className="text-[0.55em] font-semibold text-[var(--ink-3)]">with confidence.</span>
        </h1>
        <p className="mt-5 max-w-xl text-[16px] leading-8 text-[var(--ink-2)]">Structured modules for Indian traders — from zero to advanced strategies. Free, forever.</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <span className="chip chip-up">{live} live now</span>
          <span className="chip">{MODULES.length + 3} modules</span>
          <span className="chip chip-gold">Free forever</span>
        </div>
        <a href="#modules" className="btn btn-primary mt-8">Explore modules <IconArrow width={16} height={16} /></a>
      </div>

      <div className="rise" style={{ animationDelay: "100ms" }}>
        <div className="card relative overflow-hidden !p-7" aria-live="off">
          <div className="absolute inset-x-0 top-0 h-[3px] transition-colors duration-500" style={{ background: cur.color }} />
          {/* key restarts the 3 s progress animation on every slide */}
          <div key={slide} className="absolute inset-x-0 top-[3px] h-[2px] origin-left animate-[msprog_3s_linear]" style={{ background: cur.color, opacity: 0.5 }} />
          <p className="eyebrow" style={{ color: cur.color }}>{cur.num}</p>
          <div className="mt-4 text-5xl" aria-hidden>{cur.icon}</div>
          <h2 className="display mt-3 text-3xl">{cur.title}</h2>
          <span className={`chip mt-3 ${LEVEL_CHIP[cur.level.toLowerCase()]}`}>{cur.level}</span>
          <div className="mt-5 flex flex-wrap gap-2">{cur.tags.map((t) => <span key={t} className="chip">{t}</span>)}</div>
        </div>
        <div className="mt-4 flex justify-center gap-2" role="group" aria-label="Featured modules">
          {SHOWCASE.map((m, i) => (
            <button key={m.title} onClick={() => setSlide(i)} aria-label={`Go to ${m.title}`} aria-current={i === slide} className={`h-2 rounded-full transition-all ${i === slide ? "w-7" : "w-2 bg-[var(--line)]"}`} style={i === slide ? { background: cur.color } : undefined} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PinnedCard({ p }: { p: (typeof PINS)[number] }) {
  return (
    <Link href={p.href} className="card card-hover group flex flex-col gap-3" style={{ borderTop: `3px solid ${p.color}` }}>
      <div className="flex items-center justify-between"><span className="chip chip-up">{p.badge}</span><span className="text-2xl" aria-hidden>{p.icon}</span></div>
      <h3 className="display text-[22px]">{p.title}</h3>
      <p className="text-[13.5px] leading-6 text-[var(--ink-2)]">{p.desc}</p>
      {p.tags.length > 0 && <div className="flex flex-wrap gap-1.5">{p.tags.map((t) => <span key={t} className="chip !text-[10.5px]">{t}</span>)}</div>}
      <span className="mt-auto pt-2 text-sm font-semibold transition group-hover:translate-x-1" style={{ color: p.color }}>{p.action}</span>
    </Link>
  );
}

function ModuleCard({ m, onOpen }: { m: Mod; onOpen: (m: Mod) => void }) {
  const body = (
    <>
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl" style={{ background: `${m.color}1f` }} aria-hidden>{m.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow" style={{ color: m.color }}>{m.num}</p>
          <h3 className="display mt-0.5 text-[19px] leading-tight">{m.title} {m.flag && <span aria-hidden>{m.flag}</span>}</h3>
        </div>
        <span className={`chip ${LEVEL_CHIP[m.level]}`}>{cap(m.level)}</span>
      </div>
      <p className="mt-4 text-[13.5px] leading-6 text-[var(--ink-2)]">{m.desc}</p>
      <div className="mt-4 flex flex-wrap gap-1.5">{m.tags.map((t) => <span key={t} className="chip !text-[10.5px]">{t}</span>)}</div>
      <div className="mt-auto flex items-center justify-between pt-5">
        <span className="muted text-xs">{m.count}</span>
        <span className="chip" style={{ background: `${m.color}1a`, color: m.color, borderColor: "transparent" }}>{m.button}</span>
      </div>
    </>
  );
  const cls = "card card-hover flex flex-col text-left";
  return m.href ? (
    <Link href={m.href} className={cls} style={{ borderTop: `3px solid ${m.color}` }}>{body}</Link>
  ) : (
    <button onClick={() => onOpen(m)} className={cls} style={{ borderTop: `3px solid ${m.color}` }} aria-haspopup="dialog">{body}</button>
  );
}

function ComingSoon({ m, onClose }: { m: Mod | null; onClose: () => void }) {
  useEffect(() => {
    if (!m) return;
    const on = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", on);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", on);
      document.body.style.overflow = "";
    };
  }, [m, onClose]);
  if (!m) return null;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="cs-title" className="card rise relative w-full max-w-md text-center">
        <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full border border-[var(--line)] hover:border-[var(--accent)]">✕</button>
        <div className="text-5xl" aria-hidden>{m.icon}</div>
        <p className="eyebrow mt-4">🏗️ In development</p>
        <h3 id="cs-title" className="display mt-2 text-3xl">{m.title}</h3>
        <p className="mt-3 text-sm leading-7 text-[var(--ink-2)]">{m.modalDesc ?? m.desc}</p>
        <div className="mt-6 text-left">
          <p className="muted mb-2 text-[11px] uppercase tracking-wider">Build progress</p>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]" role="progressbar" aria-valuenow={m.progress} aria-valuemin={0} aria-valuemax={100}>
            <div key={m.title} className="h-full origin-left animate-[fillbar_0.8s_0.1s_ease-out_both] rounded-full" style={{ width: `${m.progress}%`, background: `linear-gradient(90deg, ${m.color}, var(--accent-2))` }} />
          </div>
          <p className="muted mt-2 text-xs">Coming soon — we&apos;re writing the content now.</p>
        </div>
        <button onClick={onClose} autoFocus className="btn btn-ghost mt-6 w-full justify-center">Got it, I&apos;ll check back later</button>
      </div>
    </div>
  );
}

export function Learning() {
  const [open, setOpen] = useState<Mod | null>(null);
  const [level, setLevel] = useState<"all" | Level>("all");
  const close = useCallback(() => setOpen(null), []);
  const shown = MODULES.filter((m) => level === "all" || m.level === level);
  const soon = MODULES.filter((m) => !m.href).length;

  return (
    <>
      <Hero />
      <div className="container-x pb-2">
        <Marquee label="Modules" items={MODULES.map((m) => ({ key: m.num, node: <><span aria-hidden>{m.icon}</span><span className="text-[var(--ink-2)]">{m.title}</span><span className="h-1 w-1 rounded-full bg-[var(--line)]" /></> }))} />
      </div>

      <div id="modules" className="container-x scroll-mt-20 space-y-12 py-8">
        <nav aria-label="Breadcrumb" className="muted text-xs"><Link href="/" className="hover:text-[var(--accent)]">Home</Link> / <span>Learning Center</span></nav>

        <section aria-labelledby="pinned">
          <p className="eyebrow">Start here</p>
          <h2 id="pinned" className="section-title mt-1">📌 Pinned — start here</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{PINS.map((p) => <PinnedCard key={p.href} p={p} />)}</div>
        </section>

        <section aria-labelledby="all-modules">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="eyebrow">Curriculum</p><h2 id="all-modules" className="section-title mt-1">📂 All modules</h2></div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="chip chip-warn">{soon} coming soon</span>
              <div className="seg" role="group" aria-label="Filter by level">
                {([["all", "All"], ["beginner", "Beginner"], ["intermediate", "Intermediate"], ["advanced", "Advanced"]] as const).map(([v, l]) => <button key={v} aria-pressed={level === v} onClick={() => setLevel(v)}>{l}</button>)}
              </div>
            </div>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{shown.map((m) => <ModuleCard key={m.num} m={m} onOpen={setOpen} />)}</div>
          {!shown.length && <p className="muted py-10 text-center text-sm">No modules at this level.</p>}
        </section>
      </div>
      <ComingSoon m={open} onClose={close} />
    </>
  );
}
