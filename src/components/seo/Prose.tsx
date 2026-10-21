import type { ReactNode } from "react";

/** Server-rendered explanatory copy block used under the dashboards. Plain HTML so crawlers read it without JS. */
export function Prose({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  return (
    <section className="container-x pb-10 pt-2" aria-label={label}>
      <div className="card text-[14px] leading-7 text-[var(--ink-2)] [&_h3]:mt-6 [&_h3]:text-[16px] [&_h3]:font-semibold [&_h3]:text-[var(--ink)] [&_p]:mt-3 [&_dt]:mt-3 [&_dt]:font-semibold [&_dt]:text-[var(--ink)] [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_a]:font-semibold [&_a]:text-[var(--accent)]">
        <h2 className="display text-2xl text-[var(--ink)]">{title}</h2>
        {children}
      </div>
    </section>
  );
}

/** "Today's snapshot": only rendered when the page data loaded; values come straight from that data. */
export function Snapshot({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <>
      <h3>{heading}</h3>
      {children}
    </>
  );
}
