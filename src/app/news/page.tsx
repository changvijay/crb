import { RelatedLinks } from "@/components/seo/RelatedLinks";
import Link from "next/link";
import { Suspense } from "react";
import { AdvisorBlogs } from "@/components/news/AdvisorBlogs";
import { LiveTicker } from "@/components/news/LiveTicker";
import { NewsFeed } from "@/components/news/NewsFeed";
import { getLatestNews } from "@/lib/news";
import { SITE, ldJson, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("/news");

async function NewsData() {
  const news = await getLatestNews();
  const articles = news?.articles ?? [];

  const itemList = articles.length
    ? {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "Latest Stock Market News",
        numberOfItems: articles.length,
        itemListElement: articles.slice(0, 20).map((a, i) => ({
          "@type": "ListItem",
          position: i + 1,
          item: {
            "@type": "NewsArticle",
            headline: a.title || "",
            url: a.url || "",
            datePublished: a.publishedAt || "",
            description: (a.description || "").substring(0, 200),
            publisher: { "@type": "Organization", name: a.source || "Unknown" },
            articleSection: a.category || "General Market",
          },
        })),
      }
    : null;
  const page = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Stock Market News Today",
    url: `${SITE}/news`,
    isPartOf: { "@type": "WebSite", name: "Chang Research Base", url: SITE },
  };

  return (
    <>
      {[page, itemList].filter(Boolean).map((d, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(d) }} />
      ))}
      <NewsFeed initial={news} />
    </>
  );
}

export default function NewsPage() {
  return (
    <>
      <header className="container-x pb-4 pt-8 md:pt-10" aria-label="Stock market news overview">
        <p className="eyebrow">Newsroom</p>
        <h1 className="display mt-3 max-w-4xl text-[clamp(30px,4.4vw,54px)]">Stock market news today — live financial &amp; global market updates</h1>
        <p className="mt-4 max-w-3xl text-[15px] leading-7 text-[var(--ink-2)]">
          Real-time stock market news aggregated from verified sources on <strong>Chang Research Base (CRB)</strong>. Stay updated with live
          financial headlines, Indian equities, FII &amp; DII institutional flows, RBI monetary policy decisions, corporate quarterly earnings
          reports, and macro events.
        </p>
      </header>

      <LiveTicker />
      <Suspense fallback={<div className="container-x section"><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-hidden>{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-[200px]" />)}</div></div>}>
        <NewsData />
      </Suspense>
      <AdvisorBlogs />
      <RelatedLinks path="/news" />

      <aside className="container-x section" aria-label="About stock market news on CRB">
        <div className="card max-w-4xl">
          <h2 className="display text-2xl">About stock market news &amp; financial intelligence on CRB</h2>
          <p className="mt-3 text-sm leading-7 text-[var(--ink-2)]">
            <strong>Chang Research Base (CRB)</strong> provides automated news aggregation for equity researchers, day traders, and long-term
            investors. Our real-time news engine continuously indexes financial headlines, categorises them, and surfaces the stories that move markets.
          </p>
          <h3 className="mt-5 text-sm font-semibold">Key market news categories</h3>
          <ul className="mt-2 space-y-2 text-sm leading-7 text-[var(--ink-2)]">
            <li><strong>Indian market news (<Link href="/nse-data" className="text-[var(--gold)]">/nse-data</Link>)</strong>: Nifty 50 earnings reports, NSE sectoral updates, FII/DII activity, and RBI policy rate announcements.</li>
            <li><strong>US &amp; global markets (<Link href="/us-market" className="text-[var(--gold)]">/us-market</Link>)</strong>: S&amp;P 500, Federal Reserve rate expectations, Wall Street tech earnings, and global commodities.</li>
            <li><strong>Cryptocurrency trends (<Link href="/crypto" className="text-[var(--gold)]">/crypto</Link>)</strong>: Bitcoin (BTC), Ethereum (ETH), altcoin market capitalization, and regulatory developments.</li>
          </ul>
        </div>
      </aside>
    </>
  );
}
