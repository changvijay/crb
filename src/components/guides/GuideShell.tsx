import Link from "next/link";
import type { ReactNode } from "react";
import { loadGuide, guideJsonLd } from "@/lib/guides";
import { RelatedLinks } from "@/components/seo/RelatedLinks";
import { Toc } from "./Toc";

/**
 * Shared chrome for long-form guides: hero, scroll-spy TOC, reading progress, and the guide's own
 * (scoped, re-themed) content. The article text itself is the original, rendered as-is.
 */
export async function GuideShell({ slug, eyebrow, title, lede, meta, headingTag, current, children, enhance, intro, tocFilter }: {
  slug: string; eyebrow: string; title: ReactNode; lede?: string; meta?: string[]; headingTag?: string; current: string; children?: ReactNode; tocFilter?: boolean; /** Rendered inside the guide wrapper, before the article (toolbars, cover). */ intro?: ReactNode; /** Client enhancers (interactive widgets) mounted alongside the static article. */ enhance?: ReactNode;
}) {
  const { html, toc } = await loadGuide(slug, headingTag);
  const ld = guideJsonLd(slug);
  return (
    <>
      {ld.map((d, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(d).replace(/</g, "\\u003c") }} />)}
      <header className="container-x pb-6 pt-8 md:pt-12">
        <nav aria-label="Breadcrumb" className="muted mb-4 text-xs"><Link href="/" className="hover:text-[var(--accent)]">Home</Link> / <Link href="/learning" className="hover:text-[var(--accent)]">Learning</Link> / <span>{eyebrow}</span></nav>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display mt-3 max-w-4xl text-[clamp(30px,4.6vw,58px)]">{title}</h1>
        {lede && <p className="mt-5 max-w-3xl text-[16.5px] leading-8 text-[var(--ink-2)]">{lede}</p>}
        {meta && <div className="mt-5 flex flex-wrap gap-2">{meta.map((m) => <span key={m} className="chip">{m}</span>)}</div>}
      </header>

      <div className="container-x grid gap-10 pb-6 lg:grid-cols-[230px_minmax(0,1fr)]">
        <aside>{toc.length > 0 && <Toc items={toc} filter={tocFilter} />}</aside>
        <div className="min-w-0">
          {children}
          <div className="card !p-[clamp(18px,3vw,40px)]">
            <div className={`g-${slug}`}>
              {intro}
              <article dangerouslySetInnerHTML={{ __html: html }} />
              {enhance}
            </div>
          </div>
        </div>
      </div>
      <RelatedLinks path={current} />
    </>
  );
}
