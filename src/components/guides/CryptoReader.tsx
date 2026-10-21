"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

const THEMES = [["paper", "Paper"], ["emerald", "Emerald"], ["sepia", "Sepia"], ["midnight", "Midnight"]] as const;
type ThemeId = (typeof THEMES)[number][0];
const TOTAL = 35;
const COVER = { src: "/images/page_1_img_1.webp", cap: "Understanding Crypto: Cover Infographic & Architecture Overview" };

const read = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
};
const write = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage blocked */
  }
};

/**
 * The Crypto guide's reader: 4 reading themes, font size, audio reader, per-chapter "read" tracking
 * (stored in this browser only) and the figure lightbox. The article itself is server-rendered.
 */
export function CryptoReader() {
  const anchor = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<ThemeId>("paper");
  const [done, setDone] = useState<number[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [box, setBox] = useState<{ src: string; cap: string } | null>(null);
  const root = useCallback(() => anchor.current?.closest<HTMLElement>(".g-crypto-guide") ?? null, []);

  // Restore saved preferences (after hydration, so the server HTML stays identical).
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const r = root();
      const t = read<ThemeId>("crypto_theme", "paper");
      setTheme(THEMES.some(([k]) => k === t) ? t : "paper");
      const px = read<number | null>("crypto_font_size", null);
      if (px && r) r.style.setProperty("--g-user-font-size", `${Number(px)}px`);
      const saved = read<number[]>("crypto_bookmarks", []);
      setDone(Array.isArray(saved) ? saved.filter((n) => Number.isInteger(n)) : []);
    });
    return () => cancelAnimationFrame(id);
  }, [root]);

  // Reading theme lives on the guide wrapper (never on <html>), so it can't clash with the site theme.
  useEffect(() => {
    const r = root();
    if (!r) return;
    if (theme === "paper") r.removeAttribute("data-reader");
    else r.setAttribute("data-reader", theme);
  }, [theme, root]);

  // Chapter "mark as read" checkboxes + lightbox triggers (event delegation over the static HTML).
  useEffect(() => {
    const r = root();
    if (!r) return;
    r.querySelectorAll<HTMLInputElement>(".chapter-check").forEach((cb) => {
      const n = Number(cb.dataset.ch);
      cb.checked = done.includes(n);
      document.getElementById(`ch${n}`)?.classList.toggle("completed", cb.checked);
    });
  }, [done, root]);

  useEffect(() => {
    const r = root();
    if (!r) return;
    const onChange = (e: Event) => {
      const cb = e.target as HTMLInputElement;
      if (!cb.classList?.contains("chapter-check")) return;
      const n = Number(cb.dataset.ch);
      setDone((d) => {
        const next = cb.checked ? [...new Set([...d, n])] : d.filter((x) => x !== n);
        write("crypto_bookmarks", next);
        return next;
      });
    };
    const trigger = (el: Element | null) => {
      const t = el?.closest<HTMLElement>("[data-lightbox-src]");
      if (t) setBox({ src: t.dataset.lightboxSrc || "", cap: t.dataset.lightboxCap || "" });
    };
    const onClick = (e: Event) => trigger(e.target as Element);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { const t = (e.target as Element).closest("[data-lightbox-src]"); if (t) { e.preventDefault(); trigger(t); } } };
    r.addEventListener("change", onChange);
    r.addEventListener("click", onClick);
    r.addEventListener("keydown", onKey);
    return () => {
      r.removeEventListener("change", onChange);
      r.removeEventListener("click", onClick);
      r.removeEventListener("keydown", onKey);
    };
  }, [root]);

  useEffect(() => {
    if (!box) return;
    const on = (e: KeyboardEvent) => e.key === "Escape" && setBox(null);
    document.addEventListener("keydown", on);
    return () => document.removeEventListener("keydown", on);
  }, [box]);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const pickTheme = (t: ThemeId) => { setTheme(t); write("crypto_theme", t); };
  const setFont = (px: number) => { root()?.style.setProperty("--g-user-font-size", `${px}px`); write("crypto_font_size", px); };

  // Same behaviour as the original: reads the opening of the guide aloud.
  const toggleAudio = () => {
    const synth = window.speechSynthesis;
    if (!synth) return alert("Audio Speech Synthesis is not supported in your browser.");
    if (speaking) { synth.cancel(); setSpeaking(false); return; }
    const text = (root()?.querySelector("article")?.textContent || "").trim().substring(0, 1000);
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.onend = () => setSpeaking(false);
    synth.speak(u);
    setSpeaking(true);
  };

  const pct = Math.round((done.length / TOTAL) * 100);
  const btn = (active: boolean) => `chip transition ${active ? "chip-gold !border-[var(--accent)]" : "hover:border-[var(--accent)]"}`;

  return (
    <div ref={anchor} className="contents">
      <div className="sticky top-[44px] z-20 -mx-1 mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-4 py-2.5 backdrop-blur-xl lg:top-[44px]" role="toolbar" aria-label="Reader settings">
        <div className="flex flex-wrap items-center gap-1.5"><span className="muted mr-1 text-[11px] font-semibold uppercase tracking-wider">Theme</span>{THEMES.map(([k, l]) => <button key={k} onClick={() => pickTheme(k)} aria-pressed={theme === k} className={btn(theme === k)}>{l}</button>)}</div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="muted mr-1 text-[11px] font-semibold uppercase tracking-wider">Font</span>
          <button onClick={() => setFont(15)} className={btn(false)} aria-label="Smaller text">A-</button>
          <button onClick={() => setFont(17)} className={btn(false)} aria-label="Larger text">A+</button>
          <button onClick={toggleAudio} aria-pressed={speaking} className={btn(speaking)}>{speaking ? "Pause audio" : "🔊 Listen"}</button>
          <span className="chip chip-up num" aria-live="polite">{done.length ? `${done.length} / ${TOTAL} read (${pct}%)` : `0 / ${TOTAL} read`}</span>
        </div>
      </div>

      <button onClick={() => setBox(COVER)} className="group relative mb-8 block w-full overflow-hidden rounded-2xl border border-[var(--line)] text-left" aria-label="Enlarge the cover infographic">
        <Image src={COVER.src} alt="Crypto World Overview Diagram" width={1600} height={900} priority sizes="(min-width:1024px) 900px, 100vw" className="h-auto w-full transition group-hover:scale-[1.01]" />
        <span className="chip absolute bottom-3 right-3 bg-[var(--surface)]/90 backdrop-blur">⤢ Click to enlarge cover visual</span>
      </button>

      {box && (
        <div className="lightbox-modal active" style={{ display: "flex" }} onClick={(e) => e.target === e.currentTarget && setBox(null)} role="dialog" aria-modal="true" aria-label="Enlarged diagram">
          <button className="lightbox-close" onClick={() => setBox(null)} aria-label="Close enlarged diagram">&times;</button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="lightbox-content" src={box.src} alt={box.cap} />
          <p className="lightbox-caption">{box.cap}</p>
        </div>
      )}
    </div>
  );
}
