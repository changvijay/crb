"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type SearchItem = { id: number; name: string; section: string; sectionId: string; hay: string };

/** Search across all ratios (name, section, definition, formula, purpose, explanation, takeaways), as in the original. */
export function RatioSearch({ items }: { items: SearchItem[] }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? items.filter((i) => i.hay.includes(t)).slice(0, 8) : [];
  }, [q, items]);

  useEffect(() => {
    const on = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", on);
    return () => document.removeEventListener("mousedown", on);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const go = (id: number) => {
    setOpen(false);
    setQ("");
    const el = document.getElementById(`ratio-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.setAttribute("data-highlight", "true"); // highlighted for 4 s, then cleared
    clearTimeout(timer.current);
    timer.current = setTimeout(() => el.removeAttribute("data-highlight"), 4000);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open || !results.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => (s + 1) % results.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => (s - 1 + results.length) % results.length); }
    else if (e.key === "Enter") { e.preventDefault(); go(results[sel].id); }
    else if (e.key === "Escape") { setOpen(false); input.current?.blur(); }
  };

  return (
    <div ref={box} className="relative w-full max-w-md">
      <label className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2.5 text-sm focus-within:border-[var(--accent)]">
        <span aria-hidden>🔍</span>
        <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); setSel(0); }} onFocus={() => q && setOpen(true)} onKeyDown={onKey} placeholder="Search 54 ratios..." role="combobox" aria-label="Search ratios" aria-controls="ratio-results" aria-expanded={open} aria-autocomplete="list" className="w-full bg-transparent outline-none placeholder:text-[var(--ink-3)]" />
        {q && <button type="button" onClick={() => { setQ(""); input.current?.focus(); }} aria-label="Clear search" className="text-[var(--ink-3)] hover:text-[var(--ink)]">✕</button>}
      </label>
      {open && q && (
        <div className="card absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden !p-0">
          {!results.length ? <p className="muted px-4 py-6 text-center text-sm">No ratios found for &quot;{q}&quot;</p> : (
            <ul id="ratio-results" role="listbox" className="max-h-80 overflow-auto py-1">
              {results.map((r, i) => (
                <li key={r.id} role="option" aria-selected={i === sel}>
                  <button onClick={() => go(r.id)} onMouseEnter={() => setSel(i)} className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm ${i === sel ? "bg-[var(--accent-soft)]" : ""}`}>
                    <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[var(--surface-2)] text-[11px] text-[var(--accent)]">{r.id}</span>
                    <span className="min-w-0"><span className="block truncate font-medium">{r.name}</span><span className="muted block truncate text-xs">{r.section}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
