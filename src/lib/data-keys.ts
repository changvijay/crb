/**
 * Opaque names for the public market-data reads. The browser sends one of these to a Server Action;
 * the real backend paths live only in lib/server/public-data.ts, so no endpoint URL appears in the Network tab.
 */
export const DATA_KEYS = [
  "reports", "sevenDay", "flows", "intraday", "world", "liveMarkets", "us", "crypto",
  "nseHeat", "nseGainers", "nse52", "nsePenny", "nseBand", "nseIpo", "nseActive", "nseBhav", "nseIndices", "idxCompare",
  "news", "blogs", "recos", "screener",
] as const;

export type DataKey = (typeof DATA_KEYS)[number];
export type DataParams = Record<string, string>;
