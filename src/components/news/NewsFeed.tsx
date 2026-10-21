"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getData } from "@/lib/api";
import { safeHref } from "@/lib/safe-url";
import type { Article, NewsResponse } from "@/lib/news";
import { CollapsibleSection, FilterChips } from "./CollapsibleSection";

const PAGE_SIZE = 9;
const STALE_MS = 5 * 60_000;

const relTime = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
};
const noop = () => () => {};

/** Fixed IST date on the server (crawler-friendly, deterministic); relative time once mounted. */
function When({ iso }: { iso: string }) {
  const d = new Date(iso);
  const rel = useSyncExternalStore(noop, () => relTime(iso), () => "");
  const fixed = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  return (
    <time dateTime={d.toISOString()} title={d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })} className="muted text-xs" suppressHydrationWarning>
      {rel || fixed}
    </time>
  );
}
const trunc = (s: string | undefined, n: number) => (s && s.length > n ? s.slice(0, n) + "…" : s || "");
const clock = (iso?: string) => {
  const d = new Date(iso ?? "");
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
};

export function NewsFeed({ initial }: { initial: NewsResponse | null }) {
  const [data, setData] = useState<NewsResponse | null>(initial);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!initial);
  const [active, setActive] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const top = useRef<HTMLDivElement>(null);

  const load = useCallback((signal?: AbortSignal) => {
    return getData<NewsResponse>("news", { limit: "100" }, signal)
      .then((j) => {
        if (!j.success) throw new Error(j.error || "Failed to fetch news");
        setData(j);
        setError("");
        setActive(new Set());
        setPage(1);
      })
      .catch((e: Error) => e.name !== "AbortError" && setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const age = initial?.meta?.fetchedAt ? Date.now() - new Date(initial.meta.fetchedAt).getTime() : Infinity;
    if (initial && age < STALE_MS) return;
    const ctl = new AbortController();
    load(ctl.signal);
    return () => ctl.abort();
  }, [initial, load]);

  const refresh = () => {
    setLoading(true);
    load();
  };

  const articles = useMemo(() => data?.articles ?? [], [data]);
  const filtered = useMemo(() => (active.size ? articles.filter((a) => active.has(a.category ?? "")) : articles), [articles, active]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const items = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const toggle = (c: string) => {
    setActive((s) => {
      const n = new Set(s);
      if (!n.delete(c)) n.add(c);
      return n;
    });
    setPage(1);
  };
  const go = (p: number) => {
    if (p < 1 || p > pages) return;
    setPage(p);
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const pageList: (number | "…")[] = [];
  for (let i = 1, prev = 0; i <= pages; i++) {
    if (i === 1 || i === pages || (i >= current - 2 && i <= current + 2)) {
      if (prev && i - prev > 1) pageList.push("…");
      pageList.push(i);
      prev = i;
    }
  }

  const stats: [string, string | number][] = [
    ["Articles", data?.meta?.totalFetched || articles.length || "—"],
    ["Sources", data?.meta?.sources || "—"],
    ["Fetch time", data?.meta?.responseTime || "—"],
    ["Updated", clock(data?.meta?.fetchedAt)],
  ];

  return (
    <CollapsibleSection
      title="Latest stock market news & headlines"
      count={data ? `${filtered.length} article${filtered.length !== 1 ? "s" : ""}` : undefined}
      actions={
        <button onClick={refresh} disabled={loading} aria-label="Refresh news" className="btn btn-ghost !py-2 disabled:opacity-50">
          <span className={loading ? "inline-block animate-spin" : ""}>↻</span> Refresh
        </button>
      }
    >
      <div ref={top} className="scroll-mt-24" />
      {data && (
        <dl className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4" role="status" aria-live="polite">
          {stats.map(([k, v]) => (
            <div key={k} className="stat">
              <label>{k}</label>
              <div className="num v">{v}</div>
            </div>
          ))}
        </dl>
      )}

      {data?.categories?.length ? (
        <div className="mb-6">
          <FilterChips options={data.categories} active={active} onToggle={toggle} onClear={() => { setActive(new Set()); setPage(1); }} />
        </div>
      ) : null}

      {error && (
        <div role="alert" className="card mb-6 border-[var(--down)] text-sm text-[var(--down)]">
          ⚠ {error}
        </div>
      )}

      {loading && !items.length ? (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-[200px]" />)}
        </div>
      ) : !items.length ? (
        <div className="card text-center">
          <p className="display text-2xl">{error ? "Could not load news" : active.size ? "No articles in this category" : "No recent articles found"}</p>
          <p className="muted mt-1 text-sm">{error ? "Check your connection and retry." : active.size ? "Try a different filter." : "Try again in a few minutes."}</p>
        </div>
      ) : (
        <div role="feed" aria-label="Financial news articles" className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {items.map((a, i) => <ArticleCard key={`${a.url}-${i}`} a={a} i={i} />)}
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-8 flex flex-wrap items-center justify-center gap-2">
          <button className="chip" onClick={() => go(current - 1)} disabled={current === 1} aria-label="Previous page">← Prev</button>
          {pageList.map((p, i) =>
            p === "…" ? <span key={`e${i}`} className="muted px-1">…</span> : (
              <button key={p} onClick={() => go(p)} aria-label={`Page ${p}`} aria-current={p === current ? "page" : undefined} className={`chip ${p === current ? "chip-gold !border-[var(--gold)]" : ""}`}>{p}</button>
            ),
          )}
          <button className="chip" onClick={() => go(current + 1)} disabled={current === pages} aria-label="Next page">Next →</button>
        </nav>
      )}
    </CollapsibleSection>
  );
}

function ArticleCard({ a, i }: { a: Article; i: number }) {
  const href = safeHref(a.url);
  const when = a.publishedAt ? new Date(a.publishedAt) : null;
  return (
    <article className="card rise flex flex-col !p-5 transition hover:-translate-y-0.5 hover:border-[var(--gold)]" style={{ animationDelay: `${(i % 9) * 40}ms` }}>
      <div className="flex items-center justify-between gap-3">
        <span className="chip chip-gold">{a.category || "General"}</span>
        {when && !Number.isNaN(when.getTime()) && <When iso={a.publishedAt!} />}
      </div>
      <h3 className="mt-3 text-[16px] font-semibold leading-snug">
        {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--gold)]">{a.title}</a> : a.title}
      </h3>
      {a.description && <p className="mt-2 text-sm leading-6 text-[var(--ink-2)]">{trunc(a.description, 175)}</p>}
      <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-xs">
        <span className="muted truncate">{a.source || "Unknown"}</span>
        {href && <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`Read full article from ${a.source || "source"}`} className="shrink-0 font-semibold text-[var(--gold)]">Read →</a>}
      </div>
    </article>
  );
}
