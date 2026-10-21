import Link from "next/link";
import { RelatedLinks } from "@/components/seo/RelatedLinks";
import { RatioSearch, type SearchItem } from "@/components/ratios/RatioSearch";
import { Toc } from "@/components/guides/Toc";
import data from "@/content/ratios.json";
import { guideJsonLd, guideMetadata } from "@/lib/guides";

export const metadata = guideMetadata("fundamental-analysis-ratios");

type Interp = { level: string; meaning: string };
type Ratio = {
  id: number; name: string; section: string; sectionId: string; part: string;
  meta: { definition: string; formula: string; purpose: string };
  easyExplanation: string; example: string; interpretation: Interp[]; peerComparison: string; ignoreFor: string; moreImportantFor: string; crossCheckWith: string; commonMistakes: string[]; keyTakeaways: string[];
};
const { sections, ratios, cheatSheet, decisionTree, sectors, roadmap } = data as unknown as {
  sections: { id: string; letter: string; title: string; part: string }[]; ratios: Ratio[];
  cheatSheet: { ratio: string; formula: string; bestUsedFor: string; avoidFor: string }[]; decisionTree: string;
  sectors: { sector: string; mostImportant: string; leastUseful: string }[]; roadmap: { stage: string; weeks: string; items: string[] }[];
};

const TOC = [
  { id: "hero", label: "Introduction" }, { id: "cheat-sheet", label: "Quick-Reference Cheat Sheet" },
  ...sections.map((s) => ({ id: s.id, label: `${s.letter}. ${s.title}` })),
  { id: "decision-tree", label: "Decision Tree" }, { id: "sector-matrix", label: "Sector Priority Matrix" }, { id: "roadmap", label: "Learning Roadmap" },
];
const SEARCH: SearchItem[] = ratios.map((r) => ({
  id: r.id, name: r.name, section: r.section, sectionId: r.sectionId,
  hay: [r.name, r.section, r.meta.definition, r.meta.formula, r.meta.purpose, r.easyExplanation, ...r.keyTakeaways].join(" \n ").toLowerCase(),
}));

const L = ({ t, c }: { t: string; c?: string }) => <p className="eyebrow mb-1.5 !text-[10.5px]" style={c ? { color: c } : undefined}>{t}</p>;

function RatioCard({ r }: { r: Ratio }) {
  return (
    <article id={`ratio-${r.id}`} className="card rise mb-5 scroll-mt-24 data-[highlight=true]:!border-[var(--accent)] data-[highlight=true]:shadow-[var(--glow)]">
      <div className="mb-5 flex items-start gap-3">
        <span className="num grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-sm font-semibold text-[var(--accent)]">{r.id}</span>
        <div><h3 className="display text-[22px] leading-tight">{r.name}</h3><span className="muted text-xs">{r.section}</span></div>
      </div>
      <div className="grid gap-5">
        <div><L t="Definition" /><p className="leading-7 text-[var(--ink-2)]">{r.meta.definition}</p></div>
        <div><L t="Formula" /><code className="num block rounded-xl bg-[var(--surface-2)] px-4 py-3 text-[13.5px] leading-6">{r.meta.formula}</code></div>
        <div><L t="Purpose" /><p className="leading-7 text-[var(--ink-2)]">{r.meta.purpose}</p></div>
        <div className="rounded-2xl bg-[var(--accent-soft)] p-4"><L t="In Simple Terms" /><p className="leading-7">{r.easyExplanation}</p></div>
        <div><L t="Example" /><p className="leading-7 text-[var(--ink-2)]">{r.example}</p></div>
        <div>
          <L t="Interpretation" />
          <div className="overflow-hidden rounded-2xl border border-[var(--line)]">
            {r.interpretation.map((i, n) => (
              <div key={n} className="grid gap-1 border-b border-[var(--line)]/70 px-4 py-3 last:border-0 sm:grid-cols-[170px_1fr] sm:gap-4">
                <span className="text-sm font-semibold">{i.level}</span><span className="text-sm leading-6 text-[var(--ink-2)]">{i.meaning}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-[var(--surface-2)] p-4"><L t="Peer Comparison" /><p className="text-sm leading-6 text-[var(--ink-2)]">{r.peerComparison}</p></div>
          <div className="rounded-2xl bg-[var(--surface-2)] p-4"><L t="Cross-Check With" /><p className="text-sm leading-6 text-[var(--ink-2)]">{r.crossCheckWith}</p></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex gap-3 rounded-2xl p-4" style={{ background: "color-mix(in srgb, var(--warn) 12%, transparent)" }}><span aria-hidden>⚠️</span><div><L t="Ignore For" c="var(--warn)" /><p className="text-sm leading-6 text-[var(--ink-2)]">{r.ignoreFor}</p></div></div>
          <div className="flex gap-3 rounded-2xl bg-[var(--up-soft)] p-4"><span aria-hidden>✅</span><div><L t="More Important For" c="var(--up)" /><p className="text-sm leading-6 text-[var(--ink-2)]">{r.moreImportantFor}</p></div></div>
        </div>
        <div className="rounded-2xl bg-[var(--down-soft)] p-4"><L t="Common Mistakes" c="var(--down)" /><ul className="mt-2 space-y-2">{r.commonMistakes.map((m, i) => <li key={i} className="flex gap-2 text-sm leading-6 text-[var(--ink-2)]"><span className="down shrink-0">•</span>{m}</li>)}</ul></div>
        <div className="rounded-2xl bg-[var(--accent-soft)] p-4"><L t="Key Takeaways" c="var(--accent)" /><ul className="mt-2 space-y-2">{r.keyTakeaways.map((m, i) => <li key={i} className="flex gap-2 text-sm leading-6"><span className="shrink-0 text-[var(--accent)]">✓</span>{m}</li>)}</ul></div>
      </div>
    </article>
  );
}

export default function Page() {
  return (
    <>
      {guideJsonLd("fundamental-analysis-ratios").map((d, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(d).replace(/</g, "\\u003c") }} />)}
      <section id="hero" className="container-x scroll-mt-24 pb-6 pt-10 md:pt-14">
        <nav aria-label="Breadcrumb" className="muted mb-4 text-xs"><Link href="/" className="hover:text-[var(--accent)]">Home</Link> / <Link href="/learning" className="hover:text-[var(--accent)]">Learning</Link> / <span>Fundamental analysis</span></nav>
        <span className="chip chip-gold">The Complete Reference</span>
        <h1 className="display mt-4 max-w-4xl text-[clamp(34px,5.4vw,70px)]">Fundamental Analysis <span className="grad-text">Mastery Guide</span></h1>
        <p className="mt-5 max-w-3xl text-[17px] leading-8 text-[var(--ink-2)]">A comprehensive, practical reference covering <strong className="text-[var(--ink)]">54 financial ratios</strong> across valuation, profitability, liquidity, leverage, efficiency, cash flow, growth, shareholder returns, risk, and economic moat indicators.</p>
        <div className="mt-7 flex flex-wrap items-center gap-3"><a href="#section-a" className="btn btn-primary">Start Reading</a><a href="#cheat-sheet" className="btn btn-ghost">View Cheat Sheet</a><RatioSearch items={SEARCH} /></div>
        <div className="mt-8 grid max-w-xl grid-cols-3 gap-3">{([["54", "Ratios Covered"], ["10", "Sections"], ["14", "Sectors Mapped"]] as const).map(([v, l]) => <div key={l} className="stat text-center"><div className="num text-2xl font-medium text-[var(--accent)]">{v}</div><div className="muted text-xs">{l}</div></div>)}</div>
      </section>

      <div className="container-x grid gap-10 pb-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside><Toc items={TOC} label="Contents" /></aside>
        <div className="min-w-0 max-w-3xl space-y-16">
          <section id="cheat-sheet" className="scroll-mt-24">
            <p className="eyebrow">Quick Reference</p><h2 className="section-title mt-1">The 54-Ratio Cheat Sheet</h2>
            <p className="mt-3 max-w-2xl leading-7 text-[var(--ink-2)]">Every ratio on one page — its formula, what it&apos;s best used for, and where it misleads. Use this as a rapid lookup while reading the detailed sections below.</p>
            <div className="card mt-6 overflow-x-auto !p-0">
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="border-b border-[var(--line)] bg-[var(--surface-2)] text-left text-[10.5px] uppercase tracking-wider text-[var(--ink-3)]"><th className="px-4 py-3">Ratio</th><th>Formula</th><th>Best Used For</th><th>Avoid For</th></tr></thead>
                <tbody>{cheatSheet.map((c) => <tr key={c.ratio} className="border-b border-[var(--line)]/60 align-top"><td className="px-4 py-3 font-semibold">{c.ratio}</td><td className="num py-3 pr-3 text-[12.5px] text-[var(--ink-2)]">{c.formula}</td><td className="py-3 pr-3 text-[var(--ink-2)]">{c.bestUsedFor}</td><td className="py-3 pr-4 text-[var(--ink-2)]">{c.avoidFor}</td></tr>)}</tbody>
              </table>
            </div>
          </section>

          {sections.map((s) => {
            const list = ratios.filter((r) => r.sectionId === s.id);
            return (
              <section key={s.id} id={s.id} className="scroll-mt-24">
                <div className="mb-6">
                  <div className="mb-2 flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--accent)] text-sm font-bold text-[#03120f]">{s.letter}</span><span className="eyebrow">{s.part} • {list.length} {list.length === 1 ? "Ratio" : "Ratios"}</span></div>
                  <h2 className="section-title">{s.title}</h2>
                </div>
                {list.map((r) => <RatioCard key={r.id} r={r} />)}
              </section>
            );
          })}

          <section id="decision-tree" className="scroll-mt-24">
            <p className="eyebrow">Analytical Framework</p><h2 className="section-title mt-1">The Analysis Decision Tree</h2>
            <p className="mt-3 max-w-2xl leading-7 text-[var(--ink-2)]">A step-by-step framework for analyzing any non-financial company from scratch. Follow the branches in order — each step gates the next.</p>
            <div className="card mt-6 overflow-x-auto"><pre className="num whitespace-pre text-xs leading-6 text-[var(--ink-2)] sm:text-sm">{decisionTree}</pre></div>
          </section>

          <section id="sector-matrix" className="scroll-mt-24">
            <p className="eyebrow">Industry Guide</p><h2 className="section-title mt-1">Sector Priority Matrix</h2>
            <p className="mt-3 max-w-2xl leading-7 text-[var(--ink-2)]">Which ratios matter most — and which to skip — by sector. No single ratio set fits every industry; use this to focus your analysis where it counts.</p>
            <div className="mt-6 grid gap-4 md:grid-cols-2">{sectors.map((s) => (
              <div key={s.sector} className="card !p-5"><h3 className="font-semibold">{s.sector}</h3><div className="mt-3 space-y-3"><div><L t="Most Important" c="var(--up)" /><p className="text-sm leading-6 text-[var(--ink-2)]">{s.mostImportant}</p></div><div><L t="Least Useful" c="var(--down)" /><p className="text-sm leading-6 text-[var(--ink-2)]">{s.leastUseful}</p></div></div></div>
            ))}</div>
          </section>

          <section id="roadmap" className="scroll-mt-24">
            <p className="eyebrow">Learning Path</p><h2 className="section-title mt-1">14-Week Learning Roadmap</h2>
            <p className="mt-3 max-w-2xl leading-7 text-[var(--ink-2)]">A structured path from beginner to advanced, designed to build genuine fluency rather than rote memorization. Each stage builds on the last.</p>
            <ol className="relative mt-8 space-y-6 sm:before:absolute sm:before:bottom-2 sm:before:left-[19px] sm:before:top-2 sm:before:w-px sm:before:bg-[var(--line)]">
              {roadmap.map((r, i) => (
                <li key={r.stage} className="relative flex gap-4">
                  <span className="num relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-sm font-bold text-[#03120f]">{i + 1}</span>
                  <div className="card !p-5 flex-1"><div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-semibold">{r.stage}</h3><span className="chip">{r.weeks}</span></div><ul className="mt-3 space-y-1.5">{r.items.map((it) => <li key={it} className="flex gap-2 text-sm leading-6 text-[var(--ink-2)]"><span className="text-[var(--accent)]">▸</span>{it}</li>)}</ul></div>
                </li>
              ))}
            </ol>
          </section>

          <footer className="card text-center">
            <p className="display text-xl">Fundamental Analysis Mastery Guide</p>
            <p className="muted mx-auto mt-2 max-w-xl text-sm leading-6">A complete, practical reference for 54 financial ratios across 10 categories. Designed for clarity, readability, and genuine understanding — not rote memorization.</p>
            <p className="muted mt-4 text-xs">An interactive educational reading experience</p>
          </footer>
        </div>
      </div>
      <RelatedLinks path="/fundamental-analysis-ratios" />
    </>
  );
}
