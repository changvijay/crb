"use client";

import { useEffect, useState } from "react";
import type { TocItem } from "@/lib/guides";

/** Scroll-spy table of contents + reading-progress bar. */
export function Toc({ items, label = "In this guide", filter = false }: { items: TocItem[]; label?: string; filter?: boolean }) {
  const [q, setQ] = useState("");
  const links = items.filter((i): i is { id: string; label: string } => !!i.id);
  const [active, setActive] = useState(links[0]?.id ?? "");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const els = links.map((i) => document.getElementById(i.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver((entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)), { rootMargin: "-90px 0px -65% 0px", threshold: 0 });
    els.forEach((el) => io.observe(el));
    const on = () => {
      const h = document.documentElement;
      setProgress(Math.min(100, Math.max(0, (h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight)) * 100)));
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", on);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-[60] h-[3px] bg-transparent lg:left-[var(--rail)]" role="progressbar" aria-label="Reading progress" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)]" style={{ width: `${progress}%` }} />
      </div>

      {progress > 8 && (
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Back to top of page" title="Back to top" className="btn btn-primary fixed bottom-20 right-5 z-40 !h-11 !w-11 justify-center !p-0 lg:bottom-6">↑</button>
      )}

      <nav aria-label="Table of contents" className="sticky top-24 hidden max-h-[calc(100vh-8rem)] overflow-auto text-[13.5px] lg:block">
        <p className="eyebrow mb-3">{label}</p>
        {filter && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter chapters…" aria-label="Filter chapters" className="mb-3 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]" />}
        <ol className="space-y-0.5 border-l border-[var(--line)]">
          {items.filter((i) => !q.trim() || (i.label ?? i.part ?? "").toLowerCase().includes(q.trim().toLowerCase())).map((i, n) => i.part ? (
            <li key={`p${n}`} className="eyebrow !text-[10px] pb-1 pl-4 pt-4 !text-[var(--ink-3)]">{i.part}</li>
          ) : (
            <li key={i.id}>
              <a href={`#${i.id}`} aria-current={active === i.id ? "location" : undefined} className={`-ml-px block border-l-2 py-1.5 pl-4 leading-snug transition ${active === i.id ? "border-[var(--accent)] font-medium text-[var(--accent)]" : "border-transparent text-[var(--ink-3)] hover:text-[var(--ink)]"}`}>{i.label}</a>
            </li>
          ))}
        </ol>
      </nav>

      <details className="card mb-5 !p-0 lg:hidden">
        <summary className="cursor-pointer px-5 py-3.5 text-sm font-semibold">{label}</summary>
        <ol className="space-y-1 px-5 pb-4 text-sm">
          {items.map((i, n) => i.part ? <li key={`p${n}`} className="eyebrow !text-[10px] pt-3">{i.part}</li> : <li key={i.id}><a href={`#${i.id}`} className="block py-1 text-[var(--ink-2)]">{i.label}</a></li>)}
        </ol>
      </details>
    </>
  );
}
