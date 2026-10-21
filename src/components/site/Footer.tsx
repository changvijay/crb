import Image from "next/image";
import Link from "next/link";
import { GROUPS, pagesIn } from "@/lib/pages";
import { SOCIAL } from "./links";
import { ToTop } from "./ToTop";
import { Year } from "./Year";

const COLUMNS = GROUPS.map((g) => ({ title: g === "About" ? "About CRB" : g, links: pagesIn(g) }));

export function Footer() {
  return (
    <footer className="container-x pb-28 pt-12 lg:pb-10">
      <div className="card relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-[var(--accent)] opacity-[0.08] blur-3xl" />
        <div className="relative grid gap-6 md:grid-cols-[0.3fr_1fr] md:items-center">
          <div>
            <p className="eyebrow">Stay connected</p>
            <h2 className="display mt-2 text-3xl">Follow our <span className="grad-text">research.</span></h2>
            <p className="muted mt-2 max-w-md text-sm">Research-based market intelligence for Indian and global markets, delivered before the opening bell.</p>
          </div>
          <ul className="flex flex-wrap gap-2 md:justify-end" aria-label="Social media links">
            {SOCIAL.map(([name, href]) => (
              <li key={name}><a href={href} target="_blank" rel="noopener noreferrer" className="chip hover:!-translate-y-0.5 hover:!border-[var(--accent)] hover:!text-[var(--accent)]">{name}</a></li>
            ))}
          </ul>
        </div>

        <div className="relative mt-8 grid gap-8 border-t border-[var(--line)] pt-8 sm:grid-cols-2 lg:grid-cols-[1.3fr_repeat(4,1fr)]">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2.5" aria-label="Chang Research Base home">
              <Image src="/logo.png" alt="" width={36} height={36} className="h-9 w-9 rounded-xl object-cover" />
              <span className="display text-lg">Chang Research Base</span>
            </Link>
            <p className="muted mt-3 max-w-xs text-[13px] leading-6">AI-assisted pre-market reports, live indices, institutional flows, and learning guides — in one place.</p>
            <Link href="/about" className="btn btn-ghost mt-4 !py-2 !text-[12.5px]">About us →</Link>
            <p className="mt-3 flex items-center gap-2 text-[12px] text-[var(--ink-2)]"><span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--up)]" />Reports refreshed every trading morning</p>
          </div>
          {COLUMNS.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <p className="eyebrow mb-3">{c.title}</p>
              <ul className="space-y-2 text-[13px]">
                {c.links.map((l) => (
                  <li key={l.path}><Link href={l.path} className="text-[var(--ink-2)] transition-colors hover:text-[var(--accent)]">{l.label}</Link></li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--ink-3)]">
        <p className="max-w-3xl leading-5">© <Year /> Chang Research Base (CRB). For information and education only — not investment advice. Markets involve risk; consult a SEBI-registered advisor before investing. See the <Link href="/disclaimer" className="underline hover:text-[var(--accent)]">disclaimer</Link>.</p>
        <div className="flex items-center gap-4">
          <Link href="/disclaimer" className="hover:text-[var(--accent)]">Disclaimer</Link>
          <Link href="/contact" className="hover:text-[var(--accent)]">Contact</Link>
          <Link href="/about" className="hover:text-[var(--accent)]">About us</Link>
          <ToTop />
        </div>
      </div>
    </footer>
  );
}
