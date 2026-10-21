"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";

const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, n));

const STATEMENT =
  "We turn the noise of live markets into a clear plan before the opening bell. Every morning, real-time NSE data, global indices and aggregated news are synthesised into support and resistance levels, momentum reads and a plain-language outlook you can act on.";

const STEPS = [
  { n: "01", t: "Collect", d: "Real-time NSE data, global indices, commodities, currencies and financial news from multiple sources are gathered every trading morning.", c: "var(--info)" },
  { n: "02", t: "Compute", d: "Pivot points, option-chain open interest, RSI, MACD, Bollinger Bands, Stochastic RSI and SMA / EMA averages are calculated for each index.", c: "var(--violet)" },
  { n: "03", t: "Synthesise", d: "AI-driven synthesis turns the numbers into support and resistance levels, a sentiment read and impact-ranked key events.", c: "var(--accent)" },
  { n: "04", t: "Publish", d: "The pre-market report goes live before the Indian market opens — with plain-language interpretation next to every indicator.", c: "var(--up)" },
];

const STATS: [number, string, string][] = [
  [3, "", "Indices analysed — Nifty 50, Bank Nifty, Sensex"],
  [4, "", "Market modules — News, NSE, US, Crypto"],
  [6, "+", "Indicators per index, from RSI to pivots"],
  [1, "", "Fresh pre-market report every trading day"],
];

const FEATURES = [
  ["Support & resistance", "Levels computed from pivot points and option-chain open interest for Nifty 50, Bank Nifty and Sensex.", "R/S"],
  ["Indicators, explained", "RSI, MACD, Bollinger Bands and Stochastic RSI — each with a plain-language reading.", "ƒ"],
  ["Trend direction", "SMA 5/10/20/50 and EMA 9/21 alignment to show where the trend really is.", "↗"],
  ["Option-chain PCR", "Put-call ratio and max-OI strikes to read positioning in the market.", "Σ"],
  ["Sentiment & outlook", "A Bullish, Bearish or Neutral intraday outlook with the reasoning behind it.", "◐"],
  ["Global snapshot", "US, European and Asian markets plus commodities and currencies, in one glance.", "◍"],
] as const;

const MODULES = [
  ["/news", "Stock market news", "Real-time headlines, FII/DII flows and market events."],
  ["/nse-data", "NSE data", "Live Indian indices, gainers & losers, option analytics."],
  ["/us-market", "US markets", "Wall Street equities, S&P 500 heatmap and global cues."],
  ["/crypto", "Crypto", "Top coins, market cap heatmap and dominance."],
  ["/learning", "Learning hub", "Guides from market basics to technical and fundamental analysis."],
  ["/recommendations", "Trade picks", "Curated buy & sell setups with entry, stop-loss and targets."],
] as const;

function Counter({ to, suffix }: { to: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [v, setV] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      if (reduce) return setV(to);
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = clamp((t - t0) / 1400);
        setV(Math.round(to * (1 - Math.pow(1 - p, 4))));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [to]);
  return <span ref={ref} className="num">{v}{suffix}</span>;
}

export function AboutScroll() {
  const root = useRef<HTMLDivElement>(null);
  const words = STATEMENT.split(" ");

  // One rAF-throttled scroll loop drives every effect through CSS variables:
  //  [data-speed]  parallax translate   [data-prog] 0→1 progress of the element through the viewport
  //  [data-pin]    0→1 progress through a tall pinned section (horizontal track, word reveal)
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.querySelectorAll<HTMLElement>("[data-pin]").forEach((n) => n.style.setProperty("--pin", "1"));
      return;
    }
    const par = [...el.querySelectorAll<HTMLElement>("[data-speed]")];
    const prog = [...el.querySelectorAll<HTMLElement>("[data-prog]")];
    const pins = [...el.querySelectorAll<HTMLElement>("[data-pin]")];
    let raf = 0;
    const update = () => {
      raf = 0;
      const vh = window.innerHeight;
      const hero = el.querySelector<HTMLElement>("[data-hero]");
      const heroP = hero ? clamp(-hero.getBoundingClientRect().top / hero.offsetHeight) : 0;
      el.style.setProperty("--hero", heroP.toFixed(4));
      for (const n of par) n.style.transform = `translate3d(0, ${(heroP * vh * Number(n.dataset.speed)).toFixed(1)}px, 0)`;
      for (const n of prog) { const r = n.getBoundingClientRect(); n.style.setProperty("--p", clamp((vh - r.top) / (vh + r.height)).toFixed(4)); }
      for (const n of pins) { const r = n.getBoundingClientRect(); n.style.setProperty("--pin", clamp(-r.top / Math.max(1, r.height - vh)).toFixed(4));
        const tr = n.querySelector<HTMLElement>(".about-track");
        if (tr) tr.style.setProperty("--max", String(Math.max(0, tr.scrollWidth - n.clientWidth)));
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);

  return (
    <div ref={root} className="about overflow-x-clip">
      {/* ── Hero: layered parallax ── */}
      <section data-hero className="relative isolate flex min-h-[100svh] items-center justify-center overflow-hidden">
        <div data-speed="0.15" aria-hidden className="about-grid absolute inset-0 -z-10" />
        <div data-speed="0.35" aria-hidden className="absolute -left-32 top-10 -z-10 h-[420px] w-[420px] rounded-full bg-[var(--accent)] opacity-20 blur-[110px]" />
        <div data-speed="0.55" aria-hidden className="absolute -right-24 bottom-0 -z-10 h-[480px] w-[480px] rounded-full bg-[var(--accent-2)] opacity-20 blur-[120px]" />
        {[
          ["Nifty 50", "left-[8%] top-[22%]", "0.7", "up"], ["Bank Nifty", "right-[10%] top-[30%]", "0.45", "down"],
          ["Sensex", "left-[14%] bottom-[20%]", "0.9", "up"], ["RSI 47.7", "right-[16%] bottom-[24%]", "0.6", ""],
          ["Support · Resistance", "left-[40%] top-[12%]", "0.3", ""],
        ].map(([t, pos, sp, tone]) => (
          <span key={t} data-speed={sp} aria-hidden className={`chip absolute hidden backdrop-blur md:inline-flex ${pos} ${tone === "up" ? "chip-up" : tone === "down" ? "chip-down" : ""} about-float`} style={{ animationDelay: `${Number(sp) * 3}s` }}>{t}</span>
        ))}
        <div data-speed="0.12" className="container-x relative text-center" style={{ opacity: "calc(1 - var(--hero, 0) * 1.4)" } as CSSProperties}>
          <p className="eyebrow about-in" style={{ "--i": 0 } as CSSProperties}>About us</p>
          <h1 className="display about-in mx-auto mt-4 max-w-5xl text-[clamp(44px,8.5vw,120px)]" style={{ "--i": 1 } as CSSProperties}>
            Research that <span className="grad-text">moves</span><br />before the market does.
          </h1>
          <p className="about-in mx-auto mt-6 max-w-xl text-[17px] leading-8 text-[var(--ink-2)]" style={{ "--i": 2 } as CSSProperties}>
            Chang Research Base (CRB) delivers research-based daily pre-market reports for Indian and global markets.
          </p>
          <div className="about-in mt-8 flex flex-wrap justify-center gap-3" style={{ "--i": 3 } as CSSProperties}>
            <Link href="/" className="btn btn-primary">Read today&apos;s report</Link>
            <a href="#how" className="btn btn-ghost">How it works ↓</a>
          </div>
        </div>
        <div aria-hidden className="absolute bottom-4 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-[10px] [@media(min-height:960px)]:flex uppercase tracking-[0.25em] text-[var(--ink-3)]">
          Scroll <span className="about-scroll-line h-10 w-px bg-gradient-to-b from-[var(--accent)] to-transparent" />
        </div>
      </section>

      {/* ── Statement: words light up with scroll ── */}
      <section data-pin className="relative h-[220vh]">
        <div className="container-x sticky top-0 flex h-screen items-center">
          <p className="display max-w-5xl text-[clamp(26px,4.2vw,56px)] !leading-[1.15] !tracking-tight" aria-label={STATEMENT}>
            {words.map((w, i) => (
              <span key={i} aria-hidden className="about-word" style={{ "--a": i / words.length } as CSSProperties}>{w} </span>
            ))}
          </p>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="container-x py-20">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map(([n, s, l], i) => (
            <div key={l} data-prog className="card about-rise" style={{ "--i": i } as CSSProperties}>
              <p className="display grad-text text-[64px]"><Counter to={n} suffix={s} /></p>
              <p className="muted mt-1 text-sm leading-6">{l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pinned horizontal scroll: how a report is made ── */}
      <section id="how" data-pin className="relative h-[420vh] scroll-mt-0">
        <div className="sticky top-0 flex h-screen flex-col justify-center overflow-hidden">
          <div className="container-x mb-8">
            <p className="eyebrow">The pipeline</p>
            <h2 className="display mt-2 text-[clamp(32px,5vw,64px)]">From raw data to a morning plan.</h2>
          </div>
          <div className="about-track flex gap-5 pl-[max(16px,calc((100vw-1360px)/2+32px))] pr-16">
            {STEPS.map((s) => (
              <article key={s.n} className="card about-step relative flex h-[46vh] min-h-[280px] w-[min(82vw,460px)] shrink-0 flex-col justify-between overflow-hidden">
                <span aria-hidden className="display absolute -right-2 -top-6 text-[150px] opacity-[0.07]" style={{ color: s.c }}>{s.n}</span>
                <span className="num grid h-11 w-11 place-items-center rounded-2xl text-sm font-bold" style={{ background: `color-mix(in srgb, ${s.c} 18%, transparent)`, color: s.c }}>{s.n}</span>
                <div>
                  <h3 className="display text-4xl" style={{ color: s.c }}>{s.t}</h3>
                  <p className="mt-3 max-w-sm text-[15px] leading-7 text-[var(--ink-2)]">{s.d}</p>
                </div>
              </article>
            ))}
          </div>
          <div className="container-x mt-8" aria-hidden>
            <div className="h-0.5 w-full rounded-full bg-[var(--line)]"><div className="about-bar h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)]" /></div>
          </div>
        </div>
      </section>

      {/* ── Features: staggered rise + parallax depth ── */}
      <section className="container-x py-24">
        <div className="mb-10 max-w-2xl">
          <p className="eyebrow">What you get</p>
          <h2 className="display mt-2 text-[clamp(32px,5vw,60px)]">Every report, fully loaded.</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([t, d, g], i) => (
            <article key={t} data-prog className="card card-hover about-rise" style={{ "--i": i % 3, "--shift": i % 2 ? "28px" : "0px" } as CSSProperties}>
              <span aria-hidden className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--accent-soft)] text-lg font-bold text-[var(--accent)]">{g}</span>
              <h3 className="mt-4 text-xl font-semibold">{t}</h3>
              <p className="muted mt-2 text-sm leading-6">{d}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── Marquee ── */}
      <section aria-hidden className="overflow-hidden border-y border-[var(--line)] py-6">
        <div className="about-marquee flex w-max gap-10 whitespace-nowrap">
          {[0, 1].map((k) => (
            <div key={k} className="flex gap-10">
              {["Nifty 50", "Bank Nifty", "Sensex", "Support & Resistance", "RSI", "MACD", "Bollinger Bands", "Option Chain PCR", "FII / DII", "Global Markets", "Crypto", "US Markets"].map((t) => (
                <span key={t + k} className="display text-[clamp(28px,4vw,52px)] text-[var(--ink-3)]/60">{t} <span className="text-[var(--accent)]">✦</span></span>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ── Modules ── */}
      <section className="container-x py-24">
        <div className="mb-10 max-w-2xl">
          <p className="eyebrow">Explore CRB</p>
          <h2 className="display mt-2 text-[clamp(32px,5vw,60px)]">One platform, every market.</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {MODULES.map(([href, t, d], i) => (
            <Link key={href} href={href} data-prog className="card card-hover about-rise group flex items-center justify-between gap-4" style={{ "--i": i % 2 } as CSSProperties}>
              <span><span className="block text-xl font-semibold">{t}</span><span className="muted mt-1 block text-sm">{d}</span></span>
              <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[var(--line)] transition-all duration-300 group-hover:translate-x-1 group-hover:border-[var(--accent)] group-hover:text-[var(--accent)]">→</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Closing ── */}
      <section data-prog className="relative isolate overflow-hidden py-32 text-center">
        <div aria-hidden className="about-closer absolute left-1/2 top-1/2 -z-10 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] opacity-25 blur-[120px]" />
        <div className="container-x">
          <h2 className="display mx-auto max-w-4xl text-[clamp(36px,6.5vw,88px)]">Start every trading day <span className="grad-text">informed.</span></h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/" className="btn btn-primary">Open today&apos;s report</Link>
            <Link href="/learning" className="btn btn-ghost">Learn the method</Link>
          </div>
          <p className="muted mx-auto mt-10 max-w-2xl text-xs leading-6">
            Chang Research Base provides information for educational purposes only. Reports are AI-assisted and are not investment advice. Markets involve risk — consult a SEBI-registered advisor before investing.
          </p>
        </div>
      </section>
    </div>
  );
}
