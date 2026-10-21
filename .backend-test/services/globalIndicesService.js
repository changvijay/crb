const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const axios = require('axios');

// ─── User Agent Pool for Research360 API ──────────────────────────────────────
const UA_POOL = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];
const randomUA = () => UA_POOL[Math.floor(Math.random() * UA_POOL.length)];

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
  clear() { this.store.clear(); }
}

const cache = new TTLCache(300000); // 5 min cache

// ─── Index Definitions by Region ────────────────────────────────────────────────
const INDEX_DEFINITIONS = {
  'India': [
  // Pre-market sentiment
  { symbol: 'NSEI=F', name: 'GIFT Nifty (Futures Proxy)', currency: 'USD', priority: true },

  { symbol: '^NSEI',        name: 'Nifty 50',           currency: 'INR', priority: true },
  { symbol: '^NSEBANK',     name: 'Bank Nifty',         currency: 'INR', priority: true },
  { symbol: '^BSESN',       name: 'BSE Sensex',         currency: 'INR' },
  { symbol: '^INDIAVIX',    name: 'India VIX',          currency: 'INR' },

  // Midcaps
  { symbol: '^NSMIDCP',     name: 'Nifty Midcap 100',   currency: 'INR' },
  { symbol: '^NSEMDCP50',   name: 'Nifty Midcap 50',    currency: 'INR' },

  // Sectors
  { symbol: '^CNXIT',       name: 'Nifty IT',           currency: 'INR' },
  { symbol: '^CNXAUTO',     name: 'Nifty Auto',         currency: 'INR' },
],

  'United States': [
    { symbol: '^DJI',   name: 'Dow Jones Industrial Average', currency: 'USD'},
    { symbol: '^GSPC',  name: 'S&P 500',                      currency: 'USD'},
    { symbol: '^IXIC',  name: 'NASDAQ Composite',             currency: 'USD' },

    // Extended coverage
    { symbol: '^NDX',   name: 'NASDAQ 100',                   currency: 'USD' },
    { symbol: '^RUT',   name: 'Russell 2000',                 currency: 'USD' },
  ],

  'United Kingdom': [
    { symbol: '^FTSE',  name: 'FTSE 100', currency: 'GBP'},
    { symbol: '^FTMC',  name: 'FTSE 250', currency: 'GBP' },
  ],

  'Germany': [
    { symbol: '^GDAXI', name: 'DAX', currency: 'EUR'},
  ],

  'France': [
    { symbol: '^FCHI',  name: 'CAC 40', currency: 'EUR' },
  ],

  'Europe': [
    { symbol: '^STOXX50E', name: 'Euro Stoxx 50', currency: 'EUR' },
    { symbol: '^STOXX600', name: 'STOXX Europe 600', currency: 'EUR' },
  ],

  'Japan': [
    { symbol: '^N225',  name: 'Nikkei 225', currency: 'JPY' },
    { symbol: '^TOPX',  name: 'TOPIX',      currency: 'JPY' },
  ],

  'China': [
    { symbol: '000001.SS', name: 'SSE Composite (Shanghai)', currency: 'CNY' },
    { symbol: '000300.SS', name: 'CSI 300',                  currency: 'CNY' },
    { symbol: '399001.SZ', name: 'Shenzhen Component',       currency: 'CNY' },
  ],

  'Hong Kong': [
    { symbol: '^HSI',   name: 'Hang Seng Index', currency: 'HKD'},
    { symbol: '^HSCE',  name: 'Hang Seng China Enterprises Index', currency: 'HKD' },
  ],

  'South Korea': [
    { symbol: '^KS11',  name: 'KOSPI', currency: 'KRW'},
  ],

  'Australia': [
    { symbol: '^AXJO',  name: 'ASX 200', currency: 'AUD'},
  ],

  'Brazil': [
    { symbol: '^BVSP',  name: 'Bovespa (IBOVESPA)', currency: 'BRL'},
  ],

  'Canada': [
    { symbol: '^GSPTSE', name: 'TSX Composite', currency: 'CAD'},
  ],

  'Taiwan': [
    { symbol: '^TWII',  name: 'Taiwan Weighted Index', currency: 'TWD'},
  ],

  'Singapore': [
    { symbol: '^STI',   name: 'Straits Times Index', currency: 'SGD'},
  ],

  'Indonesia': [
    { symbol: '^JKSE',  name: 'Jakarta Composite', currency: 'IDR'},
  ],

  'Malaysia': [
    { symbol: '^KLSE',  name: 'FTSE Bursa Malaysia KLCI', currency: 'MYR' },
  ],

  'Philippines': [
    { symbol: '^PSEI',  name: 'Philippines PSEi', currency: 'PHP' },
  ],

  'Mexico': [
    { symbol: '^MXX',   name: 'IPC Mexico', currency: 'MXN'},
  ],

  'Switzerland': [
    { symbol: '^SSMI',  name: 'Swiss Market Index', currency: 'CHF'},
  ],

  'Middle East': [
    { symbol: '^TASI.SR', name: 'Saudi Tadawul All Share Index', currency: 'SAR' },
  ],

  'Africa': [
    { symbol: '^JN0U.JO', name: 'FTSE/JSE Top 40', currency: 'ZAR' },
  ],

  'Global': [
    { symbol: 'ACWI', name: 'MSCI ACWI (All Country World Index ETF)', currency: 'USD'},
    { symbol: 'URTH', name: 'MSCI World Index (ETF)',                  currency: 'USD' },
    { symbol: 'EEM',  name: 'MSCI Emerging Markets (ETF)',             currency: 'USD' },
    { symbol: 'VEU',  name: 'FTSE All-World ex-US (ETF)',              currency: 'USD' },
  ],
};

// Collect all symbols for batch fetching
const ALL_SYMBOLS = Object.values(INDEX_DEFINITIONS).flat().map(d => d.symbol);

// Build a fast lookup: symbol -> { region, name, currency, priority }
const SYMBOL_META = {};
for (const [region, indices] of Object.entries(INDEX_DEFINITIONS)) {
  for (const idx of indices) {
    SYMBOL_META[idx.symbol] = { 
      region, 
      name: idx.name, 
      currency: idx.currency,
      priority: idx.priority || false
    };
  }
}

// ─── Research360 API for GIFT NIFTY ───────────────────────────────────────────

/**
 * Fetch GIFT NIFTY data from Research360 API
 */
async function fetchGiftNiftyFromResearch360() {
  try {
    console.log('[Global Indices] 🔄 Fetching GIFT NIFTY from Research360 API...');
    
    const response = await axios.get('https://www.research360.in/api/market/world-indices', {
      timeout: 10000,
      headers: {
        'User-Agent': randomUA(),
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    // Handle the nested response structure
    const apiData = response.data?.right?.data || [];
    
    // Find GIFT NIFTY in the response
    const giftNiftyData = apiData.find(item => 
      item.index_name && item.index_name.toLowerCase().includes('gift nifty')
    );
    
    if (!giftNiftyData) {
      console.warn('[Global Indices] ⚠️ GIFT NIFTY not found in Research360 response');
      return null;
    }
    
    console.log('[Global Indices] ✅ GIFT NIFTY fetched from Research360');
    return {
      symbol: 'NSEI=F',
      quote: {
        // Convert Research360 format to Yahoo Finance-like format
        regularMarketPrice: parseFloat(giftNiftyData.last || 0),
        regularMarketChange: parseFloat(giftNiftyData.change || 0),
        regularMarketChangePercent: parseFloat(giftNiftyData.change_per || 0),
        regularMarketPreviousClose: parseFloat(giftNiftyData.prev_close || 0),
        currency: 'USD', // GIFT NIFTY trades in USD
        marketState: 'REGULAR',
        regularMarketTime: new Date(giftNiftyData.date || Date.now()),
        // Add Research360 specific fields
        _source: 'Research360',
        _originalData: giftNiftyData
      }
    };
  } catch (error) {
    console.warn(`[Global Indices] ⚠️ Research360 API failed for GIFT NIFTY: ${error.message}`);
    return null;
  }
}

// ─── Yahoo Finance helpers ──────────────────────────────────────────────────────

/**
 * Fetch quotes for a list of symbols using yahoo-finance2.
 * GIFT NIFTY is fetched from Research360 API, others from Yahoo Finance.
 * Uses concurrency control to avoid rate limits.
 * Enhanced with error logging for debugging missing symbols.
 */
async function fetchQuotes(symbols) {
  const CONCURRENCY = 5;
  const results = [];
  const errors = [];

  console.log(`[Global Indices] Attempting to fetch ${symbols.length} symbols:`, symbols);
  
  // Separate GIFT NIFTY from other symbols
  const giftNiftySymbols = symbols.filter(sym => sym === 'NSEI=F');
  const yahooSymbols = symbols.filter(sym => sym !== 'NSEI=F');
  
  // Fetch GIFT NIFTY from Research360
  if (giftNiftySymbols.length > 0) {
    const giftNiftyData = await fetchGiftNiftyFromResearch360();
    if (giftNiftyData) {
      results.push(giftNiftyData);
      console.log('[Global Indices] ✓ GIFT NIFTY fetched from Research360');
    } else {
      errors.push({ symbol: 'NSEI=F', error: 'Failed to fetch from Research360 API' });
      console.log('[Global Indices] ✗ GIFT NIFTY failed from Research360');
    }
  }
  
  // Fetch other symbols from Yahoo Finance
  if (yahooSymbols.length > 0) {
    for (let i = 0; i < yahooSymbols.length; i += CONCURRENCY) {
      const batch = yahooSymbols.slice(i, i + CONCURRENCY);
      console.log(`[Global Indices] Processing Yahoo Finance batch ${Math.floor(i/CONCURRENCY) + 1}:`, batch);
      
      const settled = await Promise.allSettled(
        batch.map(sym =>
          yahooFinance.quote(sym, {}, { validateResult: false })
            .then(q => {
              console.log(`[Global Indices] ✓ Success for ${sym}:`, q ? 'Data received' : 'No data');
              return { symbol: sym, quote: q };
            })
            .catch(err => {
              console.log(`[Global Indices] ✗ Error for ${sym}:`, err.message);
              throw err;
            })
        )
      );

      for (let j = 0; j < settled.length; j++) {
        const result = settled[j];
        if (result.status === 'fulfilled' && result.value.quote) {
          results.push(result.value);
        } else {
          const reason = result.status === 'rejected'
            ? result.reason?.message || 'Unknown error'
            : 'No data';
          console.log(`[Global Indices] Failed to fetch ${batch[j]}: ${reason}`);
          errors.push({ symbol: batch[j], error: reason });
        }
      }

      // Small delay between batches to avoid rate limiting
      if (i + CONCURRENCY < yahooSymbols.length) {
        await new Promise(r => setTimeout(r, 250));
      }
    }
  }

  console.log(`[Global Indices] Fetch complete - Success: ${results.length}, Errors: ${errors.length}`);
  if (errors.length > 0) {
    console.log(`[Global Indices] Failed symbols:`, errors.map(e => `${e.symbol} (${e.error})`));
  }

  return { results, errors };
}

/**
 * Parse a yahoo-finance2 quote object OR Research360 data into our standardised index data shape.
 */
function parseQuote(sym, quote) {
  const meta = SYMBOL_META[sym];
  if (!meta) return null;

  // Handle Research360 data (for GIFT NIFTY)
  if (quote._source === 'Research360') {
    const originalData = quote._originalData;
    return {
      symbol: sym,
      indexName: originalData.index_name || meta.name,
      country: meta.region,
      currency: quote.currency || meta.currency,
      priority: meta.priority || false,
      lastTradingDate: originalData.date ? originalData.date.split(' ')[0] : null,
      open: null, // Not available in Research360 response
      high: null, // Not available in Research360 response
      low: null,  // Not available in Research360 response
      close: quote.regularMarketPrice,
      previousClose: quote.regularMarketPreviousClose,
      change: quote.regularMarketChange,
      changePercent: quote.regularMarketChangePercent,
      volume: null, // Not available in Research360 response
      marketState: quote.marketState,
      timezone: null,
      dataSourceTimestamp: originalData.date || new Date().toISOString(),
      _dataSource: 'Research360'
    };
  }

  // Handle Yahoo Finance data (for all other indices)
  const close = quote.regularMarketPrice ?? null;
  const prevClose = quote.regularMarketPreviousClose ?? null;
  const change = quote.regularMarketChange ?? null;
  const changePct = quote.regularMarketChangePercent ?? null;

  // regularMarketTime can be a Date object in yahoo-finance2
  let marketTimestamp = null;
  if (quote.regularMarketTime) {
    marketTimestamp = (quote.regularMarketTime instanceof Date)
      ? quote.regularMarketTime.toISOString()
      : new Date(quote.regularMarketTime * 1000).toISOString();
  }

  return {
    symbol: sym,
    indexName: meta.name,
    country: meta.region,
    currency: quote.currency || meta.currency,
    priority: meta.priority || false,
    lastTradingDate: marketTimestamp ? marketTimestamp.split('T')[0] : null,
    open: quote.regularMarketOpen ?? null,
    high: quote.regularMarketDayHigh ?? null,
    low: quote.regularMarketDayLow ?? null,
    close,
    previousClose: prevClose,
    change: change != null ? +change.toFixed(2) : null,
    changePercent: changePct != null ? +changePct.toFixed(2) : null,
    volume: quote.regularMarketVolume ?? null,
    marketState: quote.marketState ?? null,
    timezone: quote.exchangeTimezoneShortName || quote.exchangeTimezoneName || null,
    dataSourceTimestamp: marketTimestamp,
    _dataSource: 'Yahoo Finance'
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Fetch the latest completed-day data for all global indices.
 * Returns data organized by region.
 */
async function fetchGlobalIndices() {
  const cached = cache.get('globalIndices');
  if (cached) return { ...cached, fromCache: true };

  const { results, errors } = await fetchQuotes(ALL_SYMBOLS);

  // Parse into structured format by region
  const parsedByRegion = {};
  const regionOrder = Object.keys(INDEX_DEFINITIONS);
  for (const region of regionOrder) {
    parsedByRegion[region] = [];
  }

  for (const { symbol, quote } of results) {
    const parsed = parseQuote(symbol, quote);
    if (parsed && parsedByRegion[parsed.country]) {
      parsedByRegion[parsed.country].push(parsed);
    }
  }

  // Sort indices within each region — priority indices first
  for (const region of regionOrder) {
    parsedByRegion[region].sort((a, b) => {
      const aPriority = SYMBOL_META[a.symbol]?.priority || a.priority || false;
      const bPriority = SYMBOL_META[b.symbol]?.priority || b.priority || false;
      
      // Priority indices come first
      if (aPriority && !bPriority) return -1;
      if (!aPriority && bPriority) return 1;
      
      // Among priority indices or non-priority indices, maintain original order
      return 0;
    });
  }

  const regions = regionOrder.map(region => ({
    region,
    indices: parsedByRegion[region],
  }));

  const missing = errors.map(e => e.symbol);

  const result = {
    regions,
    summary: {
      totalIndices: ALL_SYMBOLS.length,
      fetched: results.length,
      missing: missing.length > 0 ? missing : undefined,
      errors: errors.length > 0 ? errors : undefined,
    },
    fetchedAt: new Date().toISOString(),
    fromCache: false,
  };

  cache.set('globalIndices', result);
  return result;
}

/**
 * Fetch data for a single region.
 */
async function fetchRegionIndices(region) {
  const defs = INDEX_DEFINITIONS[region];
  if (!defs) {
    const available = Object.keys(INDEX_DEFINITIONS);
    throw new Error(`Unknown region "${region}". Available: ${available.join(', ')}`);
  }

  const symbols = defs.map(d => d.symbol);
  const { results, errors } = await fetchQuotes(symbols);
  let parsed = results.map(r => parseQuote(r.symbol, r.quote)).filter(Boolean);

  if (region === 'India') {
    // Sort to prioritize Nifty 50 and other priority indices
    parsed.sort((a, b) => {
      const aPriority = SYMBOL_META[a.symbol]?.priority || a.priority || false;
      const bPriority = SYMBOL_META[b.symbol]?.priority || b.priority || false;
      
      // Priority indices come first
      if (aPriority && !bPriority) return -1;
      if (!aPriority && bPriority) return 1;
      
      // Among priority indices or non-priority indices, maintain original order
      return 0;
    });
  }

  return {
    region,
    indices: parsed,
    errors: errors.length > 0 ? errors : undefined,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Fetch data for a single symbol.
 */
async function fetchSingleIndex(symbol) {
  const meta = SYMBOL_META[symbol];
  if (!meta) {
    throw new Error(`Unknown symbol "${symbol}". Use /api/global-indices/symbols for available symbols.`);
  }

  const quote = await yahooFinance.quote(symbol, {}, { validateResult: false });
  if (!quote) throw new Error(`No data returned for ${symbol}`);

  const parsed = parseQuote(symbol, quote);
  return {
    index: parsed,
    fetchedAt: new Date().toISOString(),
  };
}

function getAvailableSymbols() {
  return Object.entries(INDEX_DEFINITIONS).map(([region, indices]) => ({
    region,
    indices: indices.map(i => ({ symbol: i.symbol, name: i.name, currency: i.currency })),
  }));
}

function clearCache() {
  cache.clear();
}

module.exports = {
  fetchGlobalIndices,
  fetchRegionIndices,
  fetchSingleIndex,
  getAvailableSymbols,
  clearCache,
};