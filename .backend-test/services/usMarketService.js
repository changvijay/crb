const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// ─── TTL Cache ──────────────────────────────────────────────────────────────────
class TTLCache {
  constructor(ttlMs = 180000) { this.ttl = ttlMs; this.store = new Map(); }
  get(key) {
    const e = this.store.get(key);
    if (!e) return null;
    if (Date.now() > e.exp) { this.store.delete(key); return null; }
    return e.val;
  }
  set(key, val) { this.store.set(key, { val, exp: Date.now() + this.ttl }); }
}

const cache = new TTLCache(180000); // 3 min

// ─── US Index Symbols ───────────────────────────────────────────────────────────
const US_INDEX_SYMBOLS = [
  '^DJI', '^GSPC', '^IXIC', '^NDX', '^RUT',
  '^VIX', '^SOX', '^MID', '^SML',
  '^DJT', '^DJU', '^NYA',
  'DX-Y.NYB', 'GC=F', 'CL=F', 'SI=F',
  '^TNX', '^TYX', '^FVX',
];

const INDEX_META = {
  '^DJI':     { name: 'Dow Jones Industrial Avg', shortName: 'DJIA',       icon: '🏭', group: 'Major Indices'  },
  '^GSPC':    { name: 'S&P 500',                  shortName: 'S&P 500',    icon: '📊', group: 'Major Indices'  },
  '^IXIC':    { name: 'NASDAQ Composite',          shortName: 'NASDAQ',     icon: '💻', group: 'Major Indices'  },
  '^NDX':     { name: 'NASDAQ 100',               shortName: 'NDX',        icon: '🚀', group: 'Major Indices'  },
  '^RUT':     { name: 'Russell 2000',             shortName: 'RUT',        icon: '📈', group: 'Major Indices'  },
  '^MID':     { name: 'S&P 400 MidCap',           shortName: 'MidCap 400', icon: '📉', group: 'Major Indices'  },
  '^SML':     { name: 'S&P 600 SmallCap',         shortName: 'SmCap 600',  icon: '🔹', group: 'Major Indices'  },
  '^NYA':     { name: 'NYSE Composite',           shortName: 'NYSE Comp',  icon: '🏛️', group: 'Sector Indices' },
  '^DJT':     { name: 'Dow Jones Transportation', shortName: 'DJT',        icon: '✈️', group: 'Sector Indices' },
  '^DJU':     { name: 'Dow Jones Utilities',      shortName: 'DJU',        icon: '⚡', group: 'Sector Indices' },
  '^SOX':     { name: 'Philadelphia Semi',        shortName: 'SOX',        icon: '🔧', group: 'Sector Indices' },
  '^VIX':     { name: 'CBOE Volatility (VIX)',    shortName: 'VIX',        icon: '🌊', group: 'Volatility & Rates' },
  '^TNX':     { name: '10-Year Treasury Yield',   shortName: '10Y Yield',  icon: '🏦', group: 'Volatility & Rates' },
  '^TYX':     { name: '30-Year Treasury Yield',   shortName: '30Y Yield',  icon: '📋', group: 'Volatility & Rates' },
  '^FVX':     { name: '5-Year Treasury Yield',    shortName: '5Y Yield',   icon: '📝', group: 'Volatility & Rates' },
  'DX-Y.NYB': { name: 'US Dollar Index',          shortName: 'DXY',        icon: '💵', group: 'Commodities & FX'   },
  'GC=F':     { name: 'Gold Futures',             shortName: 'Gold',       icon: '🥇', group: 'Commodities & FX'   },
  'CL=F':     { name: 'Crude Oil WTI',            shortName: 'WTI Oil',    icon: '🛢️', group: 'Commodities & FX'   },
  'SI=F':     { name: 'Silver Futures',           shortName: 'Silver',     icon: '🥈', group: 'Commodities & FX'   },
};

// ─── S&P 500 top stocks grouped by sector for heatmap ─────────────────────────
const HEATMAP_SECTORS = {
  'Technology':         ['AAPL','MSFT','NVDA','AVGO','AMD','ORCL','CRM','QCOM','TXN','INTC','AMAT','MU','ADBE','NOW','KLAC'],
  'Consumer Discret.':  ['AMZN','TSLA','HD','MCD','NKE','LOW','SBUX','TGT','BKNG','ABNB'],
  'Comm. Services':     ['GOOGL','META','NFLX','DIS','CMCSA','T','VZ','SNAP'],
  'Financials':         ['JPM','BAC','WFC','GS','MS','BLK','AXP','V','MA','PYPL','C','SCHW'],
  'Healthcare':         ['UNH','LLY','JNJ','ABBV','MRK','TMO','ABT','AMGN','PFE','GILD','CVS','ISRG'],
  'Energy':             ['XOM','CVX','COP','EOG','SLB','PSX','OXY','VLO'],
  'Industrials':        ['GE','CAT','UPS','HON','BA','RTX','LMT','DE','MMM','FDX'],
  'Cons. Staples':      ['WMT','PG','COST','KO','PEP','PM','MO','MDLZ','CL'],
  'Materials':          ['LIN','APD','ECL','NEM','FCX','DOW','ALB'],
  'Real Estate':        ['AMT','PLD','EQIX','SPG','O','WELL'],
  'Utilities':          ['NEE','DUK','SO','AEP','EXC','SRE'],
};

// ─── Helper: normalize a quote object ──────────────────────────────────────────
function mapQuote(q) {
  return {
    symbol:        q.symbol,
    name:          q.shortName || q.longName || q.symbol,
    price:         q.regularMarketPrice        ?? null,
    change:        q.regularMarketChange       ?? null,
    changePercent: q.regularMarketChangePercent ?? null,
    previousClose: q.regularMarketPreviousClose ?? null,
    open:          q.regularMarketOpen         ?? null,
    dayHigh:       q.regularMarketDayHigh      ?? null,
    dayLow:        q.regularMarketDayLow       ?? null,
    volume:        q.regularMarketVolume       ?? null,
    avgVolume:     q.averageDailyVolume3Month  ?? null,
    marketCap:     q.marketCap                 ?? null,
    fiftyTwoWeekHigh: q.fiftyTwoWeekHigh       ?? null,
    fiftyTwoWeekLow:  q.fiftyTwoWeekLow        ?? null,
    pe:            q.trailingPE                ?? null,
    pb:            q.priceToBook               ?? null,
    sector:        q.sector                    ?? null,
    marketState:   q.marketState               ?? null,
  };
}

// ─── US Indices ─────────────────────────────────────────────────────────────────
async function fetchUSIndices() {
  const key = 'us_indices';
  const cached = cache.get(key);
  if (cached) return { data: cached, cached: true };

  const quotes = await yahooFinance.quote(US_INDEX_SYMBOLS);
  const arr = Array.isArray(quotes) ? quotes : [quotes];
  const result = arr.map(q => ({
    ...mapQuote(q),
    ...(INDEX_META[q.symbol] || { name: q.shortName || q.symbol, shortName: q.symbol, icon: '📊', group: 'Other' }),
  }));

  cache.set(key, result);
  return { data: result, cached: false };
}

// ─── Generic screener wrapper ──────────────────────────────────────────────────
async function fetchScreener(scrId, count = 25) {
  const key = `screener_${scrId}_${count}`;
  const cached = cache.get(key);
  if (cached) return { ...cached, cached: true };

  const result = await yahooFinance.screener(scrId, { count }, { validateResult: false });
  const data = {
    total:  result.total,
    count:  result.count,
    quotes: (result.quotes || []).map(mapQuote),
  };
  cache.set(key, data);
  return { ...data, cached: false };
}

// ─── 52-Week Highs & Lows ───────────────────────────────────────────────────────
async function fetch52WeekData() {
  const key = '52week';
  const cached = cache.get(key);
  if (cached) return { ...cached, cached: true };

  const allSymbols = Object.values(HEATMAP_SECTORS).flat();
  const quotes = await yahooFinance.quote(allSymbols);
  const arr = Array.isArray(quotes) ? quotes : [quotes];

  const withData = arr
    .filter(q => q.fiftyTwoWeekHigh && q.fiftyTwoWeekLow && q.regularMarketPrice)
    .map(q => ({
      ...mapQuote(q),
      pctFrom52High: Number(((q.regularMarketPrice - q.fiftyTwoWeekHigh) / q.fiftyTwoWeekHigh * 100).toFixed(2)),
      pctFrom52Low:  Number(((q.regularMarketPrice - q.fiftyTwoWeekLow)  / q.fiftyTwoWeekLow  * 100).toFixed(2)),
    }));

  // Near 52W high → sorted descending by pctFrom52High (i.e. -0.5% is closer than -5%)
  const nearHighs = [...withData]
    .sort((a, b) => b.pctFrom52High - a.pctFrom52High)
    .slice(0, 20);

  // Near 52W low → sorted ascending by pctFrom52Low (closest to +0%)
  const nearLows = [...withData]
    .sort((a, b) => a.pctFrom52Low - b.pctFrom52Low)
    .slice(0, 20);

  const data = { nearHighs, nearLows };
  cache.set(key, data);
  return { ...data, cached: false };
}

// ─── Heatmap data ───────────────────────────────────────────────────────────────
async function fetchHeatmapData() {
  const key = 'heatmap';
  const cached = cache.get(key);
  if (cached) return { sectors: cached, cached: true };

  const allSymbols = Object.values(HEATMAP_SECTORS).flat();
  const quotes = await yahooFinance.quote(allSymbols);
  const arr = Array.isArray(quotes) ? quotes : [quotes];

  const sectors = {};
  for (const [sector, symbols] of Object.entries(HEATMAP_SECTORS)) {
    sectors[sector] = symbols
      .map(sym => arr.find(q => q.symbol === sym))
      .filter(q => q && q.regularMarketPrice != null)
      .map(q => ({
        symbol:        q.symbol,
        name:          q.shortName || q.longName || q.symbol,
        price:         q.regularMarketPrice,
        change:        q.regularMarketChange,
        changePercent: q.regularMarketChangePercent,
        marketCap:     q.marketCap,
        volume:        q.regularMarketVolume,
      }));
  }

  cache.set(key, sectors);
  return { sectors, cached: false };
}

// ─── Combined dashboard snapshot ────────────────────────────────────────────────
async function fetchDashboard() {
  const [indices, gainers, losers, mostActive, fiftyTwo, heatmap] = await Promise.allSettled([
    fetchUSIndices(),
    fetchScreener('day_gainers', 20),
    fetchScreener('day_losers',  20),
    fetchScreener('most_actives', 20),
    fetch52WeekData(),
    fetchHeatmapData(),
  ]);

  const get = (r) => r.status === 'fulfilled' ? r.value : null;
  return {
    indices:    get(indices),
    gainers:    get(gainers),
    losers:     get(losers),
    mostActive: get(mostActive),
    fiftyTwo:   get(fiftyTwo),
    heatmap:    get(heatmap),
    timestamp:  new Date().toISOString(),
  };
}

module.exports = {
  fetchUSIndices,
  fetchGainers:     (count) => fetchScreener('day_gainers',          count),
  fetchLosers:      (count) => fetchScreener('day_losers',           count),
  fetchMostActive:  (count) => fetchScreener('most_actives',         count),
  fetchUndervalued: (count) => fetchScreener('undervalued_large_caps', count),
  fetch52WeekData,
  fetchHeatmapData,
  fetchDashboard,
};
