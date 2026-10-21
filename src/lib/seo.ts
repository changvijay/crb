import type { Metadata } from "next";

export const SITE = "https://crb.changtechs.com";

/**
 * One unique title (<= 60 chars) and description (<= 155 chars) per indexable page.
 * Keyed by canonical path. The brand appears once, as a short suffix.
 */
export const META: Record<string, { title: string; description: string }> = {
  "/": {
    title: "Chang Research Base (CRB): Daily Nifty Market Report",
    description: "Daily pre-market report for Nifty 50, Bank Nifty and Sensex with support and resistance levels, FII/DII flows, global cues and key risks.",
  },
  "/nse-data": {
    title: "NSE Market Data: Gainers, Losers, Heatmap & IPO GMP | CRB",
    description: "NSE dashboard with a sector heatmap, top gainers and losers, 52-week highs and lows, price band hitters, index levels and the IPO grey market premium.",
  },
  "/us-market": {
    title: "US Stock Market Dashboard: S&P 500 Heatmap & Movers | CRB",
    description: "Track Wall Street with the S&P 500 sector heatmap, Dow, Nasdaq, Russell 2000 and VIX, plus top gainers, losers and most active US stocks.",
  },
  "/crypto": {
    title: "Crypto Dashboard: Live Prices, Gainers & Trending | CRB",
    description: "Top 100 cryptocurrencies by market cap with a heatmap, trending coins, Binance gainers and losers, most active pairs and 52-week highs and lows.",
  },
  "/news": {
    title: "Stock Market News Today: India & Global Headlines | CRB",
    description: "Stock market headlines aggregated from Google News, NewsAPI and Yahoo Finance, grouped by category: Indian markets, US markets, commodities and macro.",
  },
  "/recommendations": {
    title: "Trade Ideas: Buy & Sell Setups with Stop-Loss | CRB",
    description: "Browse buy and sell trade setups with entry, stop-loss and target levels. Filter by status, trade type and term. Educational, not investment advice.",
  },
  "/learning": {
    title: "Stock Market Learning Hub: Free Guides | CRB",
    description: "Structured free learning for Indian market traders: market basics, price action, technical and fundamental analysis, candlesticks and crypto.",
  },
  "/about": {
    title: "About Chang Research Base (CRB): Method & Sources",
    description: "How Chang Research Base builds its daily pre-market report: data collected, indicators computed, how the analysis is generated and published.",
  },
  "/contact": {
    title: "Contact Chang Research Base (CRB)",
    description: "Reach Chang Research Base through its official social channels and community groups for questions, corrections and feedback.",
  },
  "/disclaimer": {
    title: "Disclaimer & Risk Notice | Chang Research Base",
    description: "Chang Research Base content is for information and education only. It is not investment advice. Read the risk notice and data limitations.",
  },
  "/fundamental-stock-analysis": {
    title: "NSE Stock Screener: Fundamental Analysis Tool | CRB",
    description: "Enter up to six NSE symbols to compare valuation, profitability, growth and debt metrics side by side in a free fundamental screener.",
  },
  "/fundamental-indicators": {
    title: "23 Fundamental Analysis Indicators Explained | CRB",
    description: "Plain-English guide to 23 stock analysis indicators: P/E, ROE, free cash flow, debt-to-equity, profit margin, EPS growth, PEG and more.",
  },
  "/fundamental-analysis-ratios": {
    title: "54 Financial Ratios for Stock Analysis, Explained | CRB",
    description: "Searchable reference to 54 financial ratios with formulas, how to interpret them, common mistakes, sector priorities and a learning roadmap.",
  },
  "/technical-analysis-guide": {
    title: "Technical Analysis for Beginners: Charts & Indicators | CRB",
    description: "Learn trends, support and resistance, moving averages, RSI, MACD, Bollinger Bands, Fibonacci and volume analysis from scratch.",
  },
  "/candlestick-patterns": {
    title: "19 Candlestick Patterns Explained with Rules | CRB",
    description: "Reference for 19 candlestick patterns: psychology, anatomy, entry and exit rules and common mistakes for bullish, bearish and neutral setups.",
  },
  "/price-action": {
    title: "Price Action for Beginners: Read Charts Without Indicators",
    description: "Learn candles, support and resistance, trends, breakouts, market structure and risk management to read a chart without relying on indicators.",
  },
  "/stock-market-basics": {
    title: "Stock Market Basics: Where to Invest and How to Trade | CRB",
    description: "Beginner guide to how stock markets work, the main places to invest, how trading differs from investing, and the risks to understand first.",
  },
  "/nifty-equity-indices": {
    title: "Nifty Indices Explorer: NSE Index Constituents | CRB",
    description: "Explore 44 NSE Nifty indices with constituent stocks, weighting and selection criteria: Nifty 50, Bank Nifty, sectoral and thematic indices.",
  },
  "/understanding-crypto-complete-guide": {
    title: "Understanding Crypto: A 35-Chapter Beginner's Guide | CRB",
    description: "Free long-form guide to cryptocurrency, from blockchains, wallets and exchanges to DeFi, risks and regulation, explained in plain language.",
  },
};

/** Metadata for a canonical path: unique title/description, self-canonical, matching Open Graph. */
export function pageMetadata(path: string, override?: Partial<{ title: string; description: string }>): Metadata {
  const m = { ...META[path], ...override };
  const url = path === "/" ? `${SITE}/` : `${SITE}${path}`;
  return {
    title: { absolute: m.title },
    description: m.description,
    alternates: { canonical: url },
    openGraph: { url, title: m.title, description: m.description },
    twitter: { title: m.title, description: m.description },
  };
}

const STUFFING = [
  /,?\s*Chang Reports,?\s*(&|and)\s*Market Reports/g,
  /\s*(&|and)\s*Chang Reports\b/g,
  /,\s*Chang Reports\b/g,
];

/** Removes the repeated "Chang Reports / Market Reports" aliases from authored structured data. */
export function scrubLd<T>(node: T): T {
  if (typeof node === "string") return STUFFING.reduce<string>((s, re) => s.replace(re, ""), node) as T;
  if (Array.isArray(node)) {
    const drop = new Set(["Chang Reports", "Chang Base", "Market Reports"]);
    return node.filter((x) => !(typeof x === "string" && drop.has(x))).map(scrubLd) as T;
  }
  if (node && typeof node === "object") return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, scrubLd(v)])) as T;
  return node;
}

export const ldJson = (d: unknown) => JSON.stringify(scrubLd(d)).replace(/</g, "\\u003c");
