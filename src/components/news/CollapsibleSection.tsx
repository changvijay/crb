"use client";

import { useState, type ReactNode } from "react";

export function CollapsibleSection({ title, count, actions, children }: { title: string; count?: string; actions?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="section container-x" aria-label={title}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="section-title">{title}</h2>
          <div className="rule" />
          {count && <p className="muted mt-2 text-xs">{count}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="btn btn-ghost !py-2">
            {open ? "Hide" : "Show"}
          </button>
        </div>
      </div>
      {open && <div className="mt-6">{children}</div>}
    </section>
  );
}

export function FilterChips({ options, active, onToggle, onClear }: { options: string[]; active: Set<string>; onToggle: (v: string) => void; onClear: () => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
      <button onClick={onClear} aria-pressed={active.size === 0} className={`chip transition ${active.size === 0 ? "chip-gold !border-[var(--gold)]" : "hover:border-[var(--gold)]"}`}>
        All
      </button>
      {options.map((c) => (
        <button key={c} onClick={() => onToggle(c)} aria-pressed={active.has(c)} className={`chip transition ${active.has(c) ? "chip-gold !border-[var(--gold)]" : "hover:border-[var(--gold)]"}`}>
          {c}
        </button>
      ))}
    </div>
  );
}
