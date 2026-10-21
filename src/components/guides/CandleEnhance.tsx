"use client";

import { useEffect, useState } from "react";

type Open = { src: string; alt: string; name: string; label: string; sentiment: "bull" | "bear" | "neutral" };
const BADGE = { bull: "▲ Bullish", bear: "▼ Bearish", neutral: "⬡ Neutral" } as const;
const EXPAND = '<svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><path d="M1 4.5V1h3.5M8.5 1H12v3.5M12 8.5V12H8.5M4.5 12H1V8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * Behaviour of the Candlestick guide: scroll-triggered fade-ins and the pattern image viewer.
 * The article markup is server-rendered (readable without JS); this only enhances it.
 */
export function CandleEnhance() {
  const [open, setOpen] = useState<Open | null>(null);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".g-candlestick-patterns");
    if (!root) return;
    root.classList.add("js-fi");

    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("v"); io.unobserve(e.target); } }),
      { threshold: 0.06, rootMargin: "0px 0px -30px 0px" },
    );
    root.querySelectorAll(".fi").forEach((el) => io.observe(el));

    const read = (visual: Element): Open | null => {
      const img = visual.querySelector("img");
      if (!img) return null;
      const block = visual.closest(".pattern-block");
      return {
        src: img.getAttribute("src") || "", alt: img.alt,
        name: block?.querySelector(".pb-name")?.textContent?.trim() || "",
        label: visual.querySelector(".pb-visual-label")?.textContent?.trim() || "",
        sentiment: block?.classList.contains("bull") ? "bull" : block?.classList.contains("bear") ? "bear" : "neutral",
      };
    };

    // Make each pattern picture an accessible, clickable viewer trigger (as in the original).
    const visuals = [...root.querySelectorAll(".pb-visual")];
    visuals.forEach((v) => {
      const info = read(v);
      if (!info) return;
      const hint = document.createElement("div");
      hint.className = "pb-expand-hint";
      hint.innerHTML = EXPAND;
      v.appendChild(hint);
      v.setAttribute("role", "button");
      v.setAttribute("tabindex", "0");
      v.setAttribute("aria-label", `View ${info.name} pattern image in full size`);
      (v as HTMLElement).style.cursor = "pointer";
    });
    const onClick = (e: Event) => {
      const v = (e.target as Element).closest(".pb-visual");
      const info = v && read(v);
      if (info) setOpen(info);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Enter" || e.key === " ") && (e.target as Element).classList?.contains("pb-visual")) {
        e.preventDefault();
        const info = read(e.target as Element);
        if (info) setOpen(info);
      }
    };
    root.addEventListener("click", onClick);
    root.addEventListener("keydown", onKey);
    return () => {
      io.disconnect();
      root.removeEventListener("click", onClick);
      root.removeEventListener("keydown", onKey);
      visuals.forEach((v) => v.querySelector(".pb-expand-hint")?.remove());
      root.classList.remove("js-fi");
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const on = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("keydown", on);
    document.body.style.overflow = "hidden";
    document.getElementById("pmClose")?.focus();
    return () => {
      document.removeEventListener("keydown", on);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open]);

  return (
    <div id="patternModal" className={`pattern-modal${open ? " open" : ""}`} role="dialog" aria-modal="true" aria-labelledby="pmName" aria-hidden={!open} data-sentiment={open?.sentiment}>
      <div className="pm-backdrop" onClick={() => setOpen(null)} />
      <div className="pm-box">
        <button id="pmClose" className="pm-close" aria-label="Close image viewer" onClick={() => setOpen(null)}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
        <div className="pm-img-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {open && <img id="pmImg" src={open.src} alt={open.alt} decoding="async" />}
        </div>
        <div className="pm-info">
          <div className={`pm-badge ${open?.sentiment ?? ""}`}>{open ? BADGE[open.sentiment] : ""}</div>
          <div id="pmName" className="pm-name">{open?.name}</div>
          <div className="pm-label">{open?.label}</div>
        </div>
        <p className="pm-hint">Press <kbd>Esc</kbd> or click outside to close</p>
      </div>
    </div>
  );
}
