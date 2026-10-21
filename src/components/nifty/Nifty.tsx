"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CSV_FILES, DATASET, type Category } from "./data";

type Row = Record<string, string>;
const TABS: [Category, string][] = [["broad", "Broad market"], ["sectoral", "Sectoral"], ["thematic", "Thematic"]];

/** Same tolerant CSV parser as the original (quoted fields, commas inside quotes). */
function parseCSV(text: string): Row[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const split = (line: string) => {
    const out: string[] = [];
    let cur = "", q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === "," && !q) { out.push(cur.trim().replace(/"/g, "")); cur = ""; }
      else cur += ch;
    }
    out.push(cur.trim().replace(/"/g, ""));
    return out;
  };
  const headers = split(lines[0]);
  return lines.slice(1).filter((l) => l.trim()).map((l) => {
    const f = split(l);
    const row: Row = {};
    headers.forEach((h, i) => { if (i < f.length) row[h] = f[i]; });
    return row;
  });
}

const INDUSTRY: [string, string][] = [
  ["Financial Services", "chip-gold"], ["Banks", "chip-gold"], ["Information Technology", "chip-up"], ["Oil & Gas", "chip-warn"], ["Energy", "chip-warn"],
  ["Automobile", "chip-violet"], ["Auto Components", "chip-violet"], ["Pharmaceuticals", "chip-down"], ["Healthcare", "chip-down"], ["FMCG", "chip-up"],
  ["Consumer Goods", "chip-up"], ["Infrastructure", ""], ["Construction", ""], ["Cement", ""],
];
const industryTone = (s?: string) => (s ? INDUSTRY.find(([k]) => s.toLowerCase().includes(k.toLowerCase()))?.[1] ?? "" : "");

export function Nifty() {
  const [tab, setTab] = useState<Category>("broad");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null); // null = loading
  const [missing, setMissing] = useState(false);
  const cache = useRef<Record<string, Row[]>>({});
  const detail = useRef<HTMLDivElement>(null);

  const keys = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.keys(DATASET).filter((k) => (q ? DATASET[k].name.toLowerCase().includes(q) || DATASET[k].desc.toLowerCase().includes(q) : DATASET[k].category === tab));
  }, [tab, query]);

  const info = active ? DATASET[active] : null;

  useEffect(() => {
    if (!active) return;
    const file = CSV_FILES[active];
    if (!file) {
      const id = requestAnimationFrame(() => { setMissing(true); setRows([]); });
      return () => cancelAnimationFrame(id);
    }
    if (cache.current[file]) {
      const id = requestAnimationFrame(() => { setMissing(false); setRows(cache.current[file]); });
      return () => cancelAnimationFrame(id);
    }
    const ctl = new AbortController();
    fetch(`/Nifty_index_csv/${file.replace(/ /g, "_")}`, { signal: ctl.signal })
      .then((r) => { if (!r.ok) throw new Error(`Failed to load ${file}`); return r.text(); })
      .then((t) => { const d = parseCSV(t); cache.current[file] = d; setMissing(false); setRows(d); })
      .catch((e: Error) => { if (e.name !== "AbortError") { setMissing(true); setRows([]); } });
    return () => ctl.abort();
  }, [active]);

  const select = (k: string) => {
    setActive(k);
    setRows(null);
    setMissing(false);
    if (window.matchMedia("(max-width: 1023px)").matches) setTimeout(() => detail.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const download = () => {
    if (!active || !info || !rows) return;
    const lines = [`"Index: ${info.name}"`, `"Category","${info.category}"`, `"Constituents","${rows.length}"`, `"Weighting","${info.weighting}"`, `"Rebalancing","${info.rebalance}"`, `"Description","${info.desc}"`, ``, `"#","Company Name","Symbol","Industry"`];
    rows.forEach((s, i) => lines.push(`"${i + 1}","${s["Company Name"] || ""}","${s["Symbol"] || ""}","${s["Industry"] || ""}"`));
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `ind_${active.replace(/\s+/g, "_")}_list.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container-x pb-6">
      <header className="pb-6 pt-8 md:pt-12">
        <p className="eyebrow">NSE · Index explorer</p>
        <h1 className="display mt-3 text-[clamp(30px,4.6vw,56px)]">Nifty indices <span className="grad-text">explorer</span></h1>
        <p className="mt-4 max-w-3xl text-[15.5px] leading-7 text-[var(--ink-2)]">Browse all {Object.keys(DATASET).length} NSE indices — broad market, sectoral &amp; thematic. View methodology, constituent stocks, and export full CSV lists.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="card !p-0 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-hidden lg:flex lg:flex-col" aria-label="Index list">
          <div className="space-y-3 border-b border-[var(--line)] p-4">
            <label className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm focus-within:border-[var(--accent)]">🔍
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search indices…" aria-label="Search indices" className="w-full bg-transparent outline-none" />
            </label>
            {!query && <div className="seg w-full" role="tablist" aria-label="Index category">{TABS.map(([id, l]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className="flex-1">{l}</button>)}</div>}
            <p className="muted text-xs" aria-live="polite">{keys.length} {query ? "matching" : TABS.find(([id]) => id === tab)?.[1].toLowerCase()} indices</p>
          </div>
          <div className="overflow-auto p-2">
            {!keys.length ? <p className="muted py-8 text-center text-sm">No matching indices found.</p> : keys.map((k) => (
              <button key={k} onClick={() => select(k)} aria-pressed={active === k} className={`block w-full rounded-xl px-3.5 py-3 text-left transition ${active === k ? "bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]" : "hover:bg-[var(--surface-2)]"}`}>
                <span className="flex items-center justify-between gap-3"><span className="text-[14px] font-semibold">{DATASET[k].name}</span><span className="chip num">{DATASET[k].count}</span></span>
                <span className="muted mt-1 line-clamp-2 block text-xs leading-5">{DATASET[k].desc}</span>
              </button>
            ))}
          </div>
        </aside>

        <section ref={detail} className="card min-h-[420px] scroll-mt-24" aria-label="Index details" aria-live="polite">
          {!info ? (
            <div className="grid h-full min-h-[360px] place-items-center text-center"><div><p className="text-5xl" aria-hidden>📊</p><p className="display mt-3 text-2xl">Select an index</p><p className="muted mt-1 text-sm">Pick one on the left to see its methodology and constituents.</p></div></div>
          ) : (
            <div className="rise">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><span className={`chip ${info.category === "broad" ? "chip-gold" : info.category === "sectoral" ? "chip-up" : "chip-violet"}`}>{info.category[0].toUpperCase() + info.category.slice(1)}</span><h2 className="display mt-3 text-3xl">{info.name}</h2></div>
                <button onClick={download} disabled={!rows?.length} className="btn btn-primary disabled:opacity-40">⬇ Download CSV</button>
              </div>
              <p className="mt-3 max-w-3xl text-[14.5px] leading-7 text-[var(--ink-2)]">{info.desc}</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="stat"><label>Weighting</label><div className="v text-[14px]">{info.weighting}</div></div>
                <div className="stat"><label>Rebalancing</label><div className="v text-[14px]">{info.rebalance}</div></div>
                <div className="stat"><label>Constituents</label><div className="num v">{rows === null ? "…" : rows.length || info.count}</div></div>
              </div>

              <div className="mt-6 flex items-center justify-between"><h3 className="eyebrow">Constituents</h3>{rows && rows.length > 0 && <span className="muted text-xs">{rows.length} stocks · click a row to open on Screener.in</span>}</div>
              <div className="mt-3 max-h-[560px] overflow-auto rounded-2xl border border-[var(--line)]">
                <table className="w-full min-w-[560px] text-[13px]" aria-label="Index constituents">
                  <thead className="sticky top-0 bg-[var(--surface)]"><tr className="border-b border-[var(--line)] text-left text-[10.5px] uppercase tracking-wider text-[var(--ink-3)]"><th className="w-12 px-3 py-3">#</th><th className="px-3">Company</th><th className="px-3">Symbol</th><th className="px-3">Industry</th></tr></thead>
                  <tbody>
                    {rows === null ? (
                      <tr><td colSpan={4} className="muted py-10 text-center">Loading constituents…</td></tr>
                    ) : missing || !rows.length ? (
                      <tr><td colSpan={4} className="muted py-10 text-center">CSV data not available for this index.</td></tr>
                    ) : rows.map((s, i) => {
                      const symbol = (s["Symbol"] || "—").trim();
                      const open = () => window.open(`https://www.screener.in/company/${encodeURIComponent(symbol.replace(/\s+/g, ""))}/`, "_blank", "noopener");
                      return (
                        <tr key={`${symbol}-${i}`} onClick={open} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && open()} className="cursor-pointer border-b border-[var(--line)]/60 transition hover:bg-[var(--surface-2)]/70">
                          <td className="num muted px-3 py-2.5">{i + 1}</td>
                          <td className="px-3 py-2.5 font-medium">{s["Company Name"] || "—"}</td>
                          <td className="px-3 py-2.5"><span className="chip num">{symbol}</span></td>
                          <td className="px-3 py-2.5"><span className={`chip ${industryTone(s["Industry"])}`}>{s["Industry"] || "—"}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
