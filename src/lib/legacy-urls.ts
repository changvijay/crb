/**
 * Legacy spellings of page URLs (old casing, underscores, .html) and their canonical lowercase-hyphen target.
 * Shared by next.config.ts (same-host redirects) and src/proxy.ts (old-host redirects), so both agree.
 * Canonical casing itself is handled generically in the proxy (redirect sources here match case-insensitively).
 */
export const CANONICAL_ORIGIN = "https://crb.changtechs.com";
export const LEGACY: Record<string, string> = {
  "/CandlestickPatterns": "/candlestick-patterns", "/candlestickPatterns": "/candlestick-patterns", "/candlestickpatterns": "/candlestick-patterns",
  "/candlestickPatterns.html": "/candlestick-patterns", "/CandlestickPatterns.html": "/candlestick-patterns",
  "/fundamentalIndicators": "/fundamental-indicators", "/fundamentalindicators": "/fundamental-indicators", "/fundamentalIndicators.html": "/fundamental-indicators",
  "/fundamental_analysis_ratios": "/fundamental-analysis-ratios", "/fundamental_analysis_ratios.html": "/fundamental-analysis-ratios",
  // Case-only variants such as /Stock-Market-Basics are handled in src/proxy.ts (redirect sources here are case-insensitive).
  "/Stock-Market-Basics.html": "/stock-market-basics", "/stock-market-basics.html": "/stock-market-basics",
  "/nse-data.html": "/nse-data", "/news.html": "/news", "/us-market.html": "/us-market", "/crypto.html": "/crypto", "/learning.html": "/learning",
  "/recommendations.html": "/recommendations", "/fundamental-stock-analysis.html": "/fundamental-stock-analysis",
  "/Nifty_Equity_Indices.html": "/nifty-equity-indices", "/nifty_equity_indices.html": "/nifty-equity-indices", "/nifty-equity-indices.html": "/nifty-equity-indices",
  "/nifty-indices-explorer": "/nifty-equity-indices", "/technical-analysis-guide.html": "/technical-analysis-guide",
  "/PriceAction.html": "/price-action", "/price-action.html": "/price-action", "/understanding-crypto-complete-guide.html": "/understanding-crypto-complete-guide",
};

/** Hosts that must land on the canonical origin in a single permanent hop, path and query preserved. */
export const OLD_HOSTS = new Set(["changresearchbase.vercel.app", "www.crb.changtechs.com"]);
