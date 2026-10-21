const axios = require('axios');

// ─── TTL Cache ──────────────────────────────────────────────────────────────────
class TTLCache {
  constructor(ttlMs = 300000) { this.ttl = ttlMs; this.store = new Map(); }
  get(key) {
    const e = this.store.get(key);
    if (!e) return null;
    if (Date.now() > e.exp) { this.store.delete(key); return null; }
    return e.val;
  }
  set(key, val) { this.store.set(key, { val, exp: Date.now() + this.ttl }); }
}

const marketCache   = new TTLCache(300000);   // 5 min — CoinGecko top 100
const trendingCache = new TTLCache(600000);   // 10 min — CoinGecko trending
const binanceCache  = new TTLCache(60000);    // 1 min  — Binance 24hr ticker

const COINGECKO_BASE    = 'https://api.coingecko.com/api/v3';
const BINANCE_BASE      = 'https://api.binance.com/api/v3';
const MIN_USDT_VOLUME   = 100000; // minimum $100K USD daily volume (filters micro-caps)

// ─── Helper: normalize a CoinGecko markets item ────────────────────────────────
function mapCoin(c) {
  return {
    id:               c.id,
    symbol:           (c.symbol || '').toUpperCase(),
    name:             c.name,
    image:            c.image,
    price:            c.current_price,
    marketCap:        c.market_cap,
    rank:             c.market_cap_rank,
    volume24h:        c.total_volume,
    high24h:          c.high_24h,
    low24h:           c.low_24h,
    change24h:        c.price_change_24h,
    changePercent24h: c.price_change_percentage_24h,
    changePercent7d:  c.price_change_percentage_7d_in_currency  ?? null,
    changePercent1y:  c.price_change_percentage_1y_in_currency  ?? null,
    ath:              c.ath,
    athDate:          c.ath_date,
    athChangePercent: c.ath_change_percentage,
    atl:              c.atl,
    atlDate:          c.atl_date,
    atlChangePercent: c.atl_change_percentage,
    circulatingSupply: c.circulating_supply,
    totalSupply:      c.total_supply,
    lastUpdated:      c.last_updated,
  };
}

// ─── CoinGecko: Top 100 coins by market cap ────────────────────────────────────
async function fetchCoinGeckoMarkets() {
  const key = 'cg_markets';
  const cached = marketCache.get(key);
  if (cached) return { data: cached, cached: true };

  const { data } = await axios.get(`${COINGECKO_BASE}/coins/markets`, {
    params: {
      vs_currency:              'usd',
      order:                    'market_cap_desc',
      per_page:                 100,
      page:                     1,
      price_change_percentage:  '24h,7d,1y',
      sparkline:                false,
    },
    timeout: 12000,
  });

  const result = data.map(mapCoin);
  marketCache.set(key, result);
  return { data: result, cached: false };
}

// ─── CoinGecko: Trending coins ─────────────────────────────────────────────────
async function fetchTrending() {
  const key = 'cg_trending';
  const cached = trendingCache.get(key);
  if (cached) return { data: cached, cached: true };

  const { data } = await axios.get(`${COINGECKO_BASE}/search/trending`, { timeout: 10000 });

  const result = (data.coins || []).map(item => {
    const c = item.item;
    return {
      id:               c.id,
      symbol:           (c.symbol || '').toUpperCase(),
      name:             c.name,
      image:            c.small || c.thumb,
      rank:             c.market_cap_rank,
      price:            c.data?.price ?? null,
      changePercent24h: c.data?.price_change_percentage_24h?.usd ?? null,
      marketCap:        c.data?.market_cap ?? null,
      sparkline:        c.data?.sparkline  ?? null,
      trendingScore:    c.score,
    };
  });

  trendingCache.set(key, result);
  return { data: result, cached: false };
}

// ─── Binance: All USDT pairs (shared base for screeners) ──────────────────────
async function fetchBinanceUSDTPairs() {
  const key = 'binance_usdt';
  const cached = binanceCache.get(key);
  if (cached) return { pairs: cached, cached: true };

  const { data } = await axios.get(`${BINANCE_BASE}/ticker/24hr`, { timeout: 15000 });

  const result = data
    .filter(t => {
      if (!t.symbol.endsWith('USDT')) return false;
      // exclude leveraged / inverse tokens
      if (/(?:UP|DOWN|BULL|BEAR|3L|3S|2L|2S|5L|5S)USDT$/.test(t.symbol)) return false;
      return true;
    })
    .map(t => ({
      symbol:             t.symbol.replace(/USDT$/, ''),
      lastPrice:          parseFloat(t.lastPrice),
      priceChange:        parseFloat(t.priceChange),
      priceChangePercent: parseFloat(t.priceChangePercent),
      weightedAvgPrice:   parseFloat(t.weightedAvgPrice),
      high24h:            parseFloat(t.highPrice),
      low24h:             parseFloat(t.lowPrice),
      volume:             parseFloat(t.volume),       // base currency
      quoteVolume:        parseFloat(t.quoteVolume),  // USDT
      tradeCount:         t.count,
      openPrice:          parseFloat(t.openPrice),
    }))
    .filter(t => t.quoteVolume >= MIN_USDT_VOLUME);

  binanceCache.set(key, result);
  return { pairs: result, cached: false };
}

// ─── Gainers ───────────────────────────────────────────────────────────────────
async function fetchGainers(count = 25) {
  const { pairs, cached } = await fetchBinanceUSDTPairs();
  const data = [...pairs]
    .filter(t => t.priceChangePercent > 0)
    .sort((a, b) => b.priceChangePercent - a.priceChangePercent)
    .slice(0, count);
  return { data, total: data.length, cached };
}

// ─── Losers ────────────────────────────────────────────────────────────────────
async function fetchLosers(count = 25) {
  const { pairs, cached } = await fetchBinanceUSDTPairs();
  const data = [...pairs]
    .filter(t => t.priceChangePercent < 0)
    .sort((a, b) => a.priceChangePercent - b.priceChangePercent)
    .slice(0, count);
  return { data, total: data.length, cached };
}

// ─── Most Active (by trade count) ─────────────────────────────────────────────
async function fetchMostActive(count = 25) {
  const { pairs, cached } = await fetchBinanceUSDTPairs();
  const data = [...pairs]
    .sort((a, b) => b.tradeCount - a.tradeCount)
    .slice(0, count);
  return { data, total: data.length, cached };
}

// ─── Most Volume (by USD volume) ──────────────────────────────────────────────
async function fetchMostVolume(count = 25) {
  const { pairs, cached } = await fetchBinanceUSDTPairs();
  const data = [...pairs]
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, count);
  return { data, total: data.length, cached };
}

// ─── 52-Week Highs & Lows (derived from CoinGecko top 100, no extra API call) ─
async function fetch52WeekData() {
  const { data } = await fetchCoinGeckoMarkets();

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  // Near 52W High: ATH must be within the last year (ATH = 52W high for those coins)
  // athChangePercent is negative (e.g. -5.2 means 5.2% below ATH)
  // Sort DESC → least negative first = closest to 52W high
  const nearHighs = data
    .filter(c => c.athDate && new Date(c.athDate) >= oneYearAgo && c.athChangePercent != null)
    .map(c => ({ ...c, pctFromHigh: c.athChangePercent }))
    .sort((a, b) => b.pctFromHigh - a.pctFromHigh)
    .slice(0, 20);

  // Near 52W Low: worst 1-year performers (proxy — no extra API call needed)
  // Sort ASC → most negative first = furthest down from 1Y ago price
  const nearLows = data
    .filter(c => c.changePercent1y != null)
    .map(c => ({ ...c, pctFrom1yAgo: c.changePercent1y }))
    .sort((a, b) => a.pctFrom1yAgo - b.pctFrom1yAgo)
    .slice(0, 20);

  return { nearHighs, nearLows, cached: false };
}

// ─── Combined dashboard snapshot ───────────────────────────────────────────────
async function fetchDashboard() {
  const [markets, trending, gainers, losers, mostActive, mostVolume, fiftyTwo] = await Promise.allSettled([
    fetchCoinGeckoMarkets(),
    fetchTrending(),
    fetchGainers(20),
    fetchLosers(20),
    fetchMostActive(20),
    fetchMostVolume(20),
    fetch52WeekData(),
  ]);

  const get = (r) => r.status === 'fulfilled' ? r.value : null;
  return {
    markets:    get(markets),
    trending:   get(trending),
    gainers:    get(gainers),
    losers:     get(losers),
    mostActive: get(mostActive),
    mostVolume: get(mostVolume),
    fiftyTwo:   get(fiftyTwo),
    timestamp:  new Date().toISOString(),
  };
}

module.exports = {
  fetchCoinGeckoMarkets,
  fetchTrending,
  fetchGainers,
  fetchLosers,
  fetchMostActive,
  fetchMostVolume,
  fetch52WeekData,
  fetchDashboard,
};
