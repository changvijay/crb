import Link from "next/link";
import { SOCIAL } from "@/components/site/links";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("/contact");

export default function ContactPage() {
  return (
    <article className="container-x max-w-3xl pb-12 pt-10 text-[15px] leading-8 text-[var(--ink-2)]">
      <nav aria-label="Breadcrumb" className="muted mb-4 text-xs"><Link href="/">Home</Link> / <span>Contact</span></nav>
      <p className="eyebrow">Get in touch</p>
      <h1 className="display mt-3 text-[clamp(30px,4.4vw,52px)]">Contact Chang Research Base</h1>
      <p className="mt-4">Questions about a report, a correction to the data, or feedback on the site are welcome. The fastest way to reach us is through our official channels below. We read messages there and use them to fix mistakes and decide what to build next.</p>

      <h2 className="mt-8 text-xl font-semibold text-[var(--ink)]">Official channels</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {SOCIAL.map(([name, href]) => (
          <li key={name}><a href={href} target="_blank" rel="noopener noreferrer" className="card card-hover block !p-4 font-semibold text-[var(--ink)]">{name}<span className="muted mt-1 block text-xs font-normal">Open our {name} page</span></a></li>
        ))}
      </ul>

      <h2 className="mt-8 text-xl font-semibold text-[var(--ink)]">Before you write</h2>
      <p className="mt-3">We publish education and market information, not personal investment advice, and we cannot recommend what you should buy or sell. For advice that fits your situation, speak with a SEBI-registered investment adviser. Please never share passwords, OTPs, bank details or broker credentials with anyone, including us.</p>
      <p className="mt-3">Read how our reports are built on the <Link href="/about" className="font-semibold text-[var(--accent)]">about page</Link> and our <Link href="/disclaimer" className="font-semibold text-[var(--accent)]">disclaimer</Link>.</p>
    </article>
  );
}
