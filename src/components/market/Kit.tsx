"use client";

import { useMemo, useState, type ReactNode } from "react";
import { safeHref } from "@/lib/safe-url";

/** Marquee of quotes (duplicated track for a seamless loop; pauses on hover). */
export function Marquee({ items, label }: { items: { key: string; node: ReactNode }[]; label: string }) {
  if (!items.length) return null;
  const row = (s: string) => items.map((i) => <span key={s + i.key} className="flex shrink-0 items-center gap-2 px-4 text-[12.5px]">{i.node}</span>);
  return (
    <div className="tape overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] [mask-image:linear-gradient(90deg,transparent,black_28px,black_calc(100%-28px),transparent)]" aria-label={label}>
      <div className="tape-track flex w-max items-center py-2.5">{row("a")}{row("b")}</div>
    </div>
  );
}

export function PageHero({ eyebrow, title, intro, right }: { eyebrow: string; title: ReactNode; intro: ReactNode; right?: ReactNode }) {
  return (
    <header className="container-x flex flex-wrap items-end justify-between gap-6 pb-4 pt-8 md:pt-10">
      <div className="max-w-3xl">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display mt-3 text-[clamp(28px,4vw,48px)]">{title}</h1>
        <p className="mt-4 text-[14.5px] leading-7 text-[var(--ink-2)]">{intro}</p>
      </div>
      {right && <div className="flex flex-wrap items-center gap-3">{right}</div>}
    </header>
  );
}

export function CacheTag({ cached }: { cached?: boolean }) {
  if (cached === undefined) return null;
  return <span className={`chip ${cached ? "" : "chip-up"} !text-[10.5px]`}>{cached ? "⚡ cached" : "● live"}</span>;
}

export function SectionCard({ title, sub, cached, right, children, id }: { title: string; sub?: string; cached?: boolean; right?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="card" aria-label={title}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5"><h2 className="section-title !text-[20px]">{title}</h2><CacheTag cached={cached} /></div>
          {sub && <p className="muted mt-1 text-xs">{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: [T, string][]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {tabs.map(([id, l]) => <button key={id} role="tab" aria-selected={value === id} onClick={() => onChange(id)}>{l}</button>)}
    </div>
  );
}

export const Empty = ({ children = "No data available." }: { children?: ReactNode }) => <p className="muted py-10 text-center text-sm">📭 {children}</p>;
export const Loading = ({ h = 240 }: { h?: number }) => <div className="skeleton w-full" style={{ height: h }} aria-hidden />;
export const ErrorBox = ({ msg }: { msg: string }) => <div role="alert" className="rounded-xl border border-[var(--down)]/40 bg-[var(--down-soft)] p-4 text-sm text-[var(--down)]">⚠️ Failed to load: {msg}</div>;

export const Rank = ({ i }: { i: number }) => (
  <span className={`num grid h-6 w-6 place-items-center rounded-full text-[11px] ${i < 3 ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--surface-2)] text-[var(--ink-3)]"}`}>{i + 1}</span>
);

/** Remote logo that disappears if it fails to load (as in the originals). Only http(s) URLs are rendered. */
export function Logo({ src, alt, round }: { src?: string | null; alt: string; round?: boolean }) {
  const [bad, setBad] = useState(false);
  const href = safeHref(src);
  if (!href || bad) return <span className={`grid h-7 w-7 shrink-0 place-items-center bg-[var(--surface-2)] text-[11px] font-semibold text-[var(--ink-3)] ${round ? "rounded-full" : "rounded-lg"}`}>{(alt || "?").replace("^", "")[0]?.toUpperCase()}</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={href} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} className={`h-7 w-7 shrink-0 bg-white object-contain p-[2px] ${round ? "rounded-full" : "rounded-lg"}`} />;
}

export type Col<T> = { head: ReactNode; align?: "right"; cell: (row: T, i: number) => ReactNode; /** Makes the column header sortable by this value. */ sort?: (row: T) => number | string | null | undefined };

/** Table with optional 10 / 25 / All paginator (same behaviour as the crypto tables). */
export function DataTable<T>({ rows: input, cols, pager = false, empty, label, defaultSize = 25 }: { rows: T[]; cols: Col<T>[]; pager?: boolean; empty?: string; label: string; defaultSize?: number }) {
  const [size, setSize] = useState(defaultSize);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const rows = useMemo(() => {
    const fn = sort != null ? cols[sort.col]?.sort : undefined;
    if (!fn || !sort) return input;
    const dir = sort.dir;
    return [...input].sort((a, b) => {
      const av = fn(a), bv = fn(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv))) * dir;
    });
  }, [input, cols, sort]);
  const total = rows.length;
  const pageSize = !pager || size === 0 ? total : size;
  const pages = Math.max(1, Math.ceil(total / (pageSize || 1)));
  const cur = Math.min(page, pages);
  const start = (cur - 1) * pageSize;
  const slice = useMemo(() => rows.slice(start, start + pageSize), [rows, start, pageSize]);
  if (!total) return <Empty>{empty}</Empty>;

  const from = total ? start + 1 : 0;
  const to = Math.min(start + pageSize, total);
  const range: number[] = [];
  if (size !== 0 && pages > 1) {
    let s = Math.max(1, cur - 3);
    const e = Math.min(pages, s + 6);
    s = Math.max(1, e - 6);
    for (let p = s; p <= e; p++) range.push(p);
  }

  return (
    <div>
      <div className="-mx-1 max-h-[640px] overflow-auto px-1">
        <table className="w-full min-w-[720px] text-[13px]" aria-label={label}>
          <thead className="sticky top-0 z-10 bg-[var(--surface)]">
            <tr className="border-b border-[var(--line)] text-left text-[10.5px] uppercase tracking-wider text-[var(--ink-3)]">
              {cols.map((c, i) => (
                <th key={i} aria-sort={sort?.col === i ? (sort.dir === 1 ? "ascending" : "descending") : undefined} className={`whitespace-nowrap px-2.5 py-3 font-semibold ${c.align === "right" ? "text-right" : ""} ${c.sort ? "cursor-pointer select-none hover:text-[var(--ink)]" : ""}`} onClick={c.sort ? () => setSort((s) => (s?.col === i ? { col: i, dir: s.dir === 1 ? -1 : 1 } : { col: i, dir: -1 })) : undefined}>
                  {c.head}{c.sort && <span className={sort?.col === i ? "text-[var(--accent)]" : "opacity-40"}> {sort?.col === i ? (sort.dir === 1 ? "↑" : "↓") : "⇅"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((r, i) => (
              <tr key={start + i} className="border-b border-[var(--line)]/60 transition hover:bg-[var(--surface-2)]/70">
                {cols.map((c, j) => <td key={j} className={`px-2.5 py-2.5 ${c.align === "right" ? "text-right" : ""}`}>{c.cell(r, start + i)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pager && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="muted">Showing {from}–{to} of {total}</span>
          <div className="seg" role="group" aria-label="Rows per page">
            {([[10, "10"], [25, "25"], [0, "All"]] as const).map(([v, l]) => <button key={l} aria-pressed={size === v} onClick={() => { setSize(v); setPage(1); }}>{l}</button>)}
          </div>
          <div className="flex items-center gap-1.5">
            <button className="chip" disabled={cur <= 1} onClick={() => setPage(cur - 1)}>‹ Prev</button>
            {range.map((p) => <button key={p} aria-current={p === cur ? "page" : undefined} onClick={() => setPage(p)} className={`chip ${p === cur ? "chip-gold !border-[var(--accent)]" : ""}`}>{p}</button>)}
            <button className="chip" disabled={cur >= pages || size === 0} onClick={() => setPage(cur + 1)}>Next ›</button>
          </div>
        </div>
      )}
    </div>
  );
}
