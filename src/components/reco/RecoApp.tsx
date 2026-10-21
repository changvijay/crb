"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getData } from "@/lib/api";
import { advisorOf, avatarBg, RecoCard } from "./RecoCard";
import { RecoModal } from "./RecoModal";
import type { Reco, RecoPage } from "./types";

const FILTERS = {
  status: { label: "Status", options: [["", "All"], ["OPEN", "Open"], ["FAILED", "Failed"], ["SUCCESS", "Success"], ["CLOSED", "Closed"]] },
  tradeType: { label: "Type", options: [["", "All"], ["BUY", "Buy"], ["SELL", "Sell"]] },
  term: { label: "Term", options: [["", "All"], ["INTRADAY", "Intraday"], ["SHORT_TERM", "Short"], ["MEDIUM_TERM", "Medium"], ["LONG_TERM", "Long"]] },
} as const;
type FilterKey = keyof typeof FILTERS;

const SORTS = [
  ["createdAt:desc", "Latest"], ["ltp:desc", "LTP ↓"], ["ltp:asc", "LTP ↑"],
  ["upsidePotential:desc", "Upside ↓"], ["upsidePotential:asc", "Upside ↑"],
  ["pctVsEntry:desc", "% vs Entry ↓"], ["pctVsEntry:asc", "% vs Entry ↑"],
] as const;

const pageRange = (cur: number, total: number): (number | "…")[] => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const r: (number | "…")[] = [1];
  if (cur > 3) r.push("…");
  for (let p = Math.max(2, cur - 1); p <= Math.min(total - 1, cur + 1); p++) r.push(p);
  if (cur < total - 2) r.push("…");
  r.push(total);
  return r;
};

function useCountUp(target: number | null) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (target == null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = requestAnimationFrame(() => setV(target));
      return () => cancelAnimationFrame(id);
    }
    const start = performance.now();
    let id = 0;
    const step = (now: number) => {
      const t = Math.min((now - start) / 900, 1);
      setV(Math.round((1 - Math.pow(1 - t, 3)) * target));
      if (t < 1) id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [target]);
  return target == null ? "—" : v;
}

function Stats() {
  const [s, setS] = useState<(number | null)[]>([null, null, null, null]);
  useEffect(() => {
    let alive = true;
    const q = (extra: Record<string, string>) => getData<RecoPage>("recos", { limit: "1", ...extra }).then((j) => j.total ?? 0).catch(() => null);
    Promise.all([q({}), q({ status: "OPEN" }), q({ tradeType: "BUY" }), q({ tradeType: "SELL" })]).then((r) => alive && setS(r));
    return () => {
      alive = false;
    };
  }, []);
  const [total, open, buy, sell] = [useCountUp(s[0]), useCountUp(s[1]), useCountUp(s[2]), useCountUp(s[3])];
  const items: [string, string | number, string][] = [["Total", total, ""], ["Open", open, "up"], ["Buy calls", buy, "text-[var(--info)]"], ["Sell calls", sell, "down"]];
  return (
    <aside className="card w-full max-w-md" aria-label="Summary statistics">
      <p className="eyebrow">Session snapshot</p>
      <dl className="mt-4 grid grid-cols-4 gap-3 text-center">
        {items.map(([l, v, c]) => (
          <div key={l}><dd className={`num text-3xl font-medium ${c}`}>{v}</dd><dt className="muted mt-1 text-[11px]">{l}</dt></div>
        ))}
      </dl>
    </aside>
  );
}

function FilterGroup({ k, value, onChange }: { k: FilterKey; value: string; onChange: (v: string) => void }) {
  const f = FILTERS[k];
  return (
    <div role="group" aria-label={`Filter by ${f.label.toLowerCase()}`} className="flex flex-wrap items-center gap-1.5">
      <span className="muted mr-1 text-[11px] font-semibold uppercase tracking-wider">{f.label}</span>
      {f.options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} aria-pressed={value === v} className={`chip transition ${value === v ? "chip-gold !border-[var(--gold)]" : "hover:border-[var(--gold)]"}`}>{l}</button>
      ))}
    </div>
  );
}

/** Key of the default view (page 1, no filters, newest first): the server-rendered `initial` page belongs to it. */
const DEFAULT_KEY = JSON.stringify([1, { status: "", tradeType: "", term: "" }, "", "createdAt:desc"]);

export function RecoApp({ initial }: { initial?: RecoPage | null }) {
  const [filters, setFilters] = useState<Record<FilterKey, string>>({ status: "", tradeType: "", term: "" });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("createdAt:desc");
  const [group, setGroup] = useState(false);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Reco | null>(null);
  const [panel, setPanel] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const grid = useRef<HTMLDivElement>(null);

  const key = JSON.stringify([page, filters, search, sort]);
  const [result, setResult] = useState<{ key: string; page?: RecoPage; error?: string } | null>(initial?.success ? { key: DEFAULT_KEY, page: initial } : null);
  const seeded = useRef(Boolean(initial?.success));

  useEffect(() => {
    if (seeded.current) {
      seeded.current = false; // the server-rendered first page covers the initial view only
      return;
    }
    const ctl = new AbortController();
    const p: Record<string, string> = { page: String(page), limit: "24" };
    if (filters.status) p.status = filters.status;
    if (filters.tradeType) p.tradeType = filters.tradeType;
    if (filters.term) p.term = filters.term;
    if (search) p.search = search;
    if (sort !== "createdAt:desc") {
      const [by, dir] = sort.split(":");
      p.sortBy = by;
      p.sortDir = dir;
    }
    getData<RecoPage>("recos", p, ctl.signal)
      .then((j) => {
        if (!j.success) throw new Error(j.error || "Failed");
        setResult({ key, page: j });
      })
      .catch((e: Error) => e.name !== "AbortError" && setResult({ key, error: e.message }));
    return () => ctl.abort();
    // `key` is the serialisation of every input used above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    const on = () => setShowTop(window.scrollY > 500);
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const loading = result?.key !== key;
  const data = !loading ? result?.page : undefined;
  const recos = useMemo(() => data?.data ?? [], [data]);

  const setFilter = (k: FilterKey) => (v: string) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
  };
  const onSearch = (v: string) => {
    const clean = v.slice(0, 20);
    setSearchInput(clean);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setSearch(clean.trim());
      setPage(1);
    }, 350);
  };
  const goPage = (p: number) => {
    setPage(p);
    grid.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const groups = useMemo(() => {
    const m = new Map<string, { name: string; type: string; items: Reco[] }>();
    recos.forEach((r) => {
      const { name, type } = advisorOf(r);
      const n = name || "Unknown Advisor";
      const k = n.toLowerCase();
      if (!m.has(k)) m.set(k, { name: n, type, items: [] });
      m.get(k)!.items.push(r);
    });
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [recos]);

  const activeCount = Object.values(filters).filter(Boolean).length;
  const searchBox = (
    <label className="flex min-w-[180px] flex-1 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--bg)] px-4 py-2 focus-within:border-[var(--gold)] md:max-w-[240px]">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
      <input value={searchInput} onChange={(e) => onSearch(e.target.value)} placeholder="Search symbol…" maxLength={20} autoComplete="off" aria-label="Search by symbol" className="w-full bg-transparent text-sm outline-none" />
    </label>
  );
  const sortSelect = (
    <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} aria-label="Sort recommendations" className="rounded-full border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-sm outline-none focus:border-[var(--gold)]">
      {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
  const groupToggle = (
    <div role="group" aria-label="Group view" className="flex items-center gap-1.5">
      <span className="muted mr-1 text-[11px] font-semibold uppercase tracking-wider">View</span>
      {([[false, "Ungrouped"], [true, "By advisor"]] as const).map(([v, l]) => (
        <button key={l} onClick={() => setGroup(v)} aria-pressed={group === v} className={`chip transition ${group === v ? "chip-gold !border-[var(--gold)]" : "hover:border-[var(--gold)]"}`}>{l}</button>
      ))}
    </div>
  );

  return (
    <>
      <section className="container-x grid items-center gap-10 pb-10 pt-14 md:pt-20 lg:grid-cols-[1.2fr_1fr]">
        <div className="rise">
          <p className="eyebrow">Expert picks</p>
          <h1 className="display mt-3 text-[clamp(38px,5.5vw,72px)]">Trade with a <em className="text-[var(--gold)]">system</em>, not noise</h1>
          <p className="mt-5 max-w-xl text-[16px] leading-8 text-[var(--ink-2)]">Curated recommendations from verified advisors, layered with technical context and clean execution levels.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#filters" className="btn btn-primary">Explore picks</a>
            <a href="/learning" className="btn btn-ghost">Learn before you trade</a>
          </div>
        </div>
        <div className="rise flex lg:justify-end"><Stats /></div>
      </section>

      <div id="filters" className="sticky top-[68px] z-30 border-y md:static border-[var(--line)] bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] backdrop-blur-xl">
        <div className="container-x py-3">
          <div className="hidden flex-wrap items-center gap-x-6 gap-y-3 md:flex" aria-label="Filters">
            {searchBox}
            {(Object.keys(FILTERS) as FilterKey[]).map((k) => <FilterGroup key={k} k={k} value={filters[k]} onChange={setFilter(k)} />)}
            {groupToggle}
            <div className="flex items-center gap-1.5"><span className="muted mr-1 text-[11px] font-semibold uppercase tracking-wider">Sort</span>{sortSelect}</div>
            <span className="muted ml-auto text-xs" aria-live="polite">{data ? `${data.total} result${data.total !== 1 ? "s" : ""}` : ""}</span>
          </div>

          <div className="md:hidden">
            <div className="flex items-center gap-2">
              {searchBox}
              <button onClick={() => setPanel((o) => !o)} aria-expanded={panel} aria-controls="filter-panel" className={`btn btn-ghost !px-4 !py-2 ${activeCount ? "!border-[var(--gold)] !text-[var(--gold)]" : ""}`}>
                Filters{activeCount > 0 && <span className="num grid h-5 w-5 place-items-center rounded-full bg-[var(--gold)] text-[11px] text-white">{activeCount}</span>}
              </button>
            </div>
            {panel && (
              <div id="filter-panel" className="mt-3 space-y-3 pb-2">
                {(Object.keys(FILTERS) as FilterKey[]).map((k) => <FilterGroup key={k} k={k} value={filters[k]} onChange={setFilter(k)} />)}
                {groupToggle}
                <div className="flex items-center gap-1.5"><span className="muted mr-1 text-[11px] font-semibold uppercase tracking-wider">Sort</span>{sortSelect}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <section ref={grid} className="container-x scroll-mt-40 py-10" aria-label="Recommendation cards" aria-live="polite">
        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-[340px]" />)}</div>
        ) : result?.error ? (
          <div className="card text-center"><p className="display text-2xl">Couldn&apos;t load recommendations</p><p className="muted mt-1 text-sm">{result.error}</p></div>
        ) : !recos.length ? (
          <div className="card text-center"><p className="display text-2xl">No recommendations found</p><p className="muted mt-1 text-sm">Try adjusting your filters or check back later.</p></div>
        ) : group ? (
          <div className="space-y-10">
            {groups.map((g) => (
              <div key={g.name}>
                <div className="mb-4 flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full font-semibold text-white" style={{ background: avatarBg(g.name) }}>{g.name[0].toUpperCase()}</span>
                  <div><p className="font-semibold">{g.name}</p><p className="muted text-xs">{g.type}</p></div>
                  <span className="chip ml-auto">{g.items.length} pick{g.items.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{g.items.map((r, i) => <RecoCard key={r._id ?? i} r={r} index={i} onOpen={setOpen} />)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{recos.map((r, i) => <RecoCard key={r._id ?? i} r={r} index={i} onOpen={setOpen} />)}</div>
        )}

        {data && data.pages > 1 && (
          <nav aria-label="Pagination" className="mt-10 flex flex-wrap items-center justify-center gap-2">
            <button className="chip" onClick={() => goPage(data.page - 1)} disabled={data.page <= 1} aria-label="Previous page">← Prev</button>
            {pageRange(data.page, data.pages).map((p, i) =>
              p === "…" ? <span key={`e${i}`} className="muted px-1" aria-hidden>…</span> : (
                <button key={p} onClick={() => goPage(p)} aria-label={`Page ${p}`} aria-current={p === data.page ? "page" : undefined} className={`chip ${p === data.page ? "chip-gold !border-[var(--gold)]" : ""}`}>{p}</button>
              ),
            )}
            <button className="chip" onClick={() => goPage(data.page + 1)} disabled={data.page >= data.pages} aria-label="Next page">Next →</button>
          </nav>
        )}
      </section>

      <RecoModal reco={open} onClose={() => setOpen(null)} />

      {showTop && (
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Scroll to top" className="btn btn-primary fixed bottom-5 left-5 z-40 !h-11 !w-11 justify-center !p-0">↑</button>
      )}
    </>
  );
}
