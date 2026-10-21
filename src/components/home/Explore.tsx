import Link from "next/link";
import { GROUPS, pagesIn } from "@/lib/pages";
import { IconArrow, IconCoin, IconGlobe, IconIndia, IconNews } from "@/components/ui/icons";

const TILES = [
  { href: "/news", Icon: IconNews, tag: "Financial news", title: "Stock Market News & Headlines", body: "Real-time news aggregated from verified sources covering Indian equities, US markets, central-bank policy, FII/DII flows, earnings and macro developments.", cta: "Read market news", glow: "from-sky-500/20" },
  { href: "/nse-data", Icon: IconIndia, tag: "Indian equity", title: "NSE Data & Indian Market Analytics", body: "Live analytics for Nifty 50, Bank Nifty, Sensex and sector indices: option-chain open interest, support & resistance, price action and fundamentals.", cta: "Open NSE market data", glow: "from-teal-400/20" },
  { href: "/us-market", Icon: IconGlobe, tag: "Global markets", title: "US Markets & Global Equities", body: "Wall Street intelligence covering S&P 500, Nasdaq 100, Dow Jones, US 10-year yields, crude oil, gold and foreign exchange.", cta: "Open the US market dashboard", glow: "from-violet-500/20" },
  { href: "/crypto", Icon: IconCoin, tag: "Digital assets", title: "Cryptocurrency Markets & Trends", body: "Crypto intelligence for Bitcoin, Ethereum, Solana and top altcoins with market cap, 24-hour volume and sentiment indicators.", cta: "Open the crypto dashboard", glow: "from-amber-400/20" },
];

export function Explore() {
  return (
    <section className="container-x pb-4 pt-2" aria-label="Market intelligence and research coverage">
      <p className="eyebrow">Coverage</p>
      <h2 className="section-title mt-1">Market research &amp; intelligence</h2>
      <p className="muted mt-2 max-w-2xl text-sm">Research-backed insights, real-time news, Indian equity analytics, global indices and crypto tracking across Chang Research Base.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {TILES.map(({ href, Icon, tag, title, body, cta, glow }) => (
          <Link key={href} href={href} className="card card-hover group relative flex flex-col gap-5 overflow-hidden">
            <div aria-hidden className={`pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-gradient-to-br ${glow} to-transparent blur-2xl`} />
            <div className="relative flex items-center justify-between">
              <span className="chip chip-gold">{tag}</span>
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--line)] text-[var(--accent)]"><Icon /></span>
            </div>
            <div className="relative">
              <h3 className="display text-[22px]">{title}</h3>
              <p className="mt-2 text-[13.5px] leading-7 text-[var(--ink-2)]">{body}</p>
            </div>
            <span className="relative mt-auto flex items-center gap-2 text-sm font-semibold text-[var(--accent)]">{cta} <IconArrow width={16} height={16} className="transition group-hover:translate-x-1" /></span>
          </Link>
        ))}
      </div>

      <div className="mt-12">
        <p className="eyebrow">Site map</p>
        <h2 className="section-title mt-1">Every Chang Research Base page</h2>
        <p className="muted mt-2 max-w-2xl text-sm">Market dashboards, free learning guides and research tools, each one click from here.</p>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {GROUPS.map((g) => (
            <nav key={g} aria-label={g === "About" ? "About Chang Research Base" : `${g} pages`}>
              <h3 className="eyebrow mb-3">{g === "About" ? "About CRB" : g}</h3>
              <ul className="space-y-3">
                {pagesIn(g).filter((p) => p.path !== "/").map((p) => (
                  <li key={p.path}>
                    <Link href={p.path} className="font-semibold text-[var(--ink)] transition-colors hover:text-[var(--accent)]">{p.label}</Link>
                    <p className="muted mt-0.5 text-[12.5px] leading-5">{p.blurb}</p>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>

      <div className="mt-10 max-w-3xl text-[13.5px] leading-7 text-[var(--ink-2)]">
        <h2 className="display text-xl text-[var(--ink)]">About Chang Research Base (CRB)</h2>
        <p className="mt-3">
          Chang Research Base is a research-based market information site. Each trading morning it publishes a pre-market report for the <strong>Nifty 50</strong>,{" "}
          <strong>Bank Nifty</strong> and <strong>Sensex</strong> that combines technical indicators, option-chain data, institutional flows and global cues, alongside live
          dashboards and free learning guides. Read <Link href="/about" className="font-semibold text-[var(--accent)]">how the reports are built</Link>, the{" "}
          <Link href="/disclaimer" className="font-semibold text-[var(--accent)]">disclaimer</Link> or <Link href="/contact" className="font-semibold text-[var(--accent)]">contact us</Link>.
        </p>
      </div>
    </section>
  );
}
