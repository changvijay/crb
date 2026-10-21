import type { MetadataRoute } from "next";

export type SitePage = {
  path: string;
  label: string;
  blurb: string;
  group: "Markets" | "Learn" | "Research" | "About";
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
  priority: number;
  /** Date the page was last materially changed (ISO, real dates only). Update when the page content changes. */
  lastModified: string;
};

/** Single source of truth for the footer, the home page hub, related links and the sitemap. */
export const PAGES: SitePage[] = [
  { path: "/", label: "Daily market report", blurb: "Pre-market Nifty 50, Bank Nifty and Sensex levels, FII/DII flows and global cues.", group: "Markets", changeFrequency: "daily", priority: 1, lastModified: "2026-10-21" },
  { path: "/nse-data", label: "NSE market data", blurb: "Heatmap, gainers and losers, 52-week highs and lows, price bands and IPO GMP.", group: "Markets", changeFrequency: "daily", priority: 0.95, lastModified: "2026-10-21" },
  { path: "/us-market", label: "US market dashboard", blurb: "S&P 500 heatmap, major indices, movers and most active US stocks.", group: "Markets", changeFrequency: "daily", priority: 0.88, lastModified: "2026-10-21" },
  { path: "/crypto", label: "Crypto dashboard", blurb: "Top 100 coins, heatmap, trending tokens, gainers and losers.", group: "Markets", changeFrequency: "daily", priority: 0.85, lastModified: "2026-10-21" },
  { path: "/news", label: "Market news", blurb: "Financial headlines from several sources, grouped by category.", group: "Markets", changeFrequency: "daily", priority: 0.9, lastModified: "2026-10-21" },
  { path: "/recommendations", label: "Trade ideas", blurb: "Buy and sell setups with entry, stop-loss and target levels.", group: "Markets", changeFrequency: "daily", priority: 0.85, lastModified: "2026-10-21" },
  { path: "/learning", label: "Learning hub", blurb: "Structured free modules from market basics to technical and fundamental analysis.", group: "Learn", changeFrequency: "weekly", priority: 0.78, lastModified: "2026-10-21" },
  { path: "/stock-market-basics", label: "Stock market basics", blurb: "How markets work, where to invest and how trading differs from investing.", group: "Learn", changeFrequency: "monthly", priority: 0.7, lastModified: "2026-10-21" },
  { path: "/price-action", label: "Price action guide", blurb: "Read candles, levels, trends and risk without indicators.", group: "Learn", changeFrequency: "monthly", priority: 0.75, lastModified: "2026-10-21" },
  { path: "/technical-analysis-guide", label: "Technical analysis guide", blurb: "Trends, support and resistance, moving averages, RSI, MACD and Bollinger Bands.", group: "Learn", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-10-21" },
  { path: "/candlestick-patterns", label: "Candlestick patterns", blurb: "19 candlestick patterns with psychology, rules and common mistakes.", group: "Learn", changeFrequency: "monthly", priority: 0.7, lastModified: "2026-10-21" },
  { path: "/understanding-crypto-complete-guide", label: "Crypto guide", blurb: "A 35-chapter plain-language guide to blockchains, wallets, DeFi and risk.", group: "Learn", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-10-21" },
  { path: "/fundamental-indicators", label: "Fundamental indicators", blurb: "23 stock analysis indicators explained simply.", group: "Research", changeFrequency: "weekly", priority: 0.8, lastModified: "2026-10-21" },
  { path: "/fundamental-analysis-ratios", label: "Financial ratios", blurb: "Searchable reference to 54 ratios with formulas and interpretation.", group: "Research", changeFrequency: "weekly", priority: 0.8, lastModified: "2026-10-21" },
  { path: "/fundamental-stock-analysis", label: "Stock screener", blurb: "Compare valuation, profitability and debt for up to six NSE stocks.", group: "Research", changeFrequency: "daily", priority: 0.95, lastModified: "2026-10-21" },
  { path: "/nifty-equity-indices", label: "Nifty indices explorer", blurb: "44 NSE indices with constituents and selection criteria.", group: "Research", changeFrequency: "monthly", priority: 0.7, lastModified: "2026-10-21" },
  { path: "/about", label: "About CRB", blurb: "How the daily report is built, and who publishes it.", group: "About", changeFrequency: "monthly", priority: 0.6, lastModified: "2026-10-21" },
  { path: "/contact", label: "Contact", blurb: "Official channels for questions, corrections and feedback.", group: "About", changeFrequency: "yearly", priority: 0.4, lastModified: "2026-10-21" },
  { path: "/disclaimer", label: "Disclaimer", blurb: "Information and education only; not investment advice.", group: "About", changeFrequency: "yearly", priority: 0.4, lastModified: "2026-10-21" },
];

export const GROUPS = ["Markets", "Learn", "Research", "About"] as const;
export const pagesIn = (g: SitePage["group"]) => PAGES.filter((p) => p.group === g);
