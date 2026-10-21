"use client";

import { useEffect, useMemo, useState } from "react";
import { getData } from "@/lib/api";
import { safeHref } from "@/lib/safe-url";
import { CollapsibleSection, FilterChips } from "./CollapsibleSection";

type Blog = { _id?: string; title: string; link: string; category?: string; date?: string; advisorName?: string };

export function AdvisorBlogs() {
  const [blogs, setBlogs] = useState<Blog[] | null>(null);
  const [active, setActive] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    getData<{ success: boolean; data?: Blog[] }>("blogs", { limit: "50" })
      .then((j) => alive && setBlogs(j.success && j.data ? j.data : []))
      .catch(() => alive && setBlogs([]));
    return () => {
      alive = false;
    };
  }, []);

  const cats = useMemo(() => [...new Set((blogs ?? []).map((b) => b.category).filter(Boolean) as string[])].sort(), [blogs]);
  const shown = useMemo(() => (active.size ? (blogs ?? []).filter((b) => active.has(b.category ?? "")) : blogs ?? []), [blogs, active]);

  if (blogs && blogs.length === 0) return null;

  return (
    <CollapsibleSection title="Advisor blog posts" count={blogs ? `${blogs.length} post${blogs.length !== 1 ? "s" : ""}` : undefined}>
      {cats.length > 1 && (
        <div className="mb-6">
          <FilterChips
            options={cats}
            active={active}
            onToggle={(c) => setActive((s) => { const n = new Set(s); if (!n.delete(c)) n.add(c); return n; })}
            onClear={() => setActive(new Set())}
          />
        </div>
      )}
      {!blogs ? (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3" aria-hidden>{[0, 1, 2].map((i) => <div key={i} className="skeleton h-[140px]" />)}</div>
      ) : (
        <div role="feed" aria-label="Advisor blog posts" className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {shown.map((b, i) => {
            const href = safeHref(b.link);
            return (
              <article key={b._id ?? `${b.link}-${i}`} className="card rise flex flex-col !p-5 transition hover:-translate-y-0.5 hover:border-[var(--gold)]">
                <div className="flex items-center justify-between gap-3">
                  <span className="chip chip-gold">{b.category || "Finance"}</span>
                  <span className="muted text-xs">{b.date ? new Date(b.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : ""}</span>
                </div>
                <h3 className="mt-3 text-[16px] font-semibold leading-snug">
                  {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--gold)]">{b.title}</a> : b.title}
                </h3>
                <div className="mt-auto flex items-center justify-between pt-4 text-xs">
                  <span className="muted">{b.advisorName || "Advisor"}</span>
                  {href && <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--gold)]">Read →</a>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </CollapsibleSection>
  );
}
