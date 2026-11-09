const axios = require('axios');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');
const FIIDIIData = require('../models/FIIDIIData');
const NSEPriceBandHitter = require('../models/NSEPriceBandHitter');
const FIIDIITimeSeriesManager = require('./TimeSeriesManager');

// Initialize time series manager
const timeSeriesManager = new FIIDIITimeSeriesManager();
timeSeriesManager.initialize();

// ─── TTL Cache ──────────────────────────────────────────────────────────────────
class TTLCache {
  constructor(ttlMs = 120000) { this.ttl = ttlMs; this.store = new Map(); }
  get(key) {
    const e = this.store.get(key);
    if (!e) return null;
    if (Date.now() > e.exp) { this.store.delete(key); return null; }
    return e.val;
  }
  set(key, val) { this.store.set(key, { val, exp: Date.now() + this.ttl }); }
  clear() { this.store.clear(); }
}

// ─── Config ─────────────────────────────────────────────────────────────────────
const UA_POOL = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:126.0) Gecko/20100101 Firefox/126.0',
];
const randomUA = () => UA_POOL[Math.floor(Math.random() * UA_POOL.length)];

const cache = new TTLCache(0.5 * 60 * 60 * 1000); // 30 min cache
const longCache = new TTLCache(1 * 60 * 60 * 1000); // 1 hour cache for external APIs (Yahoo)
const fallbackCache = new TTLCache(24 * 60 * 60 * 1000); // 24 hour fallback cache for production
const histCache = new TTLCache(4 * 60 * 60 * 1000); // 4 hour cache for index historical data

// ─── Index Comparison — Ticker Map ─────────────────────────────────────────────
const INDEX_TICKER_MAP = {
  // =========================
  // INDIA
  // =========================
  'NIFTY 50': '^NSEI',
  'SENSEX': '^BSESN',
  'NIFTY BANK': '^NSEBANK',

  'NIFTY IT': '^CNXIT',
  'NIFTY AUTO': '^CNXAUTO',
  'NIFTY FMCG': '^CNXFMCG',
  'NIFTY PHARMA': '^CNXPHARMA',
  'NIFTY METAL': '^CNXMETAL',
  'NIFTY REALTY': '^CNXREALTY',
  'NIFTY ENERGY': '^CNXENERGY',

  'NIFTY MIDCAP 100': '^CRSMID',        // was ^CNXMIDCAP — dead/delisted symbol
  'NIFTY SMALLCAP 100': '^CNXSC',       // was ^CNXSMALLCAP — wrong symbol
  'NIFTY NEXT 50': '^NSMIDCP',          // unchanged — confirmed correct despite the odd name

  'NIFTY FIN SERVICE': 'NIFTY_FIN_SERVICE.NS',  // was ^CNXFINSERVICE — doesn't resolve
  'NIFTY PSU BANK': '^CNXPSUBANK',      // unchanged — confirmed correct
  'NIFTY PRIVATE BANK': 'NIFTY_PVT_BANK.NS',    // was ^NIFPVTBANK — doesn't resolve

  // =========================
  // UNITED STATES
  // =========================
  'S&P 500': '^GSPC',
  'NASDAQ 100': '^NDX',
  'NASDAQ COMPOSITE': '^IXIC',
  'DOW JONES': '^DJI',
  'RUSSELL 2000': '^RUT',

  // Important Tech / Institutional
  'PHLX SEMICONDUCTOR': '^SOX',
  'NYSE FANG+': '^NYFANG',

  // Macro Market
  'US 10Y TREASURY YIELD': '^TNX',
};
let cookies = null;
let cookieExpiry = 0;
let nseAPIBlocked = false;
let lastBlockedTime = 0;

// ─── Data Validation ────────────────────────────────────────────────────────────
function validateDataVariance(data) {
  
  if (!data || !Array.isArray(data) || data.length < 3) {
    console.log(`[Validation] ✅ Skipping validation: dataset too small (${data ? data.length : 0} records)`);
    return true; // Skip validation for small datasets
  }
  
  // Check if more than 80% of FII values are identical
  const fiiValues = data.map(d => d.fii).filter(v => v !== null && v !== undefined);
  if (fiiValues.length === 0) {
    console.log(`[Validation] ❌ No valid FII values found`);
    return false;
  }
  
  const uniqueFiiValues = new Set(fiiValues);
  const duplicateRatio = 1 - (uniqueFiiValues.size / fiiValues.length);
  
  console.log(`[Validation] FII values: ${fiiValues.length} total, ${uniqueFiiValues.size} unique (${Math.round(duplicateRatio * 100)}% duplicates)`);
  
  if (duplicateRatio > 0.8) {
    console.log(`[Validation] ❌ Data rejected: ${Math.round(duplicateRatio * 100)}% identical FII values`);
    return false;
  }
  
  console.log(`[Validation] ✅ Data validated: ${uniqueFiiValues.size}/${fiiValues.length} unique values`);
  return true;
}

// ─── Session / request helpers ──────────────────────────────────────────────────
async function getSession() {
  if (cookies && Date.now() < cookieExpiry) return cookies;
  try {
    const res = await axios.get('https://www.nseindia.com', {
      timeout: 10000,
      headers: {
        'User-Agent': randomUA(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
      },
      maxRedirects: 5,
    });
    const sc = res.headers['set-cookie'];
    if (!sc || sc.length === 0) throw new Error('No cookies');
    cookies = sc.map(c => c.split(';')[0]).join('; ');
    cookieExpiry = Date.now() + 60000; // 60 s – shorter than NSE expiry
    return cookies;
  } catch (err) {
    cookies = null;
    cookieExpiry = 0;
    throw new Error(`NSE session failed: ${err.message}`);
  }
}

async function nseRequest(endpoint) {
  const c = await getSession();
  await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
  const res = await axios.get(`https://www.nseindia.com${endpoint}`, {
    timeout: 15000,
    headers: {
      'User-Agent': randomUA(),
      Accept: 'application/json',
      Referer: 'https://www.nseindia.com/',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      Cookie: c,
    },
  });
  return res.data;
}

async function retryAsync(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try { 
      const result = await fn(); 
      // Reset blocking flag on successful request
      if (nseAPIBlocked) {
        nseAPIBlocked = false;
        console.log('[NSE-Fallback] ✅ NSE API access restored');
      }
      return result;
    } catch (err) {
      if (err.response && [403, 401].includes(err.response.status)) {
        cookies = null; cookieExpiry = 0; // force session refresh
      }
      
      // Detect if NSE API is being blocked
      if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || 
          (err.response && [403, 429, 503].includes(err.response.status))) {
        nseAPIBlocked = true;
        lastBlockedTime = Date.now();
        console.log(`[NSE-Fallback] ⚠️  NSE API blocked: ${err.message}`);
      }
      
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
}

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
  const m = xml.match(re);
  return m ? (m[1] || m[2] || '').trim() : null;
}

const SERIES_MEANINGS = {
  EQ: 'Equity',
  BE: 'Book Entry (Trade-to-Trade)',
  SM: 'SME Market',
  BZ: 'B Group Z Category',
};

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapPriceBandHitterRecord(item) {
  const seriesCode = String(item?.series || item?.seriesCode || '').trim().toUpperCase();

  return {
    symbol: String(item?.symbol || '').trim().toUpperCase(),
    series: {
      code: seriesCode,
      meaning: SERIES_MEANINGS[seriesCode] || 'Other',
    },
    ltp: normalizeNumber(item?.ltp ?? item?.lastPrice),
    change: normalizeNumber(item?.change),
    percentChange: normalizeNumber(item?.percentChange ?? item?.pChange),
    priceBand: normalizeNumber(item?.priceBand),
    highPrice: normalizeNumber(item?.highPrice ?? item?.dayHigh),
    lowPrice: normalizeNumber(item?.lowPrice ?? item?.dayLow),
    yearHigh: normalizeNumber(item?.yearHigh ?? item?.yearHighPrice ?? item?.fiftyTwoWeekHigh),
    yearLow: normalizeNumber(item?.yearLow ?? item?.yearLowPrice ?? item?.fiftyTwoWeekLow),
    totalTradedVol: normalizeNumber(item?.totalTradedVol ?? item?.totalTradedVolume ?? item?.tradedVolume),
    turnover: normalizeNumber(item?.turnover ?? item?.totalTradedValue ?? item?.totalTurnover),
  };
}

function mergePriceBandHitterRecord(existingRecord, nextRecord, category, segment) {
  const mergedCategories = new Set(existingRecord?.categories || []);
  const mergedSegments = new Set(existingRecord?.segments || []);

  if (category) mergedCategories.add(category);
  if (segment) mergedSegments.add(segment);

  return {
    ...(existingRecord || {}),
    ...nextRecord,
    categories: Array.from(mergedCategories),
    segments: Array.from(mergedSegments),
  };
}

function extractPriceBandHitterRecords(payload) {
  if (!payload || typeof payload !== 'object') {
    return { stocks: [], summary: null, timestamp: null };
  }

  const directItems = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload.priceBandHitters)
        ? payload.priceBandHitters
        : Array.isArray(payload.pricebandhitters)
          ? payload.pricebandhitters
          : null;

  if (directItems) {
    return {
      stocks: directItems.map(mapPriceBandHitterRecord).filter((item) => item.symbol),
      summary: payload.count || null,
      timestamp: payload.timestamp || null,
    };
  }

  const bucketKeys = ['upper', 'lower', 'both'];
  const mergedBySymbol = new Map();
  let timestamp = null;

  bucketKeys.forEach((bucketKey) => {
    const bucket = payload?.[bucketKey];
    if (!bucket || typeof bucket !== 'object') return;

    Object.entries(bucket).forEach(([segmentKey, segmentValue]) => {
      if (!segmentValue || typeof segmentValue !== 'object') return;
      if (!timestamp && segmentValue.timestamp) timestamp = segmentValue.timestamp;

      const items = Array.isArray(segmentValue.data) ? segmentValue.data : [];
      items.forEach((rawItem) => {
        const normalizedItem = mapPriceBandHitterRecord(rawItem);
        if (!normalizedItem.symbol) return;

        const existingRecord = mergedBySymbol.get(normalizedItem.symbol);
        const mergedRecord = mergePriceBandHitterRecord(
          existingRecord,
          normalizedItem,
          bucketKey,
          segmentKey
        );

        mergedBySymbol.set(normalizedItem.symbol, mergedRecord);
      });
    });
  });

  return {
    stocks: Array.from(mergedBySymbol.values()),
    summary: payload.count || null,
    timestamp,
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  FALLBACK DATA MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════
function saveFallbackData(key, data) {
  try {
    const fallbackData = { ...data, fallbackSavedAt: new Date().toISOString() };
    fallbackCache.set(key, fallbackData);
    console.log(`[NSE-Fallback] 💾 Saved fallback data for ${key}`);
  } catch (error) {
    console.error(`[NSE-Fallback] Failed to save fallback data for ${key}:`, error.message);
  }
}

function getFallbackData(key) {
  try {
    const data = fallbackCache.get(key);
    if (data) {
      console.log(`[NSE-Fallback] 📂 Retrieved fallback data for ${key} (saved: ${data.fallbackSavedAt})`);
      return { ...data, usingFallbackData: true };
    }
    return null;
  } catch (error) {
    console.error(`[NSE-Fallback] Failed to retrieve fallback data for ${key}:`, error.message);
    return null;
  }
}

// Normalize Research360 graph payload into { [co_code]: point[] }
function normalizeR360GraphData(payload) {
  const raw = payload?.right?.data || payload?.right || payload?.data || {};

  // Preferred shape: { "1189": [{time,value,co_code}, ...], ... }
  if (raw && !Array.isArray(raw) && typeof raw === 'object') {
    return raw;
  }

  // Fallback shape: [{ co_code, time, value }, ...]
  if (Array.isArray(raw)) {
    return raw.reduce((acc, point) => {
      const key = String(point?.co_code || '').trim();
      if (!key) return acc;
      if (!acc[key]) acc[key] = [];
      acc[key].push(point);
      return acc;
    }, {});
  }

  return {};
}

// Fetch graph data in chunks to avoid query-size limits for long co_code lists.
async function fetchR360GraphBatched(codes, headers, errorList, errorLabel) {
  const list = [...new Set((codes || []).map(c => String(c || '').trim()).filter(Boolean))];
  if (!list.length) return {};

  const chunkSize = 40;
  const merged = {};

  for (let i = 0; i < list.length; i += chunkSize) {
    const chunk = list.slice(i, i + chunkSize);
    try {
      const chartRes = await axios.get(
        `https://www.research360.in/api/market/movers/graph?coCodes=${chunk.join(',')}`,
        { timeout: 15000, headers }
      );

      const normalized = normalizeR360GraphData(chartRes.data);
      Object.keys(normalized).forEach((k) => {
        merged[k] = normalized[k];
      });
    } catch (chartErr) {
      errorList.push(`${errorLabel}: ${chartErr.message}`);
    }
  }

  return merged;
}

// ═══════════════════════════════════════════════════════════════════════
//  1. TOP 20 GAINERS / LOSERS
// ═══════════════════════════════════════════════════════════════════════
async function fetchGainersLosers() {
  const cached = cache.get('gainersLosers');
  if (cached) return cached;

  const result = { gainers: [], losers: [], fetchedAt: new Date().toISOString(), errors: [] };

  // Strategy 1: NSE NIFTY 500
  try {
    const data = await retryAsync(() => nseRequest('/api/equity-stockIndices?index=NIFTY%20500'));
    if (data?.data) {
      const stocks = data.data
        .filter(s => s.symbol !== 'NIFTY 500' && s.lastPrice)
        .map(s => ({
          symbol: s.symbol,
          companyName: s.meta?.companyName || s.symbol,
          lastPrice: s.lastPrice,
          change: parseFloat((s.change || 0).toFixed(2)),
          pChange: parseFloat((s.pChange || 0).toFixed(2)),
          previousClose: s.previousClose || 0,
          open: s.open || 0,
          dayHigh: s.dayHigh || 0,
          dayLow: s.dayLow || 0,
          volume: s.totalTradedVolume || 0,
        }));
      stocks.sort((a, b) => b.pChange - a.pChange);
      result.gainers = stocks.slice(0, 20);
      result.losers  = stocks.slice(-20).reverse();
    }
  } catch (err) {
    result.errors.push(`NSE: ${err.message}`);
  }

  // Save successful data as fallback
  if (result.gainers.length > 0) {
    saveFallbackData('gainersLosers', result);
  }

  // Strategy 2: Yahoo Finance fallback (via yahoo-finance2 library)
  if (result.gainers.length === 0) {
    try {
      // Fetch NIFTY 500 constituents via yahoo-finance2
      const nifty500Symbols = [
        'RELIANCE.NS','TCS.NS','HDFCBANK.NS','INFY.NS','ICICIBANK.NS','HINDUNILVR.NS',
        'BHARTIARTL.NS','SBIN.NS','BAJFINANCE.NS','ITC.NS','KOTAKBANK.NS','LT.NS',
        'HCLTECH.NS','AXISBANK.NS','ASIANPAINT.NS','MARUTI.NS','SUNPHARMA.NS',
        'TITAN.NS','ULTRACEMCO.NS','WIPRO.NS','NTPC.NS','POWERGRID.NS','ONGC.NS',
        'TATAMOTORS.NS','ADANIPORTS.NS','TATASTEEL.NS','JSWSTEEL.NS','COALINDIA.NS',
        'BAJAJFINSV.NS','TECHM.NS','DRREDDY.NS','NESTLEIND.NS','DIVISLAB.NS',
        'INDUSINDBK.NS','GRASIM.NS','CIPLA.NS','HEROMOTOCO.NS','EICHERMOT.NS',
        'BPCL.NS','APOLLOHOSP.NS','TATACONSUM.NS','BRITANNIA.NS','M&M.NS',
        'HINDALCO.NS','SBILIFE.NS','HDFCLIFE.NS','ADANIENT.NS','BAJAJ-AUTO.NS',
      ];
      const settled = await Promise.allSettled(
        nifty500Symbols.map(sym => yahooFinance.quote(sym, {}, { validateResult: false }))
      );
      const quotes = settled
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => r.value);
      const mapYahoo = q => ({
        symbol: (q.symbol || '').replace('.NS', ''),
        companyName: q.longName || q.shortName || q.symbol,
        lastPrice: q.regularMarketPrice || 0,
        change: parseFloat((q.regularMarketChange || 0).toFixed(2)),
        pChange: parseFloat((q.regularMarketChangePercent || 0).toFixed(2)),
        previousClose: q.regularMarketPreviousClose || 0,
        open: q.regularMarketOpen || 0,
        dayHigh: q.regularMarketDayHigh || 0,
        dayLow: q.regularMarketDayLow || 0,
        volume: q.regularMarketVolume || 0,
        source: 'yahoo',
      });
      const sorted = quotes.filter(q => q.regularMarketChangePercent != null).map(mapYahoo);
      sorted.sort((a, b) => b.pChange - a.pChange);
      result.gainers = sorted.slice(0, 20);
      result.losers = sorted.slice(-20).reverse();
    } catch (err) {
      result.errors.push(`Yahoo: ${err.message}`);
    }
  }

  // Strategy 3: Use fallback data if all else fails
  if (result.gainers.length === 0 && result.losers.length === 0) {
    const fallbackData = getFallbackData('gainersLosers');
    if (fallbackData) {
      result.gainers = fallbackData.gainers || [];
      result.losers = fallbackData.losers || [];
      result.usingFallbackData = true;
      result.errors.push('Using cached data - live data unavailable');
    }
  }

  cache.set('gainersLosers', result);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════
//  2. INDEX PERFORMANCE
// ═══════════════════════════════════════════════════════════════════════
async function fetchIndexPerformance() {
  const cached = cache.get('indexPerformance');
  if (cached) return cached;

  const result = { indices: [], fetchedAt: new Date().toISOString(), errors: [] };

  // Strategy 1: NSE all-indices
  try {
    const data = await retryAsync(() => nseRequest('/api/allIndices'));
    if (data?.data) {
      result.indices = data.data
        .filter(i => i.indexSymbol && i.last)
        .map(i => ({
          name: i.indexSymbol,
          last: i.last,
          change: parseFloat((i.variation || 0).toFixed(2)),
          pChange: parseFloat((i.percentChange || 0).toFixed(2)),
          open: i.open || 0,
          high: i.high || 0,
          low: i.low || 0,
          previousClose: i.previousClose || 0,
          advances: i.advances || 0,
          declines: i.declines || 0,
        }));
    }
  } catch (err) {
    result.errors.push(`NSE: ${err.message}`);
  }

  // Save successful data as fallback
  if (result.indices.length > 0) {
    saveFallbackData('indexPerformance', result);
  }

  // Strategy 2: Yahoo Finance fallback for key Indian indices (via yahoo-finance2)
  if (result.indices.length === 0) {
    try {
      const symbols = ['^NSEI', '^NSEBANK', '^CNXIT', '^CNXPHARMA', '^CNXAUTO', '^CNXFIN', '^CNXMETAL', '^CNXREALTY', '^CNXENERGY', '^CNXINFRA'];
      const settled = await Promise.allSettled(
        symbols.map(sym => yahooFinance.quote(sym, {}, { validateResult: false }))
      );
      const quotes = settled
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => r.value);
      result.indices = quotes.map(q => ({
        name: q.shortName || q.symbol,
        last: q.regularMarketPrice || 0,
        change: parseFloat((q.regularMarketChange || 0).toFixed(2)),
        pChange: parseFloat((q.regularMarketChangePercent || 0).toFixed(2)),
        open: q.regularMarketOpen || 0,
        high: q.regularMarketDayHigh || 0,
        low: q.regularMarketDayLow || 0,
        previousClose: q.regularMarketPreviousClose || 0,
        source: 'yahoo',
      }));
    } catch (err) {
      result.errors.push(`Yahoo: ${err.message}`);
    }
  }

  // Strategy 3: Use fallback data if all else fails
  if (result.indices.length === 0) {
    const fallbackData = getFallbackData('indexPerformance');
    if (fallbackData) {
      result.indices = fallbackData.indices || [];
      result.usingFallbackData = true;
      result.errors.push('Using cached data - live data unavailable');
    }
  }

  cache.set('indexPerformance', result);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════
//  3. 52-WEEK HIGH / LOW
// ═══════════════════════════════════════════════════════════════════════
async function fetch52WeekHighLow() {
  const cached = cache.get('52weekHL');
  if (cached) return cached;

  const result = { high: [], low: [], fetchedAt: new Date().toISOString(), errors: [] };

  // Strategy 1: Research360 movers API
  try {
    const headers = { 'User-Agent': randomUA(), 'Accept': 'application/json' };
    const [hiRes, loRes] = await Promise.all([
      axios.get('https://www.research360.in/api/market/movers?type=52WeeksHigh', { timeout: 12000, headers }),
      axios.get('https://www.research360.in/api/market/movers?type=52Weekslow', { timeout: 12000, headers }),
    ]);

    // Support both new format { right: { data: [...] } } and old format { data: [...] }
    const rawHigh = hiRes.data?.right?.data || hiRes.data?.data || [];
    const rawLow  = loRes.data?.right?.data || loRes.data?.data || [];

    // Collect all co_codes for chart fetch
    const allCodes = [...rawHigh, ...rawLow]
      .map(s => s.co_code).filter(Boolean);
    const chartData = await fetchR360GraphBatched(allCodes, headers, result.errors, 'R360 52W chart');

    const mapR360 = s => {
      const ltp       = parseFloat(s.ltp) || 0;
      const prevClose = parseFloat(s.prev_close) || 0;
      return {
        co_code:     s.co_code,
        symbol:      s.symbol || s.compname || s.sc_code,
        companyName: s.lname  || s.coname   || s.symbol,
        lastPrice:   ltp,
        change:      prevClose ? parseFloat((ltp - prevClose).toFixed(2)) : (parseFloat(s.price_change) || 0),
        pChange:     parseFloat(s.per_change)      || parseFloat(s.price_change_per) || 0,
        high52:      parseFloat(s._52wk_high)      || parseFloat(s.fiftytwo_wk_high) || 0,
        low52:       parseFloat(s._52wk_low)       || parseFloat(s.fiftytwo_wk_low)  || 0,
        prevHigh52:  parseFloat(s.prev_52Wk_High)  || 0,
        prevLow52:   parseFloat(s.prev_52Wk_Low)   || 0,
        todayHigh:   parseFloat(s.high)            || 0,
        todayLow:    parseFloat(s.low)             || 0,
        prevClose,
        mcap:        parseFloat(s.mcap)            || 0,
        sector:      s.sector_name                 || '',
        volume:      parseFloat(s.volume || s.traded_volume) || 0,
        intradayChart: (chartData[s.co_code] || chartData[String(s.co_code)] || []).map(p => parseFloat(p.value || p.price || p.ltp || p.close || p.c) || 0),
      };
    };

    if (rawHigh.length > 0) result.high = rawHigh.map(mapR360).slice(0, 50);
    if (rawLow.length > 0)  result.low  = rawLow.map(mapR360).slice(0, 50);

    if (result.high.length > 0 || result.low.length > 0) {
      console.log(`[52-Week] ✅ R360 API: ${result.high.length} highs, ${result.low.length} lows`);
    }
  } catch (err) {
    result.errors.push(`R360 52-week: ${err.message}`);
    console.log(`[52-Week] ❌ R360 API failed: ${err.message}`);
  }

  // Strategy 2: NSE dedicated 52-week endpoints (fallback)
  if (result.high.length === 0 && result.low.length === 0) {
    try {
      const [hiData, loData] = await Promise.all([
        retryAsync(() => nseRequest('/api/live-analysis-52Week-high')),
        retryAsync(() => nseRequest('/api/live-analysis-52Week-low')),
      ]);
      const mapNSE = s => ({
        symbol: s.symbol,
        companyName: s.meta?.companyName || s.symbol,
        lastPrice: s.lastPrice || s.ltp || 0,
        change: parseFloat((s.change || s.netPrice || 0).toFixed(2)),
        pChange: parseFloat((s.pChange || s.perChange || 0).toFixed(2)),
        high52: s.high52 || s.yearHigh || s.ntP || 0,
        low52: s.low52 || s.yearLow || 0,
        volume: s.totalTradedVolume || s.qty || 0,
        intradayChart: [],
      });
      if (hiData?.dataHigh || hiData?.data) result.high = (hiData.dataHigh || hiData.data).map(mapNSE).slice(0, 30);
      if (loData?.dataLow  || loData?.data)  result.low  = (loData.dataLow  || loData.data).map(mapNSE).slice(0, 30);
      if (result.high.length > 0 || result.low.length > 0) {
        console.log(`[52-Week] ✅ NSE fallback: ${result.high.length} highs, ${result.low.length} lows`);
      }
    } catch (err) {
      result.errors.push(`NSE 52-week: ${err.message}`);
      console.log(`[52-Week] ❌ NSE fallback failed: ${err.message}`);
    }
  }

  // Strategy 3: 24h fallback cache
  if (result.high.length === 0 && result.low.length === 0) {
    const fallbackData = getFallbackData('week52HighLow');
    if (fallbackData) {
      result.high = fallbackData.high || [];
      result.low  = fallbackData.low  || [];
      result.usingFallbackData = true;
      result.marketStatus = 'Cached';
      result.errors.push('Using cached data - live data unavailable');
      console.log(`[52-Week] 📂 Using fallback: ${result.high.length} highs, ${result.low.length} lows`);
    } else {
      console.log('[52-Week] ❌ No fallback data available');
    }
  } else {
    saveFallbackData('week52HighLow', result);
    result.marketStatus = 'Live';
  }

  cache.set('52weekHL', result);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════
//  3.5. PENNY STOCKS
// ═══════════════════════════════════════════════════════════════════════
async function fetchPennyStocks() {
  const cached = cache.get('pennyStocks');
  if (cached) return cached;

  const result = { stocks: [], fetchedAt: new Date().toISOString(), errors: [] };

  try {
    const headers = {
      'User-Agent': randomUA(),
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    const pennyRes = await axios.post(
      'https://www.research360.in/api/market/movers/penny-stocks',
      { flag: 'LP', pagenumber: '', pagesize: '2000' },
      { timeout: 12000, headers }
    );

    const rawStocks = pennyRes.data?.right?.data || pennyRes.data?.data || [];
    const selected = rawStocks.slice(0, 100);

    const chartData = await fetchR360GraphBatched(
      selected.map(s => s.co_code),
      headers,
      result.errors,
      'R360 Penny chart'
    );

    result.stocks = selected.map(s => ({
      co_code: s.co_code,
      symbol: s.symbol || s.sc_code,
      companyName: s.lname || s.coname || s.symbol,
      lastPrice: parseFloat(s.ltp) || 0,
      change: parseFloat(s.day_change) || 0,
      pChange: parseFloat(s.changeper) || 0,
      volume: parseFloat(s.volume || s.value) || 0,
      mcap: parseFloat(s.mcap) || 0,
      todayHigh: parseFloat(s.highprice) || 0,
      todayLow: parseFloat(s.lowprice) || 0,
      intradayChart: (chartData[s.co_code] || chartData[String(s.co_code)] || []).map(p => parseFloat(p.value || p.price || p.ltp || p.close || p.c) || 0),
    })).sort((a, b) => b.pChange - a.pChange);

    if (result.stocks.length > 0) {
      saveFallbackData('pennyStocks', result);
      result.marketStatus = 'Live';
    }
  } catch (err) {
    result.errors.push(`R360 Penny stocks: ${err.message}`);
    const fallbackData = getFallbackData('pennyStocks');
    if (fallbackData) {
      result.stocks = fallbackData.stocks || [];
      result.usingFallbackData = true;
      result.marketStatus = 'Cached';
      result.errors.push('Using cached data - live data unavailable');
    }
  }

  cache.set('pennyStocks', result);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════
//  4. FII / DII / RETAIL ACTIVITY
// ═══════════════════════════════════════════════════════════════════════

// Download and parse FII/DII CSV data directly from NSE
async function downloadFIIDIICSV() {
  // Try recent historical dates that should have CSV files available
  // NSE publishes these files for actual trading days
  const tryDates = [];
  
  // Start from current date and work backwards
  const startDate = new Date(); // Use current date to find recent data
  
  for (let i = 0; i < 30; i++) {
    const tryDate = new Date(startDate);
    tryDate.setDate(startDate.getDate() - i);
    
    // Skip weekends (Saturday = 6, Sunday = 0)
    if (tryDate.getDay() !== 0 && tryDate.getDay() !== 6) {
      const dd = String(tryDate.getDate()).padStart(2, '0');
      const mm = String(tryDate.getMonth() + 1).padStart(2, '0'); 
      const yyyy = tryDate.getFullYear();
      tryDates.push({
        dateStr: `${dd}${mm}${yyyy}`,
        date: tryDate.toISOString().split('T')[0],
        label: `${dd}/${mm}/${yyyy}`
      });
    }
  }

  let lastError = null;
  
  for (const dateInfo of tryDates) {
    try {
      const csvUrl = `https://www.nseindia.com/content/nsccl/fao_participant_oi_${dateInfo.dateStr}.csv`;
      
      // Get session first (like other NSE requests)
      const sessionCookies = await getSession();
    
      const response = await axios.get(csvUrl, {
        responseType: 'arraybuffer',
        timeout: 15000,
        headers: {
          'User-Agent': randomUA(),
          'Accept': 'text/csv, application/csv, text/plain, */*',
          'Referer': 'https://www.nseindia.com/',
          'Cookie': sessionCookies,
          'Accept-Language': 'en-US,en;q=0.9',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
        },
      });

      // Save CSV file temporarily
      const csvPath = path.join(__dirname, '../temp/fii_dii.csv');
      fs.writeFileSync(csvPath, response.data);
    
      // Read and parse CSV
      const csvContent = fs.readFileSync(csvPath, 'utf8');
      const lines = csvContent.split('\n').filter(line => line.trim());
      
      const result = { fii: null, dii: null, csvData: [], errors: [], dataDate: dateInfo.date };
    
      // Parse CSV content based on the expected FII/DII format
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const columns = line.split(',').map(col => col.replace(/"/g, '').trim());
        
        // Look for FII/DII data patterns
        if (columns.length >= 3) {
          const identifier = columns[0] ? columns[0].toLowerCase() : '';
          
          // Parse numeric values
          const buyValue = Math.abs(parseFloat(columns[1]) || 0);
          const sellValue = Math.abs(parseFloat(columns[2]) || 0);
          const netValue = buyValue - sellValue;
          
          // Check for FII/FPI indicators
          if (identifier.includes('fii') || identifier.includes('fpi') || 
              identifier.includes('foreign')) {
            result.fii = {
              category: 'FII/FPI',
              buyValue: buyValue,
              sellValue: sellValue,
              netValue: netValue,
              date: dateInfo.date,
              source: 'NSE CSV Direct'
            };
          }
          
          // Check for DII indicators  
          if (identifier.includes('dii') || identifier.includes('domestic')) {
            result.dii = {
              category: 'DII',
              buyValue: buyValue,
              sellValue: sellValue,
              netValue: netValue,
              date: dateInfo.date,
              source: 'NSE CSV Direct'
            };
          }
          
          // Store all data for debugging
          result.csvData.push({
            identifier: columns[0],
            buyValue,
            sellValue,
            netValue
          });
        }
      }
      
      // Clean up temp file
      if (fs.existsSync(csvPath)) {
        fs.unlinkSync(csvPath);
      }
      
      return result;
      
    } catch (error) {
      lastError = error;
      console.log(`[NSE-CSV] ❌ Failed for ${dateInfo.label}: ${error.message}`);
      continue; // Try next date
    }
  }
  
  // If all dates failed, throw the last error
  console.error(`[NSE-CSV] ❌ All CSV download attempts failed`);
  throw new Error(`NSE CSV download failed for all attempted dates. Last error: ${lastError?.message}`);

}

async function fetchFIIDIIData() {
  const cached = cache.get('fiiDii');
  if (cached) return cached; // Re-enable caching now that data works

  const result = { fii: null, dii: null, history: [], newsItems: [], fetchedAt: new Date().toISOString(), errors: [] };


  // Strategy 0: Try NSE CSV download first (most reliable)
  try {
    const csvResult = await downloadFIIDIICSV();
    if (csvResult.fii || csvResult.dii) {
      result.fii = csvResult.fii;
      result.dii = csvResult.dii;
      result.csvData = csvResult.csvData;
      cache.set('fiiDii', result);
      return result;
    }
  } catch (error) {
    result.errors.push(`CSV Strategy: ${error.message}`);
    console.log(`[FII/DII] ⚠️ CSV strategy failed, falling back to API endpoints`);
  }

  // Strategy 1: Try multiple NSE FII/DII endpoint variants
  const fiiEndpoints = ['/api/fiidiiActivity', '/api/fiidii-activity', '/api/fiidiiTradeReact'];
  for (const ep of fiiEndpoints) {
    if (result.fii && result.dii) break;
    try {
      const data = await retryAsync(() => nseRequest(ep));
      
      if (data) {
        const parse = (arr, cat) => {
          const row = Array.isArray(arr) ? arr.find(r => r.category === cat) : null;
          if (!row) return null;
          return {
            category: cat,
            buyValue: parseFloat(row.buyValue || row.grossPurchase || 0),
            sellValue: parseFloat(row.sellValue || row.grossSales || 0),
            netValue: parseFloat(row.netValue || row.net || 0),
            date: row.date || new Date().toISOString().split('T')[0],
          };
        };
        result.fii = parse(data, 'FII/FPI') || parse(data, 'FII');
        result.dii = parse(data, 'DII');

        // New-format object  
        if (!result.fii && data.fpiNetValue !== undefined) {
          result.fii = { category: 'FII/FPI', buyValue: data.fpiBuyValue || 0, sellValue: data.fpiSellValue || 0, netValue: data.fpiNetValue || 0, date: data.date || '' };
        }
        if (!result.dii && data.diiNetValue !== undefined) {
          result.dii = { category: 'DII', buyValue: data.diiBuyValue || 0, sellValue: data.diiSellValue || 0, netValue: data.diiNetValue || 0, date: data.date || '' };
        }
        
        // Try array format parsing
        if (!result.fii && Array.isArray(data)) {
          const fiiRow = data.find(row => 
            (row.category || '').toLowerCase().includes('fii') || 
            (row.category || '').toLowerCase().includes('fpi')
          );
          if (fiiRow) {
            result.fii = {
              category: 'FII/FPI',
              buyValue: parseFloat(fiiRow.buyValue || fiiRow.grossPurchase || 0),
              sellValue: parseFloat(fiiRow.sellValue || fiiRow.grossSales || 0),
              netValue: parseFloat(fiiRow.netValue || fiiRow.net || 0),
              date: fiiRow.date || new Date().toISOString().split('T')[0],
            };
          }
        }
        
        if (!result.dii && Array.isArray(data)) {
          const diiRow = data.find(row => (row.category || '').toLowerCase().includes('dii'));
          if (diiRow) {
            result.dii = {
              category: 'DII',
              buyValue: parseFloat(diiRow.buyValue || diiRow.grossPurchase || 0),
              sellValue: parseFloat(diiRow.sellValue || diiRow.grossSales || 0),
              netValue: parseFloat(diiRow.netValue || diiRow.net || 0),
              date: diiRow.date || new Date().toISOString().split('T')[0],
            };
          }
        }
        
        console.log(`[FII/DII] Parsed from ${ep}:`, {fii: result.fii?.netValue, dii: result.dii?.netValue});
      }
    } catch (err) {
      console.log(`[FII/DII] Error with ${ep}:`, err.message);
      // silently continue to next endpoint
    }
  }

  // Strategy 2: NSE fiidiiTradeReact endpoint
  if (!result.fii && !result.dii) {
    try {
      const data = await retryAsync(() => nseRequest('/api/fiidiiTradeReact'));
      if (data) {
        const findRow = (arr, cat) => {
          if (!Array.isArray(arr)) return null;
          return arr.find(r =>
            (r.category || '').toLowerCase().includes(cat.toLowerCase())
          );
        };
        const fiRow = findRow(data, 'FII') || findRow(data, 'FPI');
        const diRow = findRow(data, 'DII');
        if (fiRow) {
          result.fii = {
            category: 'FII/FPI',
            buyValue: parseFloat(fiRow.buyValue || fiRow.grossPurchase || 0),
            sellValue: parseFloat(fiRow.sellValue || fiRow.grossSales || 0),
            netValue: parseFloat(fiRow.netValue || fiRow.net || 0),
            date: fiRow.date || new Date().toISOString().split('T')[0],
          };
        }
        if (diRow) {
          result.dii = {
            category: 'DII',
            buyValue: parseFloat(diRow.buyValue || diRow.grossPurchase || 0),
            sellValue: parseFloat(diRow.sellValue || diRow.grossSales || 0),
            netValue: parseFloat(diRow.netValue || diRow.net || 0),
            date: diRow.date || new Date().toISOString().split('T')[0],
          };
        }
      }
    } catch (err) {
      // silently continue
    }
  }

  // Strategy 3: Google News RSS — parse actual FII/DII values from headlines
  if (!result.fii && !result.dii) {
    try {
      const rssUrl = 'https://news.google.com/rss/search?q=FII+DII+net+buy+sell+crore+when:2d&hl=en-IN&gl=IN&ceid=IN:en';
      const res = await axios.get(rssUrl, { timeout: 10000 });
      const items = [];
      const itemRe = /<item>([\s\S]*?)<\/item>/g;
      let m;
      while ((m = itemRe.exec(res.data)) !== null) {
        const title = extractTag(m[1], 'title');
        const pubDate = extractTag(m[1], 'pubDate');
        const link = extractTag(m[1], 'link');
        if (title) {
          const cleanTitle = title.replace(/<[^>]*>/g, '');
          if (/fii|dii|fpi/i.test(cleanTitle)) {
            items.push({ title: cleanTitle, date: pubDate || '', url: link || '' });
          }
        }
      }

      // Try to extract actual FII/DII values from headlines
      const clean = v => parseFloat((v || '0').replace(/,/g, '')) || 0;
      for (const item of items) {
        if (result.fii && result.dii) break;
        const t = item.title;

        // Match patterns like: "FIIs net sell ... Rs 6,346 crore" or "FII sell Rs 2,345 crore"
        const fiiSellMatch = t.match(/(?:FII|FPI)s?\s+(?:net\s+)?sell[\s\S]*?(?:Rs\.?\s*|₹)\s*([\d,]+)/i)
                          || t.match(/(?:FII|FPI)s?\s+(?:turn\s+)?(?:net\s+)?(?:seller|outflow|pull)[\s\S]*?(?:Rs\.?\s*|₹)\s*([\d,]+)/i)
                          || t.match(/[Ff]oreign\s+investors?\s+(?:pull\s*out|sell|withdraw)[\s\S]*?(?:Rs\.?\s*|₹)\s*([\d,]+)/i);
        const fiiBuyMatch  = t.match(/(?:FII|FPI)s?\s+(?:net\s+)?buy[\s\S]*?(?:Rs\.?\s*|₹)\s*([\d,]+)/i)
                          || t.match(/(?:FII|FPI)s?\s+(?:turn\s+)?(?:net\s+)?(?:buyer|inflow|pump)[\s\S]*?(?:Rs\.?\s*|₹)\s*([\d,]+)/i)
                          || t.match(/[Ff]oreign\s+investors?\s+(?:buy|pump|invest)[\s\S]*?(?:Rs\.?\s*|₹)\s*([\d,]+)/i);
        const diiSellMatch = t.match(/DII[s]?\s+(?:net\s+)?sell[\s\S]*?(?:Rs\.?\s*|₹)\s*([\d,]+)/i);
        const diiBuyMatch  = t.match(/DII[s]?\s+(?:net\s+)?buy[\s\S]*?(?:Rs\.?\s*|₹)\s*([\d,]+)/i)
                          || t.match(/DII[s]?\s+(?:pump\s*in|invest)[\s\S]*?(?:Rs\.?\s*|₹)\s*([\d,]+)/i);

        if (!result.fii && (fiiSellMatch || fiiBuyMatch)) {
          const netVal = fiiBuyMatch ? clean(fiiBuyMatch[1]) : -clean(fiiSellMatch[1]);
          result.fii = {
            category: 'FII/FPI',
            netValue: netVal,
            buyValue: fiiBuyMatch ? clean(fiiBuyMatch[1]) : 0,
            sellValue: fiiSellMatch ? clean(fiiSellMatch[1]) : 0,
            date: item.date,
            source: 'news',
          };
        }
        if (!result.dii && (diiSellMatch || diiBuyMatch)) {
          const netVal = diiBuyMatch ? clean(diiBuyMatch[1]) : -clean(diiSellMatch[1]);
          result.dii = {
            category: 'DII',
            netValue: netVal,
            buyValue: diiBuyMatch ? clean(diiBuyMatch[1]) : 0,
            sellValue: diiSellMatch ? clean(diiSellMatch[1]) : 0,
            date: item.date,
            source: 'news',
          };
        }
      }

      // Keep news items regardless
      result.newsItems = items.slice(0, 5);
      if (result.fii || result.dii) {
        result.errors.push('FII/DII values parsed from news headlines');
      } else if (items.length > 0) {
        result.errors.push('Live FII/DII data unavailable – showing recent news instead');
      }
    } catch (err) {
      result.errors.push(`News fallback: ${err.message}`);
    }
  }

  // Use fallback data if no live data available
  if (!result.fii && !result.dii) {
    const fallbackData = getFallbackData('fiiDiiData');
    if (fallbackData) {
      result.fii = fallbackData.fii;
      result.dii = fallbackData.dii;
      result.usingFallbackData = true;
      result.errors.push('Using cached data - live data unavailable');
    }
  } else {
    // Save successful data as fallback
    saveFallbackData('fiiDiiData', result);
  }

  cache.set('fiiDii', result);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════
//  4.5. FII/DII HISTORICAL DATA (Last 30 Days)
// ═══════════════════════════════════════════════════════════════════════
async function fetchFIIDIIHistoricalData(days = 30) {
  const cacheKey = `fiiDiiHistorical_${days}d`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  console.log(`[NSE] Fetching ${days} days of FII/DII historical data...`);
  
  const result = {
    dailyFlows: [],
    dataSource: 'Multiple Free APIs',
    fetchedAt: new Date().toISOString(),
    errors: []
  };

  // Strategy 1: BSE Historical API (Clean JSON format) - TEMPORARY FIRST
  try {
    const bseData = await fetchBSEHistoricalFIIDII(days);
    if (bseData && bseData.length > 0 && validateDataVariance(bseData)) {
      result.dailyFlows = bseData;
      console.log(`[NSE] ✅ Fetched ${bseData.length} days from BSE`);
    }
  } catch (error) {
    result.errors.push(`BSE: ${error.message}`);
    console.log(`[NSE] ❌ BSE failed: ${error.message}`);
  }

  // Strategy 2: MoneyControl FII/DII Historical Data (Free)
  if (result.dailyFlows.length === 0) {
    try {
      const historicalData = await fetchMoneyControlFIIDII(days);
      if (historicalData && historicalData.length > 0 && validateDataVariance(historicalData)) {
        result.dailyFlows = historicalData;
        console.log(`[NSE] ✅ Fetched ${historicalData.length} days from MoneyControl`);
      } else if (historicalData && historicalData.length > 0) {
        console.log(`[NSE] ⚠️  MoneyControl data rejected: too many identical values`);
        result.errors.push('MoneyControl: rejected due to identical values');
      }
    } catch (error) {
      result.errors.push(`MoneyControl: ${error.message}`);
      console.log(`[NSE] ❌ MoneyControl failed: ${error.message}`);
    }
  }

  // Strategy 3: Economic Times Data (Web Scraping Fallback)
  if (result.dailyFlows.length === 0) {
    try {
      const etData = await fetchEconomicTimesFIIDII(days);
      if (etData && etData.length > 0 && validateDataVariance(etData)) {
        result.dailyFlows = etData;
        console.log(`[NSE] ✅ Fetched ${etData.length} days from Economic Times`);
      }
    } catch (error) {
      result.errors.push(`Economic Times: ${error.message}`);
      console.log(`[NSE] ❌ Economic Times failed: ${error.message}`);
    }
  }

  // Strategy 4: NSE Historical Archive (Last Resort)
  if (result.dailyFlows.length === 0) {
    try {
      const nseHistorical = await fetchNSEHistoricalFIIDII(days);
      if (nseHistorical && nseHistorical.length > 0 && validateDataVariance(nseHistorical)) {
        result.dailyFlows = nseHistorical;
        console.log(`[NSE] ✅ Fetched ${nseHistorical.length} days from NSE Archive`);
      } else if (nseHistorical && nseHistorical.length > 0) {
        console.log(`[NSE] ⚠️  NSE data rejected: too many identical values`);
        result.errors.push('NSE Historical: rejected due to identical values');
      }
    } catch (error) {
      result.errors.push(`NSE Historical: ${error.message}`);
      console.log(`[NSE] ❌ NSE Historical failed: ${error.message}`);
    }
  }

  // Ensure data is sorted by date (newest first for chart display)
  if (result.dailyFlows.length > 0) {
    result.dailyFlows.sort((a, b) => new Date(b.date) - new Date(a.date));
    result.totalDays = result.dailyFlows.length;
    console.log(`[NSE] 📊 Historical data ready: ${result.totalDays} trading days`);
  } else {
    console.log(`[NSE] ⚠️  No historical FII/DII data available from any source`);
    result.errors.push('No historical data available from any source');
  }

  // Cache for 4 hours (historical data doesn't change frequently)
  cache.set(cacheKey, result, 4 * 60 * 60 * 1000);
  return result;
}

// Helper function: Fetch FII/DII data from MoneyControl
async function fetchMoneyControlFIIDII(days) {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - (days + 10) * 24 * 60 * 60 * 1000); // Extra days for weekends
  
  // MoneyControl FII/DII API endpoint (publicly accessible)
  const baseUrl = 'https://www.moneycontrol.com/stocks/marketstats/fii_dii_activity/homepage';
  const response = await axios.get(baseUrl, {
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });

  const data = [];
  const html = response.data;
  
  // Parse MoneyControl's FII/DII table data
  const tableRegex = /<table[^>]*class="[^"]*tblres[^"]*"[^>]*>(.*?)<\/table>/gis;
  const tableMatch = tableRegex.exec(html);
  
  if (tableMatch) {
    const rowRegex = /<tr[^>]*>(.*?)<\/tr>/gis;
    const rows = [...tableMatch[1].matchAll(rowRegex)];
    
    for (let i = 1; i < rows.length && data.length < days; i++) { // Skip header row
      const row = rows[i][1];
      const cellRegex = /<t[dh][^>]*>(.*?)<\/t[dh]>/gis;
      const cells = [...row.matchAll(cellRegex)].map(match => 
        match[1].replace(/<[^>]*>/g, '').trim()
      );
      
      if (cells.length >= 4) {
        const dateStr = cells[0];
        const fiiValue = parseFloat(cells[1]?.replace(/[₹,\s]/g, '') || '0');
        const diiValue = parseFloat(cells[2]?.replace(/[₹,\s]/g, '') || '0');
        
        if (dateStr && !isNaN(fiiValue) && !isNaN(diiValue)) {
          const date = parseDateString(dateStr);
          if (date && date >= startDate && date <= endDate) {
            data.push({
              date: date.toISOString().split('T')[0],
              dateLabel: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
              fii: Math.round(fiiValue * 100) / 100,
              dii: Math.round(diiValue * 100) / 100,
              netFlow: Math.round((fiiValue + diiValue) * 100) / 100,
              source: 'MoneyControl'
            });
          }
        }
      }
    }
  }
  
  return data;
}

// Helper function: Fetch from NSE Historical Archive
async function fetchNSEHistoricalFIIDII(days) {
  const data = [];
  const endDate = new Date();
  
  // Get NSE session cookies
  let sessionCookies;
  try {
    sessionCookies = await getSession();
  } catch (error) {
    console.log('[NSE] ❌ Failed to get session for historical data');
    throw new Error('Failed to get NSE session');
  }
  
  let identicalDataCount = 0;
  let lastFiiValue = null;
  
  // Try NSE's historical data endpoints with proper authentication
  for (let i = 0; i < Math.min(days + 10, 15); i++) { // Limit attempts to avoid too many identical responses
    const date = new Date(endDate.getTime() - i * 24 * 60 * 60 * 1000);
    if (date.getDay() === 0 || date.getDay() === 6) continue; // Skip weekends
    
    const dateStr = date.toISOString().split('T')[0];
    
    try {
      await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
      
      const response = await axios.get('/api/fiidiiTradeReact', {
        baseURL: 'https://www.nseindia.com',
        timeout: 12000,
        headers: {
          'User-Agent': randomUA(),
          'Accept': 'application/json, text/plain, */*',
          'Referer': 'https://www.nseindia.com/',
          'Cookie': sessionCookies,
          'Accept-Language': 'en-US,en;q=0.9',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin'
        },
        params: {
          index: 'total',
          segmentCd: 'CM',
          fromDate: dateStr,
          toDate: dateStr
        }
      });
      
      if (response.data && Array.isArray(response.data)) {
        const fiiRow = response.data.find(row => 
          (row.category || '').toLowerCase().includes('fii') || 
          (row.category || '').toLowerCase().includes('fpi')
        );
        const diiRow = response.data.find(row => 
          (row.category || '').toLowerCase().includes('dii')
        );
        
        const fiiNet = parseFloat(fiiRow?.netValue || fiiRow?.net || 0);
        const diiNet = parseFloat(diiRow?.netValue || diiRow?.net || 0);
        
        // Check if we're getting identical data (but don't break - real data can be identical)
        if (lastFiiValue !== null && Math.abs(fiiNet - lastFiiValue) < 0.01) {
          identicalDataCount++;
          console.log(`[NSE-Historical] Note: FII data identical for ${identicalDataCount} days (this is normal with real NSE data)`);
        } else {
          lastFiiValue = fiiNet;
        }
        
        data.push({
          date: dateStr,
          dateLabel: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
          fii: Math.round(fiiNet * 100) / 100,
          dii: Math.round(diiNet * 100) / 100,
          netFlow: Math.round((fiiNet + diiNet) * 100) / 100,
          source: 'NSE Historical'
        });
      }
      
      if (data.length >= days) break;
    } catch (error) {
      console.log(`[NSE-Historical] Failed for ${dateStr}: ${error.message}`);
      continue;
    }
  }
  
  // Return only real data - no duplication of identical values
  if (data.length === 0) {
    console.log('[NSE-Historical] ❌ No valid historical data found');
    return [];
  }
  
  console.log(`[NSE-Historical] Generated ${data.length} days of varied historical data`);
  return data;
}

// Helper function: Fetch from Economic Times
async function fetchEconomicTimesFIIDII(days) {
  const url = 'https://economictimes.indiatimes.com/markets/stocks/fii-dii-data';
  const response = await axios.get(url, {
    timeout: 12000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }
  });
  
  const data = [];
  const html = response.data;
  
  // Parse Economic Times FII/DII data (simplified extraction)
  const dataRegex = /"fii_dii_data":\s*\[(.*?)\]/gis;
  const match = dataRegex.exec(html);
  
  if (match) {
    try {
      const jsonData = JSON.parse(`[${match[1]}]`);
      for (const item of jsonData.slice(0, days)) {
        if (item.date && (item.fii_net !== undefined || item.dii_net !== undefined)) {
          const date = new Date(item.date);
          data.push({
            date: date.toISOString().split('T')[0],
            dateLabel: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
            fii: Math.round((item.fii_net || 0) * 100) / 100,
            dii: Math.round((item.dii_net || 0) * 100) / 100,
            netFlow: Math.round(((item.fii_net || 0) + (item.dii_net || 0)) * 100) / 100,
            source: 'Economic Times'
          });
        }
      }
    } catch (parseError) {
      throw new Error('Failed to parse Economic Times data');
    }
  }
  
  return data;
}

// Helper function: Fetch from BSE
async function fetchBSEHistoricalFIIDII(days) {
  const url = 'https://api.bseindia.com/BseIndiaAPI/api/FIIDIIData/w';
  const response = await axios.get(url, {
    timeout: 10000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'application/json'
    }
  });
  
  const data = [];
  
  if (response.data && Array.isArray(response.data.Table)) {
    for (const item of response.data.Table.slice(0, days)) {
      if (item.Date) {
        const date = new Date(item.Date);
        data.push({
          date: date.toISOString().split('T')[0],
          dateLabel: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
          fii: Math.round((parseFloat(item.FII_Net || 0)) * 100) / 100,
          dii: Math.round((parseFloat(item.DII_Net || 0)) * 100) / 100,
          netFlow: Math.round((parseFloat(item.FII_Net || 0) + parseFloat(item.DII_Net || 0)) * 100) / 100,
          source: 'BSE'
        });
      }
    }
  }
  
  return data;
}

// Helper function: Parse date strings in various formats
function parseDateString(dateStr) {
  // Try different date formats commonly used in Indian websites
  const formats = [
    // DD-MM-YYYY, DD/MM/YYYY
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/,
    // DD-MMM-YYYY, DD/MMM/YYYY  
    /^(\d{1,2})[\/\-]([A-Za-z]{3})[\/\-](\d{4})$/,
    // YYYY-MM-DD
    /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/
  ];
  
  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      if (format === formats[0]) { // DD-MM-YYYY
        return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
      } else if (format === formats[1]) { // DD-MMM-YYYY
        const monthNames = {'jan':0,'feb':1,'mar':2,'apr':3,'may':4,'jun':5,'jul':6,'aug':7,'sep':8,'oct':9,'nov':10,'dec':11};
        const month = monthNames[match[2].toLowerCase()];
        if (month !== undefined) {
          return new Date(parseInt(match[3]), month, parseInt(match[1]));
        }
      } else if (format === formats[2]) { // YYYY-MM-DD
        return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
      }
    }
  }
  
  // Fallback to JavaScript's Date parsing
  const fallbackDate = new Date(dateStr);
  return isNaN(fallbackDate.getTime()) ? null : fallbackDate;
}

// ═══════════════════════════════════════════════════════════════════════
//  5. WORLD INDICES
// ═══════════════════════════════════════════════════════════════════════
async function fetchWorldIndices() {
  const cached = longCache.get('worldIndices');
  if (cached) return cached;

  const result = { indices: [], fetchedAt: new Date().toISOString(), errors: [] };

  const WORLD_SYMBOLS = [
    // USA
    '^GSPC','^DJI','^IXIC','^RUT','^VIX',

    // Europe
    '^FTSE','^GDAXI','^FCHI','^STOXX50E','^AEX','^IBEX','^SSMI',

    // Asia
    '^N225','^HSI','000001.SS','399001.SZ','^HSCE',

    // India
    '^BSESN','^NSEI','^NSEBANK',

    // Asia-Pacific
    '^STI','^AXJO','^KS11','^TWII','^NZ50','^JKSE','^KLSE','^PSEI',

    // Americas
    '^BVSP','^MXX','^IPSA',

    // Middle East & Africa
    '^JN0U.JO','^TASI.SR','^DFMGI'
  ];

  const mapYahooQuote = q => ({
    name: q.shortName || q.longName || q.symbol,
    symbol: q.symbol,
    last: q.regularMarketPrice || 0,
    change: parseFloat((q.regularMarketChange || 0).toFixed(2)),
    pChange: parseFloat((q.regularMarketChangePercent || 0).toFixed(2)),
    open: q.regularMarketOpen || 0,
    high: q.regularMarketDayHigh || 0,
    low: q.regularMarketDayLow || 0,
    previousClose: q.regularMarketPreviousClose || 0,
    marketState: q.marketState || '',
    exchange: q.exchange || '',
  });

  // Strategy 1: Yahoo Finance via yahoo-finance2 library (handles auth & rate limits)
  try {
    const CONCURRENCY = 5;
    for (let i = 0; i < WORLD_SYMBOLS.length; i += CONCURRENCY) {
      const batch = WORLD_SYMBOLS.slice(i, i + CONCURRENCY);
      const settled = await Promise.allSettled(
        batch.map(sym => yahooFinance.quote(sym, {}, { validateResult: false }))
      );
      for (const res of settled) {
        if (res.status === 'fulfilled' && res.value) {
          result.indices.push(mapYahooQuote(res.value));
        }
      }
      if (i + CONCURRENCY < WORLD_SYMBOLS.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }
  } catch (err) {
    result.errors.push(`Yahoo: ${err.message}`);
  }

  // Strategy 3: Google News fallback
  if (result.indices.length === 0) {
    try {
      const rssUrl = 'https://news.google.com/rss/search?q=world+stock+market+indices+today&hl=en-US&gl=US&ceid=US:en';
      const res = await axios.get(rssUrl, { timeout: 10000 });
      const items = [];
      const itemRe = /<item>([\s\S]*?)<\/item>/g;
      let m;
      while ((m = itemRe.exec(res.data)) !== null) {
        items.push({
          title: (extractTag(m[1], 'title') || '').replace(/<[^>]*>/g, ''),
          date: extractTag(m[1], 'pubDate') || '',
          source: (extractTag(m[1], 'source') || '').replace(/<[^>]*>/g, ''),
        });
      }
      result.newsItems = items.slice(0, 10);
      result.errors.push('Live index data unavailable – showing market news instead');
    } catch (err) {
      result.errors.push(`News fallback: ${err.message}`);
    }
  }

  longCache.set('worldIndices', result);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════
//  6. IPO DATA — InvestorGain API
// ═══════════════════════════════════════════════════════════════════════
async function fetchIPOData() {
  const cached = cache.get('ipo');
  if (cached) return cached;

  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const year = now.getFullYear();
  // India FY: April–March
  const fyStart = month >= 4 ? year : year - 1;
  const fyEnd = String(fyStart + 1).slice(-2);
  const fiscalYear = `${fyStart}-${fyEnd}`;

  const url = `https://webnodejs.investorgain.com/cloud/v2/report/data-read/331/1/${month}/${year}/${fiscalYear}/0/all`;

  try {
    const res = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: 'https://www.investorgain.com/',
        Origin: 'https://www.investorgain.com',
      },
    });

    const rows = res.data?.reportTableData || [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const ipoList = rows.map(row => {
      // Parse GMP amount from HTML like: &#8377;<b>15</b> (8.57%) or &#8377;<b>--</b> (0.00%)
      const gmpStripped = (row['GMP'] || '').replace(/&#[0-9]+;/g, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      const gmpAmountMatch = gmpStripped.match(/^([+-]?\d+\.?\d*)/);
      const gmpValue = gmpAmountMatch ? parseFloat(gmpAmountMatch[1]) : null;
      const gmpPercent = parseFloat(row['~gmp_percent_calc']);
      const ipoPrice = parseFloat(row['Price (₹)']) || null;
      const estimatedListing = (ipoPrice && gmpValue != null && !isNaN(gmpValue))
        ? parseFloat((ipoPrice + gmpValue).toFixed(2)) : null;

      // Derive status from sort dates
      const openDate = row['~Srt_Open'] ? new Date(row['~Srt_Open']) : null;
      const closeDate = row['~Srt_Close'] ? new Date(row['~Srt_Close']) : null;
      const listingDate = row['~Str_Listing'] ? new Date(row['~Str_Listing']) : null;
      let status;
      if (listingDate && listingDate <= today) status = 'Listed';
      else if (openDate && openDate > today) status = 'Upcoming';
      else if (closeDate && closeDate >= today) status = 'Open';
      else status = 'Closed';

      const ipoSize = (row['IPO Size'] || '').replace(/&#8377;/g, '₹').replace(/<[^>]*>/g, '').trim();

      return {
        name: row['~ipo_name'] || '',
        category: row['~IPO_Category'] || 'Main',
        price: row['Price (₹)'] || '—',
        ipoSize,
        lot: row['Lot'] || '—',
        pe: row['~P/E'] || '—',
        open: row['Open'] || '—',
        close: row['Close'] || '—',
        boaDate: row['BoA Dt'] || '—',
        listing: row['Listing'] || '—',
        openSort: row['~Srt_Open'] || '',
        closeSort: row['~Srt_Close'] || '',
        listingSort: row['~Str_Listing'] || '',
        gmp: (!isNaN(gmpValue) && gmpValue !== null) ? gmpValue : null,
        gmpPercent: !isNaN(gmpPercent) ? gmpPercent : null,
        estimatedListing,
        status,
        url: row['~urlrewrite_folder_name'] || '',
      };
    });

    const result = {
      ipoList,
      totalRecords: res.data?.totalRecords || ipoList.length,
      fiscalYear,
      fetchedAt: new Date().toISOString(),
    };

    cache.set('ipo', result);
    return result;
  } catch (err) {
    console.error('[IPO] InvestorGain fetch failed:', err.message);
    const fallback = cache.get('ipo');
    if (fallback) return { ...fallback, cached: true };
    return { ipoList: [], totalRecords: 0, fiscalYear, fetchedAt: new Date().toISOString(), errors: [err.message] };
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  7. CIRCUIT BREAKER DATA
// ═══════════════════════════════════════════════════════════════════════
async function fetchCircuitData() {
  const cached = cache.get('circuits');
  if (cached) return cached;

  const result = { upperCircuit: [], lowerCircuit: [], fetchedAt: new Date().toISOString(), marketStatus: 'Unknown', errors: [] };

  // Strategy 1: NSE NIFTY 500 endpoint
  try {
    const data = await retryAsync(() => nseRequest('/api/equity-stockIndices?index=NIFTY%20500'));
    if (data?.data) {
      data.data
        .filter(s => s.symbol !== 'NIFTY 500' && s.lastPrice)
        .forEach(s => {
          const stock = {
            symbol: s.symbol,
            companyName: s.meta?.companyName || s.symbol,
            lastPrice: s.lastPrice,
            change: parseFloat((s.change || 0).toFixed(2)),
            pChange: parseFloat((s.pChange || 0).toFixed(2)),
            previousClose: s.previousClose || 0,
            volume: s.totalTradedVolume || 0,
          };
          if (s.pChange >= 4.9) result.upperCircuit.push(stock);
          else if (s.pChange <= -4.9) result.lowerCircuit.push(stock);
        });
      result.upperCircuit.sort((a, b) => b.pChange - a.pChange);
      result.lowerCircuit.sort((a, b) => a.pChange - b.pChange);
      result.marketStatus = 'Live';
    }
  } catch (err) {
    result.errors.push(`NSE NIFTY500: ${err.message}`);
  }

  // Strategy 2: Alternative NSE endpoint for gainers/losers
  if (result.upperCircuit.length === 0 && result.lowerCircuit.length === 0) {
    try {
      const [gainersData, losersData] = await Promise.all([
        retryAsync(() => nseRequest('/api/live-analysis-gainers?index=allSec')),
        retryAsync(() => nseRequest('/api/live-analysis-losers?index=allSec'))
      ]);
      
      if (gainersData?.data) {
        gainersData.data.forEach(s => {
          if (s.pChange >= 4.9) {
            result.upperCircuit.push({
              symbol: s.symbol,
              companyName: s.meta?.companyName || s.symbol,
              lastPrice: s.lastPrice || s.ltp,
              change: parseFloat((s.change || 0).toFixed(2)),
              pChange: parseFloat((s.pChange || 0).toFixed(2)),
              previousClose: s.previousClose || 0,
              volume: s.totalTradedVolume || 0,
            });
          }
        });
      }
      
      if (losersData?.data) {
        losersData.data.forEach(s => {
          if (s.pChange <= -4.9) {
            result.lowerCircuit.push({
              symbol: s.symbol,
              companyName: s.meta?.companyName || s.symbol,
              lastPrice: s.lastPrice || s.ltp,
              change: parseFloat((s.change || 0).toFixed(2)),
              pChange: parseFloat((s.pChange || 0).toFixed(2)),
              previousClose: s.previousClose || 0,
              volume: s.totalTradedVolume || 0,
            });
          }
        });
      }
      
      result.upperCircuit.sort((a, b) => b.pChange - a.pChange);
      result.lowerCircuit.sort((a, b) => a.pChange - b.pChange);
      result.marketStatus = 'Live';
    } catch (err) {
      result.errors.push(`NSE Gainers/Losers: ${err.message}`);
    }
  }

  // Use fallback data if no live data available
  if (result.upperCircuit.length === 0 && result.lowerCircuit.length === 0) {
    const fallbackData = getFallbackData('circuitBreakers');
    if (fallbackData) {
      result.upperCircuit = fallbackData.upperCircuit || [];
      result.lowerCircuit = fallbackData.lowerCircuit || [];
      result.usingFallbackData = true;
      result.marketStatus = 'Cached';
      result.errors.push('Using cached data - live data unavailable');
    }
  } else {
    // Save successful data as fallback
    saveFallbackData('circuitBreakers', result);
  }

  cache.set('circuits', result);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════
//  8. NSE PRICE BAND HITTERS (PERSISTED TO MONGODB)
// ═══════════════════════════════════════════════════════════════════════
async function fetchAndStorePriceBandHitters() {
  const payload = await retryAsync(() => nseRequest('/api/live-analysis-price-band-hitter'));
  const extracted = extractPriceBandHitterRecords(payload);

  if (!Array.isArray(extracted.stocks)) {
    throw new Error('Unexpected NSE price band hitter response format');
  }

  const stocks = extracted.stocks.filter((item) => item.symbol);

  if (stocks.length === 0) {
    throw new Error('NSE price band hitter endpoint returned no stock records');
  }

  const fetchedAt = new Date();
  const documents = stocks.map((stock) => ({
    ...stock,
    nseTimestamp: extracted.timestamp || null,
    fetchedAt,
    source: 'NSE live-analysis-price-band-hitter',
  }));

  const deleteResult = await NSEPriceBandHitter.deleteMany({});
  const insertedDocs = await NSEPriceBandHitter.insertMany(documents, { ordered: false });

  const result = {
    stocks,
    count: stocks.length,
    fetchedAt: fetchedAt.toISOString(),
    storedInMongoDB: true,
    source: 'mongodb',
    summary: extracted.summary,
    nseTimestamp: extracted.timestamp,
    mongo: {
      deletedCount: deleteResult.deletedCount || 0,
      insertedCount: insertedDocs.length || 0,
    },
  };

  cache.set('priceBandHittersMongo', result);
  return result;
}

async function getPriceBandHittersFromMongo() {
  const cached = cache.get('priceBandHittersMongo');
  if (cached) {
    return { ...cached, cacheSource: 'memory' };
  }

  const stocks = await NSEPriceBandHitter.find()
    .sort({ percentChange: -1, symbol: 1 })
    .lean();

  const latestFetchedAt = stocks.reduce((latest, stock) => {
    if (!stock?.fetchedAt) return latest;
    const stockTime = new Date(stock.fetchedAt).getTime();
    return stockTime > latest ? stockTime : latest;
  }, 0);

  const latestNseTimestamp = stocks.reduce((currentValue, stock) => {
    return stock?.nseTimestamp || currentValue;
  }, null);

  const summary = stocks.reduce((accumulator, stock) => {
    const categories = Array.isArray(stock?.categories) ? stock.categories : [];
    accumulator.TOTAL += 1;
    if (categories.includes('upper')) accumulator.UPPER += 1;
    if (categories.includes('lower')) accumulator.LOWER += 1;
    if (categories.includes('both')) accumulator.BOTH += 1;
    return accumulator;
  }, { TOTAL: 0, UPPER: 0, LOWER: 0, BOTH: 0 });

  const result = {
    stocks,
    count: stocks.length,
    fetchedAt: latestFetchedAt ? new Date(latestFetchedAt).toISOString() : null,
    source: 'mongodb',
    storedInMongoDB: true,
    summary,
    nseTimestamp: latestNseTimestamp,
  };

  cache.set('priceBandHittersMongo', result);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════
//  COMBINED: Get All NSE Dashboard Data
// ═══════════════════════════════════════════════════════════════════════
async function getAllNSEData() {
  const [gl, ip, wk, fd, wi, ipo, cc, ma] = await Promise.allSettled([
    fetchGainersLosers(),
    fetchIndexPerformance(),
    fetch52WeekHighLow(),
    fetchFIIDIIData(),
    fetchWorldIndices(),
    fetchIPOData(),
    fetchCircuitData(),
    fetchMostActiveData(),
  ]);
  const v = (r, fallback) => (r.status === 'fulfilled' ? r.value : { ...fallback, errors: [r.reason?.message] });

  return {
    gainersLosers:    v(gl, { gainers: [], losers: [] }),
    indexPerformance: v(ip, { indices: [] }),
    week52HighLow:    v(wk, { high: [], low: [] }),
    fiiDii:           v(fd, { fii: null, dii: null }),
    worldIndices:     v(wi, { indices: [] }),
    ipo:              v(ipo, { ipoList: [], totalRecords: 0 }),
    circuits:         v(cc, { upperCircuit: [], lowerCircuit: [] }),
    mostActive:       v(ma, { volumeGainers: [], recoveryStocks: [] }),
    fetchedAt: new Date().toISOString(),
  };
}

function clearCache() {
  cache.clear();
  longCache.clear();
  cookies = null;
  cookieExpiry = 0;
}

function clearFallbackCache() {
  fallbackCache.clear();
}

function getFallbackStatus() {
  return {
    nseAPIBlocked,
    lastBlockedTime: lastBlockedTime ? new Date(lastBlockedTime).toISOString() : null,
    fallbackCacheSize: fallbackCache.store.size,
    availableFallbacks: Array.from(fallbackCache.store.keys()),
    cacheStatus: {
      mainCache: cache.store.size,
      longCache: longCache.store.size,
      fallbackCache: fallbackCache.store.size
    },
    cookieStatus: {
      hasCookies: !!cookies,
      cookieExpiry: cookieExpiry ? new Date(cookieExpiry).toISOString() : null,
      cookieValid: cookies && Date.now() < cookieExpiry
    },
    criticalEndpoints: {
      circuitBreakers: fallbackCache.get('circuitBreakers') ? 'Has fallback' : 'No fallback',
      week52HighLow: fallbackCache.get('week52HighLow') ? 'Has fallback' : 'No fallback'
    }
  };
}

// Test specific NSE endpoints for debugging
async function testCriticalEndpoints() {
  const results = {
    timestamp: new Date().toISOString(),
    endpointTests: {},
    sessionTest: null
  };

  // Test session
  try {
    await getSession();
    results.sessionTest = { status: 'success', message: 'Session acquired successfully' };
  } catch (err) {
    results.sessionTest = { status: 'failed', message: err.message };
  }

  // Test critical endpoints
  const testEndpoints = [
    '/api/live-analysis-52Week-high',
    '/api/live-analysis-52Week-low',
    '/api/equity-stockIndices?index=NIFTY%20500',
    '/api/live-analysis-gainers?index=allSec',
    '/api/live-analysis-losers?index=allSec'
  ];

  for (const endpoint of testEndpoints) {
    try {
      const data = await nseRequest(endpoint);
      results.endpointTests[endpoint] = {
        status: 'success',
        hasData: !!(data?.data || data?.dataHigh || data?.dataLow),
        recordCount: (data?.data || data?.dataHigh || data?.dataLow)?.length || 0
      };
    } catch (err) {
      results.endpointTests[endpoint] = {
        status: 'failed',
        error: err.message,
        statusCode: err.response?.status || null
      };
    }
  }

  return results;
}

// ─── MongoDB FII/DII Data Management ────────────────────────────────────────────
async function checkAndFetchDailyFIIDII(targetDate = null) {
  try {
    const today = targetDate || new Date().toISOString().split('T')[0];
    
    // Check if data exists
    const existingData = await FIIDIIData.findOne({ date: today });
    if (existingData) {
      
      // Add to time series if not already there
      await timeSeriesManager.addNewDayRecord(existingData);
      return existingData;
    }
    
    
    // Fetch from NSE API for specific date
    const nseData = await fetchNSESingleDate(today);
    if (!nseData) {
      throw new Error(`No NSE data for ${today}`);
    }
    
    // Save to MongoDB
    const savedData = new FIIDIIData({
      date: today,
      dateLabel: new Date(today).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      fii: nseData.fii || 0,
      dii: nseData.dii || 0,
      netFlow: (nseData.fii || 0) + (nseData.dii || 0),
      source: 'NSE API',
      fiiData: nseData.fiiData,
      diiData: nseData.diiData,
      isBusinessDay: isBusinessDay(new Date(today))
    });
    
    await savedData.save();
    
    // Add to time series
    await timeSeriesManager.addNewDayRecord(savedData);
    
    console.log(`[MongoDB] ✅ Saved FII/DII data for ${today}`);
    return savedData;
    
  } catch (error) {
    console.error(`[MongoDB] ❌ Error for ${targetDate || 'today'}:`, error.message);
    throw error;
  }
}

// Fetch single date from NSE API
async function fetchNSESingleDate(date) {
  try {
    const session = await getSession();
    const endpoint = `/api/fiidiiTradeReact?date=${date}`;
    
    console.log(`[NSE-Single] Fetching endpoint: ${endpoint}`);
    
    const response = await nseRequest(endpoint);
    
    if (!response) {
      throw new Error('No response data');
    }
    
    // Parse NSE response - they return an array format like:
    // [{"category":"DII","date":"30-Mar-2026","buyValue":"26358.5","sellValue":"11463.78","netValue":"14894.72"},
    //  {"category":"FII/FPI","date":"30-Mar-2026","buyValue":"21952.95","sellValue":"33116.01","netValue":"-11163.06"}]
    
    let fiiData = null, diiData = null;
    
    if (Array.isArray(response)) {
      fiiData = response.find(item => 
        item.category?.toLowerCase().includes('fii') || 
        item.category?.toLowerCase().includes('fpi')
      );
      diiData = response.find(item => 
        item.category?.toLowerCase().includes('dii')
      );
    } else {
      // Fallback for object format
      fiiData = response.fii || response.FII;
      diiData = response.dii || response.DII;
    }
    
    if (!fiiData && !diiData) {
      console.log(`[NSE-Single] Response structure:`, response);
      throw new Error('No FII/DII data found in NSE response');
    }
    
    const result = {
      fii: parseFloat(fiiData?.netValue || 0),
      dii: parseFloat(diiData?.netValue || 0),
      fiiData: {
        buyValue: parseFloat(fiiData?.buyValue || 0),
        sellValue: parseFloat(fiiData?.sellValue || 0),
        netValue: parseFloat(fiiData?.netValue || 0)
      },
      diiData: {
        buyValue: parseFloat(diiData?.buyValue || 0),
        sellValue: parseFloat(diiData?.sellValue || 0),
        netValue: parseFloat(diiData?.netValue || 0)
      }
    };
    
    console.log(`[NSE-Single] ✅ Parsed data for ${date}:`, { fii: result.fii, dii: result.dii });
    return result;
    
  } catch (error) {
    console.error(`[NSE-Single] ❌ Failed ${date}:`, error.message);
    throw error;
  }
}

// Get historical data from MongoDB
async function getHistoricalFromMongoDB(days = 30) {
  try {
    const data = await FIIDIIData.find({ isBusinessDay: true })
                                 .sort({ date: -1 })
                                 .limit(days);
    
    console.log(`[MongoDB] ✅ Retrieved ${data.length} records`);
    return data.map(doc => ({
      date: doc.date,
      dateLabel: doc.dateLabel,
      fii: doc.fii,
      dii: doc.dii,
      netFlow: doc.netFlow,
      source: doc.source
    }));
    
  } catch (error) {
    console.error(`[MongoDB] ❌ Error:`, error.message);
    return [];
  }
}

function isBusinessDay(date) {
  const day = date.getDay();
  return day !== 0 && day !== 6; // Not Sunday/Saturday
}

// ─── Time Series Data Access ───────────────────────────────────────────────────
async function getTimeSeriesFromCollection() {
  try {
    // Import the FIIDIITimeSeries model
    const FIIDIITimeSeries = require('../models/FIIDIITimeSeries');
    
    console.log('[TimeSeries] Fetching data from FIIDIITimeSeries collection...');
    
    // Get the latest time series document
    const timeSeriesDoc = await FIIDIITimeSeries.findOne()
      .sort({ lastUpdated: -1 })
      .lean();
    
    if (!timeSeriesDoc) {
      console.log('[TimeSeries] ⚠️ No time series data found in collection');
      return null;
    }
    
    console.log(`[TimeSeries] ✅ Found time series with ${timeSeriesDoc.data?.day?.length || 0} days, ${timeSeriesDoc.data?.month?.length || 0} months, ${timeSeriesDoc.data?.year?.length || 0} years`);
    
    return timeSeriesDoc;
    
  } catch (error) {
    console.error('[TimeSeries] ❌ Error fetching from collection:', error.message);
    return null;
  }
}

async function getTimeSeriesData(scope = 'all') {
  try {
    switch (scope) {
      case 'days':
        return {
          days: await timeSeriesManager.getDays(),
          last7Days: await timeSeriesManager.getLast7Days(),
          last30Days: await timeSeriesManager.getLast30Days()
        };
      case 'months':
        return {
          months: await timeSeriesManager.getMonths(),
          monthlyTotals: await timeSeriesManager.getMonthlyTotals()
        };
      case 'years':
        return {
          years: await timeSeriesManager.getYears(),
          yearlyTotals: await timeSeriesManager.getYearlyTotals()
        };
      case 'all':
      default:
        return {
          days: await timeSeriesManager.getDays(),
          months: await timeSeriesManager.getMonths(), 
          years: await timeSeriesManager.getYears(),
          summaries: {
            last7Days: await timeSeriesManager.getLast7Days(),
            last30Days: await timeSeriesManager.getLast30Days(),
            monthlyTotals: await timeSeriesManager.getMonthlyTotals(),
            yearlyTotals: await timeSeriesManager.getYearlyTotals()
          }
        };
    }
  } catch (error) {
    console.error('[Time Series] Error getting data:', error.message);
    throw error;
  }
}

// ─── ALTERNATIVE FII/DII DATA SOURCES ──────────────────────────────────────────

// BSE CSV Download - Most Reliable Source  
async function fetchFIIDIIFromBSE() {
  try {
    console.log('[BSE-API] Fetching FII/DII data from BSE CSV...');
    
    // Try multiple BSE CSV endpoints (they change the URL format sometimes)
    const csvUrls = [
      'https://www.bseindia.com/download/fiidii/fiidii.csv',
      'https://www.bseindia.com/downloads/fii-dii/fii_dii.csv',
      'https://api.bseindia.com/BseIndiaAPI/api/FIIDIIData/w'
    ];
    
    let response;
    let successUrl = null;
    
    for (const url of csvUrls) {
      try {
        console.log(`[BSE-API] Trying URL: ${url}`);
        response = await axios.get(url, {
          timeout: 10000,
          headers: {
            'User-Agent': randomUA(),
            'Accept': 'text/csv,application/csv,text/plain,application/json,*/*',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });
        successUrl = url;
        break;
      } catch (error) {
        console.log(`[BSE-API] Failed ${url}: ${error.response?.status || error.code}`);
        continue;
      }
    }
    
    if (!response) {
      throw new Error('All BSE CSV URLs failed');
    }
    
    let data;
    
    // Handle JSON response (from API endpoint)
    if (successUrl.includes('api') && typeof response.data === 'object') {
      console.log('[BSE-API] Processing JSON response...');
      data = response.data;
      
      // Extract FII/DII values from JSON structure
      const result = {
        date: new Date().toISOString().split('T')[0],
        fii: parseFloat(data.FII_Net || data.fiiNet || 0),
        dii: parseFloat(data.DII_Net || data.diiNet || 0),
        fiiData: {
          buyValue: parseFloat(data.FII_Buy || data.fiiBuy || 0),
          sellValue: parseFloat(data.FII_Sell || data.fiiSell || 0),
          netValue: parseFloat(data.FII_Net || data.fiiNet || 0),
        },
        diiData: {
          buyValue: parseFloat(data.DII_Buy || data.diiBuy || 0),
          sellValue: parseFloat(data.DII_Sell || data.diiSell || 0),
          netValue: parseFloat(data.DII_Net || data.diiNet || 0),
        },
        source: 'BSE API JSON'
      };
      
      if (result.fii === 0 && result.dii === 0) {
        throw new Error('BSE JSON returned zero values');
      }
      
      console.log(`[BSE-API] ✅ Retrieved FII/DII data from JSON:`, { 
        fii: result.fii, 
        dii: result.dii 
      });
      return result;
    }
    
    // Handle CSV response
    const lines = response.data.split('\n').filter(line => line.trim());
    if (lines.length < 2) throw new Error('BSE CSV: Invalid data format');
    
    console.log('[BSE-API] Processing CSV response...');
    
    // Parse CSV header and find most recent data
    const headers = lines[0].toLowerCase().split(',');
    const latestDataLine = lines[lines.length - 1];
    const values = latestDataLine.split(',');
    
    // Find column indices (flexible matching)
    const dateIdx = headers.findIndex(h => h.includes('date'));
    const fiiBuyIdx = headers.findIndex(h => (h.includes('fii') || h.includes('foreign')) && h.includes('buy'));
    const fiiSellIdx = headers.findIndex(h => (h.includes('fii') || h.includes('foreign')) && h.includes('sell'));
    const fiiNetIdx = headers.findIndex(h => (h.includes('fii') || h.includes('foreign')) && h.includes('net'));
    const diiBuyIdx = headers.findIndex(h => (h.includes('dii') || h.includes('domestic')) && h.includes('buy'));
    const diiSellIdx = headers.findIndex(h => (h.includes('dii') || h.includes('domestic')) && h.includes('sell'));
    const diiNetIdx = headers.findIndex(h => (h.includes('dii') || h.includes('domestic')) && h.includes('net'));
    
    // Parse values (handle Indian number format)
    const parseValue = (val) => {
      if (!val || val === '-' || val === 'NA') return 0;
      return parseFloat(val.replace(/[,₹]/g, '')) || 0;
    };
    
    // Parse date
    let parsedDate;
    const dateValue = values[dateIdx];
    if (dateValue && dateValue.includes('-')) {
      const [dd, mm, yyyy] = dateValue.split('-');
      const monthMap = { 
        Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06', 
        Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12' 
      };
      const month = monthMap[mm] || mm.padStart(2, '0');
      parsedDate = `${yyyy}-${month}-${dd.padStart(2, '0')}`;
    } else {
      parsedDate = new Date().toISOString().split('T')[0];
    }
    
    const result = {
      date: parsedDate,
      fii: parseValue(values[fiiNetIdx]),
      dii: parseValue(values[diiNetIdx]),
      fiiData: {
        buyValue: parseValue(values[fiiBuyIdx]),
        sellValue: parseValue(values[fiiSellIdx]),
        netValue: parseValue(values[fiiNetIdx]),
      },
      diiData: {
        buyValue: parseValue(values[diiBuyIdx]),
        sellValue: parseValue(values[diiSellIdx]),
        netValue: parseValue(values[diiNetIdx]),
      },
      source: 'BSE CSV'
    };
    
    // Validate data
    if (result.fii === 0 && result.dii === 0) {
      throw new Error('BSE CSV returned zero values for both FII and DII');
    }
    
    console.log(`[BSE-API] ✅ Retrieved FII/DII data for ${parsedDate}:`, { 
      fii: result.fii, 
      dii: result.dii,
      url: successUrl
    });
    return result;
    
  } catch (error) {
    console.error('[BSE-API] ❌ Failed to fetch from BSE:', error.message);
    throw error;
  }
}

// MoneyControl Web Scraping - Reliable Backup Source
async function fetchFIIDIIFromMoneyControl() {
  try {
    console.log('[MC-API] Fetching FII/DII data from MoneyControl...');
    
    const response = await axios.get('https://www.moneycontrol.com/markets/fii-dii/', {
      timeout: 15000,
      headers: {
        'User-Agent': randomUA(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
    });
    
    const html = response.data;
    
    // Extract FII/DII data from HTML (improved regex patterns)
    const fiiNetMatch = html.match(/FII.*?Net.*?([\\-\\+]?[0-9,]+\\.?[0-9]*)/i) ||
                       html.match(/Foreign.*?Net.*?([\\-\\+]?[0-9,]+\\.?[0-9]*)/i);
    const diiNetMatch = html.match(/DII.*?Net.*?([\\-\\+]?[0-9,]+\\.?[0-9]*)/i) ||
                       html.match(/Domestic.*?Net.*?([\\-\\+]?[0-9,]+\\.?[0-9]*)/i);
    const fiiBuyMatch = html.match(/FII.*?Buy.*?([0-9,]+\\.?[0-9]*)/i);
    const fiiSellMatch = html.match(/FII.*?Sell.*?([0-9,]+\\.?[0-9]*)/i);
    const diiBuyMatch = html.match(/DII.*?Buy.*?([0-9,]+\\.?[0-9]*)/i);
    const diiSellMatch = html.match(/DII.*?Sell.*?([0-9,]+\\.?[0-9]*)/i);
    
    const cleanNumber = (val) => {
      if (!val) return 0;
      return parseFloat(val.replace(/[,]/g, '')) || 0;
    };
    
    const result = {
      date: new Date().toISOString().split('T')[0],
      fii: cleanNumber(fiiNetMatch?.[1]),
      dii: cleanNumber(diiNetMatch?.[1]),
      fiiData: {
        buyValue: cleanNumber(fiiBuyMatch?.[1]),
        sellValue: cleanNumber(fiiSellMatch?.[1]),
        netValue: cleanNumber(fiiNetMatch?.[1]),
      },
      diiData: {
        buyValue: cleanNumber(diiBuyMatch?.[1]),
        sellValue: cleanNumber(diiSellMatch?.[1]),
        netValue: cleanNumber(diiNetMatch?.[1]),
      },
      source: 'MoneyControl'
    };
    
    // Validate that we got meaningful data
    if (result.fii === 0 && result.dii === 0) {
      throw new Error('No FII/DII data found in MoneyControl HTML');
    }
    
    console.log(`[MC-API] ✅ Retrieved FII/DII data:`, { fii: result.fii, dii: result.dii });
    return result;
    
  } catch (error) {
    console.error('[MC-API] ❌ Failed to fetch from MoneyControl:', error.message);
    throw error;
  }
}

// Original NSE API implementation (now as fallback)
async function fetchNSEFIIDIIOriginal() {
  const raw = await retryAsync(() => nseRequest('/api/fiidiiTradeReact'));

  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('Unexpected NSE response format from fiidiiTradeReact');
  }

  const fiiEntry = raw.find(r =>
    (r.category || '').toLowerCase().includes('fii') ||
    (r.category || '').toLowerCase().includes('fpi')
  );
  const diiEntry = raw.find(r =>
    (r.category || '').toLowerCase().includes('dii')
  );

  if (!fiiEntry && !diiEntry) {
    throw new Error('No FII or DII entry found in NSE response');
  }

  // Convert NSE date string "02-Apr-2026" → ISO "2026-04-02"
  const MONTH_MAP = {
    Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06',
    Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12',
  };
  const rawDate = (fiiEntry || diiEntry).date;
  const parts = rawDate.split('-');
  if (parts.length !== 3 || !MONTH_MAP[parts[1]]) {
    throw new Error(`Cannot parse NSE date: "${rawDate}"`);
  }
  const [dd, mmm, yyyy] = parts;
  const isoDate = `${yyyy}-${MONTH_MAP[mmm]}-${dd.padStart(2, '0')}`;

  return {
    date: isoDate,
    fii: parseFloat(fiiEntry?.netValue || 0),
    dii: parseFloat(diiEntry?.netValue || 0),
    fiiData: {
      buyValue: parseFloat(fiiEntry?.buyValue || 0),
      sellValue: parseFloat(fiiEntry?.sellValue || 0),
      netValue: parseFloat(fiiEntry?.netValue || 0),
    },
    diiData: {
      buyValue: parseFloat(diiEntry?.buyValue || 0),
      sellValue: parseFloat(diiEntry?.sellValue || 0),
      netValue: parseFloat(diiEntry?.netValue || 0),
    },
    source: 'NSE API'
  };
}

// Enhanced FII/DII fetcher with multiple reliable sources
async function fetchLatestFIIDIIFromNSE() {
  const dataSources = [
    { name: 'BSE CSV', fetcher: fetchFIIDIIFromBSE },
    { name: 'MoneyControl', fetcher: fetchFIIDIIFromMoneyControl },
    { name: 'NSE API', fetcher: fetchNSEFIIDIIOriginal }
  ];
  
  let lastError = null;
  
  for (const source of dataSources) {
    try {
      console.log(`[FII-DII] Trying ${source.name}...`);
      const result = await source.fetcher();
      
      // Validate data quality - ensure we have meaningful values
      if (result && (Math.abs(result.fii) > 0.1 || Math.abs(result.dii) > 0.1)) {
        console.log(`[FII-DII] ✅ Success with ${source.name}:`, { 
          fii: result.fii, 
          dii: result.dii, 
          date: result.date,
          source: result.source
        });
        
        // Save successful data as fallback
        saveFallbackData('latestFIIDII', { ...result, successfulSource: source.name });
        return result;
      } else {
        throw new Error('Retrieved insignificant values for FII and DII');
      }
      
    } catch (error) {
      console.log(`[FII-DII] ❌ ${source.name} failed: ${error.message}`);
      lastError = error;
      
      // Small delay between attempts to avoid rate limiting
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  // All sources failed - try fallback cache
  console.log('[FII-DII] 🔄 All sources failed, trying fallback cache...');
  const fallbackData = getFallbackData('latestFIIDII');
  if (fallbackData) {
    console.log(`[FII-DII] 📦 Using cached data from ${fallbackData.successfulSource || 'unknown source'}`);
    return { ...fallbackData, usingFallbackData: true };
  }
  
  throw new Error(`All FII/DII data sources failed. Last error: ${lastError?.message}`);
}

// ─── Most Active Data (Research360 API) ────────────────────────────────────────
async function fetchMostActiveData() {
  const cacheKey = 'mostActiveData';
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log('[Most Active] 📦 Using cached data');
    return cached;
  }

  try {
    console.log('[Most Active] 🔄 Fetching from Research360 APIs...');
    
    const [volumeRes, recoveryRes] = await Promise.all([
      axios.get('https://www.research360.in/api/budget/nse-most-active', {
        params: {
          type: 'HighVolumeGainers',
          PageSize: 20,
          PageNumber: 1,
          IndexCode: 22115
        },
        timeout: 10000,
        headers: {
          'User-Agent': randomUA(),
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      }),
      axios.get('https://www.research360.in/api/budget/nse-recovery-fall', {
        params: {
          type: 'RecoveryFromDayLow',
          PageSize: 20,
          PageNumber: 1,
          IndexCode: 22115
        },
        timeout: 10000,
        headers: {
          'User-Agent': randomUA(),
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      })
    ]);

    const result = {
      volumeGainers: volumeRes.data?.data || volumeRes.data || [],
      recoveryStocks: recoveryRes.data?.data || recoveryRes.data || [],
      fetchedAt: new Date().toISOString(),
      dataSource: 'Research360'
    };

    console.log(`[Most Active] ✅ Fetched ${result.volumeGainers.length} volume gainers, ${result.recoveryStocks.length} recovery stocks`);
    
    // Cache the result
    cache.set(cacheKey, result);
    
    // Save fallback cache for 24 hours
    saveFallbackData('mostActiveData', result);
    
    return result;
    
  } catch (error) {
    console.warn(`[Most Active] ⚠️ Research360 API failed: ${error.message}`);
    
    // Try fallback cache
    const fallbackData = getFallbackData('mostActiveData');
    if (fallbackData) {
      console.log('[Most Active] 📦 Using 24h fallback cache');
      return { ...fallbackData, usingFallbackData: true };
    }
    
    // Return empty data if no cache available
    console.log('[Most Active] 📊 No cache available, returning empty data');
    return {
      volumeGainers: [],
      recoveryStocks: [],
      fetchedAt: new Date().toISOString(),
      dataSource: 'Fallback (Empty)',
      error: error.message
    };
  }
}

// ─── Stock Heatmap Data ────────────────────────────────────────────────────────
/**
 * Major NSE stocks with sector mapping for heatmap visualization
 */
const HEATMAP_STOCKS = [
  // IT Sector
  { symbol: 'TCS.NS', sector: 'Information Technology', logo: '/logos/tcs.png' },
  { symbol: 'INFY.NS', sector: 'Information Technology', logo: '/logos/infy.png' },
  { symbol: 'WIPRO.NS', sector: 'Information Technology', logo: '/logos/wipro.png' },
  { symbol: 'TECHM.NS', sector: 'Information Technology', logo: '/logos/techm.png' },
  { symbol: 'HCLTECH.NS', sector: 'Information Technology', logo: '/logos/hcltech.png' },
  { symbol: 'LTI.NS', sector: 'Information Technology', logo: '/logos/lti.png' },
  { symbol: 'MPHASIS.NS', sector: 'Information Technology', logo: '/logos/mphasis.png' },

  // Banking & Finance
  { symbol: 'HDFCBANK.NS', sector: 'Banking', logo: '/logos/hdfcbank.png' },
  { symbol: 'ICICIBANK.NS', sector: 'Banking', logo: '/logos/icicibank.png' },
  { symbol: 'AXISBANK.NS', sector: 'Banking', logo: '/logos/axisbank.png' },
  { symbol: 'KOTAKBANK.NS', sector: 'Banking', logo: '/logos/kotakbank.png' },
  { symbol: 'SBIN.NS', sector: 'Banking', logo: '/logos/sbin.png' },
  { symbol: 'INDUSINDBK.NS', sector: 'Banking', logo: '/logos/indusindbk.png' },
  { symbol: 'FEDERALBNK.NS', sector: 'Banking', logo: '/logos/federalbnk.png' },
  { symbol: 'BAJFINANCE.NS', sector: 'Financial Services', logo: '/logos/bajfinance.png' },
  { symbol: 'HDFCLIFE.NS', sector: 'Financial Services', logo: '/logos/hdfclife.png' },
  { symbol: 'SBILIFE.NS', sector: 'Financial Services', logo: '/logos/sbilife.png' },

  // Energy & Oil
  { symbol: 'RELIANCE.NS', sector: 'Energy', logo: '/logos/reliance.png' },
  { symbol: 'ONGC.NS', sector: 'Energy', logo: '/logos/ongc.png' },
  { symbol: 'IOC.NS', sector: 'Energy', logo: '/logos/ioc.png' },
  { symbol: 'BPCL.NS', sector: 'Energy', logo: '/logos/bpcl.png' },
  { symbol: 'ADANIGREEN.NS', sector: 'Renewable Energy', logo: '/logos/adanigreen.png' },
  { symbol: 'POWERGRID.NS', sector: 'Energy', logo: '/logos/powergrid.png' },
  { symbol: 'NTPC.NS', sector: 'Energy', logo: '/logos/ntpc.png' },

  // Automobile
  { symbol: 'MARUTI.NS', sector: 'Automobile', logo: '/logos/maruti.png' },
  { symbol: 'TATAMOTORS.NS', sector: 'Automobile', logo: '/logos/tatamotors.png' },
  { symbol: 'M&M.NS', sector: 'Automobile', logo: '/logos/mm.png' },
  { symbol: 'BAJAJ-AUTO.NS', sector: 'Automobile', logo: '/logos/bajajauto.png' },
  { symbol: 'HEROMOTOCO.NS', sector: 'Automobile', logo: '/logos/heromotoco.png' },
  { symbol: 'EICHERMOT.NS', sector: 'Automobile', logo: '/logos/eichermot.png' },
  { symbol: 'TVSMOTOR.NS', sector: 'Automobile', logo: '/logos/tvsmotor.png' },

  // Pharmaceuticals
  { symbol: 'SUNPHARMA.NS', sector: 'Pharmaceuticals', logo: '/logos/sunpharma.png' },
  { symbol: 'DRREDDY.NS', sector: 'Pharmaceuticals', logo: '/logos/drreddy.png' },
  { symbol: 'CIPLA.NS', sector: 'Pharmaceuticals', logo: '/logos/cipla.png' },
  { symbol: 'DIVISLAB.NS', sector: 'Pharmaceuticals', logo: '/logos/divislab.png' },
  { symbol: 'BIOCON.NS', sector: 'Pharmaceuticals', logo: '/logos/biocon.png' },
  { symbol: 'LUPIN.NS', sector: 'Pharmaceuticals', logo: '/logos/lupin.png' },
  { symbol: 'CADILAHC.NS', sector: 'Pharmaceuticals', logo: '/logos/cadilahc.png' },

  // FMCG
  { symbol: 'HINDUNILVR.NS', sector: 'FMCG', logo: '/logos/hindunilvr.png' },
  { symbol: 'ITC.NS', sector: 'FMCG', logo: '/logos/itc.png' },
  { symbol: 'NESTLEIND.NS', sector: 'FMCG', logo: '/logos/nestle.png' },
  { symbol: 'BRITANNIA.NS', sector: 'FMCG', logo: '/logos/britannia.png' },
  { symbol: 'DABUR.NS', sector: 'FMCG', logo: '/logos/dabur.png' },
  { symbol: 'MARICO.NS', sector: 'FMCG', logo: '/logos/marico.png' },
  { symbol: 'COLPAL.NS', sector: 'FMCG', logo: '/logos/colpal.png' },

  // Infrastructure & Construction
  { symbol: 'LT.NS', sector: 'Infrastructure', logo: '/logos/lt.png' },
  { symbol: 'ULTRACEMCO.NS', sector: 'Cement', logo: '/logos/ultracemco.png' },
  { symbol: 'GRASIM.NS', sector: 'Cement', logo: '/logos/grasim.png' },
  { symbol: 'ACC.NS', sector: 'Cement', logo: '/logos/acc.png' },
  { symbol: 'ADANIPORTS.NS', sector: 'Infrastructure', logo: '/logos/adaniports.png' },
  { symbol: 'HINDPETRO.NS', sector: 'Energy', logo: '/logos/hindpetro.png' },

  // Metals & Mining
  { symbol: 'TATASTEEL.NS', sector: 'Metals', logo: '/logos/tatasteel.png' },
  { symbol: 'JSWSTEEL.NS', sector: 'Metals', logo: '/logos/jswsteel.png' },
  { symbol: 'HINDALCO.NS', sector: 'Metals', logo: '/logos/hindalco.png' },
  { symbol: 'VEDL.NS', sector: 'Metals', logo: '/logos/vedl.png' },
  { symbol: 'COALINDIA.NS', sector: 'Metals', logo: '/logos/coalindia.png' },
  { symbol: 'SAIL.NS', sector: 'Metals', logo: '/logos/sail.png' },

  // Telecommunications
  { symbol: 'BHARTIARTL.NS', sector: 'Telecommunications', logo: '/logos/airtel.png' },
  { symbol: 'IDEA.NS', sector: 'Telecommunications', logo: '/logos/idea.png' },

  // Others
  { symbol: 'ASIANPAINT.NS', sector: 'Chemicals', logo: '/logos/asianpaints.png' },
  { symbol: 'TITAN.NS', sector: 'Consumer Goods', logo: '/logos/titan.png' },
  { symbol: 'ADANIENTERPR.NS', sector: 'Diversified', logo: '/logos/adanienterpr.png' },
];

/**
 * Fetch heatmap-ready stock data using Yahoo Finance
 * @returns {Object} Heatmap data structure grouped by sector
 */
async function fetchHeatmapData() {
  const cacheKey = 'heatmap_stocks';
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log('[NSE] 📱 Returning cached heatmap data');
    return { ...cached, cached: true };
  }

  console.log('[NSE] 🔄 Fetching heatmap data from Yahoo Finance...');
  const startTime = Date.now();

  try {
    // Extract symbols for batch fetching
    const symbols = HEATMAP_STOCKS.map(stock => stock.symbol);
    console.log(`[NSE] 📊 Fetching quotes for ${symbols.length} stocks...`);

    // Fetch all quotes using Promise.all for performance
    const batchSize = 20; // Yahoo Finance rate limit consideration
    const results = [];
    
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      try {
        const batchQuotes = await yahooFinance.quote(batch);
        if (Array.isArray(batchQuotes)) {
          results.push(...batchQuotes);
        } else if (batchQuotes) {
          results.push(batchQuotes);
        }
        
        // Small delay between batches to avoid rate limiting
        if (i + batchSize < symbols.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (batchError) {
        console.warn(`[NSE] ⚠️ Batch ${i}-${i + batchSize} failed:`, batchError.message);
        continue; // Skip failed batch, don't break entire process
      }
    }

    console.log(`[NSE] ✅ Successfully fetched ${results.length}/${symbols.length} quotes`);

    // Transform data into heatmap structure
    const sectorData = {};
    let processedCount = 0;
    let skippedCount = 0;

    results.forEach(quote => {
      if (!quote || !quote.symbol) {
        skippedCount++;
        return;
      }

      // Find sector mapping
      const stockInfo = HEATMAP_STOCKS.find(s => s.symbol === quote.symbol);
      const sector = stockInfo?.sector || 'Others';

      // Validate essential data
      const marketCap = quote.marketCap;
      const price = quote.regularMarketPrice || quote.price;
      const changePercent = quote.regularMarketChangePercent;

      if (!marketCap || marketCap <= 0 || !price) {
        skippedCount++;
        console.warn(`[NSE] ⚠️ Skipping ${quote.symbol}: missing essential data`);
        return;
      }

      // Initialize sector if not exists
      if (!sectorData[sector]) {
        sectorData[sector] = [];
      }

      // Add stock to sector
      sectorData[sector].push({
        name: quote.symbol.replace('.NS', ''), // Remove .NS suffix
        value: marketCap, // Market cap for sizing
        change: changePercent || 0, // Percentage change for coloring
        price: price,
        symbol: quote.symbol,
        displayName: quote.displayName || quote.shortName || quote.symbol,
        logo: stockInfo?.logo || null // Add logo URL if available
      });

      processedCount++;
    });

    // Transform to final heatmap format
    const heatmapData = Object.keys(sectorData)
      .filter(sector => sectorData[sector].length > 0) // Only include sectors with data
      .map(sectorName => ({
        name: sectorName,
        children: sectorData[sectorName].sort((a, b) => b.value - a.value) // Sort by market cap descending
      }))
      .sort((a, b) => {
        // Sort sectors by total market cap
        const aTotalCap = a.children.reduce((sum, stock) => sum + stock.value, 0);
        const bTotalCap = b.children.reduce((sum, stock) => sum + stock.value, 0);
        return bTotalCap - aTotalCap;
      });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const result = {
      data: heatmapData,
      cached: false,
      timestamp: new Date().toISOString(),
      processedStocks: processedCount,
      skippedStocks: skippedCount,
      totalSectors: heatmapData.length,
      fetchTime: `${duration}s`
    };

    // Cache the result
    cache.set(cacheKey, result);
    
    console.log(
      `[NSE] ✅ Heatmap data processed: ${processedCount} stocks, ` +
      `${heatmapData.length} sectors in ${duration}s (skipped: ${skippedCount})`
    );

    return result;

  } catch (error) {
    console.error('[NSE] ❌ Heatmap fetch error:', error.message);
    
    // Try fallback cache
    const fallbackData = fallbackCache.get(cacheKey);
    if (fallbackData) {
      console.log('[NSE] 🔄 Using 24h fallback heatmap data');
      return { ...fallbackData, cached: true, source: 'fallback' };
    }

    // Return minimal structure on complete failure
    return {
      data: [],
      cached: false,
      timestamp: new Date().toISOString(),
      processedStocks: 0,
      skippedStocks: 0,
      totalSectors: 0,
      error: error.message
    };
  }
}

// ─── Research360 Indices (NSE / BSE) ─────────────────────────────────────────
// NSE co_codes are fixed; BSE co_codes are derived dynamically from the indices response
const R360_NSE_CO_CODES = '20559,22115,27176,22113,41356,40939,28303,26771,24484,26753,26768,26769,28203,28253,28254,28647,30183,30186,33917,41327,41328,41329,41359,41383,41384,44375,75971,29878';

async function fetchR360Indices(exchange = 'NSE') {
  const exch = exchange.toUpperCase();
  const cacheKey = `r360Indices_${exch}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const headers = { 'User-Agent': randomUA(), 'Accept': 'application/json' };

  try {
    // Step 1: fetch the indices list first so we can extract co_codes dynamically
    const indicesRes = await axios.get(
      `https://www.research360.in/api/market/indian-indices?exchange=${exch}`,
      { timeout: 12000, headers }
    );

    const rawIndices = indicesRes.data?.data || [];

    // Step 2: build co_codes from the response (NSE uses fixed list, BSE uses dynamic)
    const coCodes = exch === 'NSE'
      ? R360_NSE_CO_CODES
      : rawIndices.map(i => i.co_code).filter(Boolean).join(',');

    // Step 3: fetch intraday charts using the resolved co_codes
    const chartRes = await axios.get(
      `https://www.research360.in/api/market/indian-indices/intraday-chart?exchange=${exch}&co_codes=${coCodes}`,
      { timeout: 15000, headers }
    );

    const chartData = chartRes.data?.right?.data || chartRes.data?.right || chartRes.data?.data || {};

    const indices = rawIndices.map(idx => ({
      co_code: idx.co_code,
      symbol: idx.symbol,
      name: idx.lname || idx.coname || idx.symbol,
      exchange: idx.exchange || exch,
      ltp: parseFloat(idx.ltp) || 0,
      price_change: parseFloat(idx.price_change) || 0,
      price_change_per: parseFloat(idx.price_change_per) || 0,
      day_high: parseFloat(idx.day_high) || 0,
      day_low: parseFloat(idx.day_low) || 0,
      fiftytwo_wk_high: parseFloat(idx.fiftytwo_wk_high) || 0,
      fiftytwo_wk_low: parseFloat(idx.fiftytwo_wk_low) || 0,
      three_month_change_per: parseFloat(idx.three_month_change_per) || 0,
      prev_close: parseFloat(idx.prev_close) || 0,
      intradayChart: (chartData[idx.co_code] || chartData[String(idx.co_code)] || []).map(p => parseFloat(p.value || p.price || p.ltp || p.close || p.c) || 0),
    }));

    const result = { indices, fetchedAt: new Date().toISOString() };
    cache.set(cacheKey, result);
    fallbackCache.set(cacheKey, result);
    console.log(`[NSE] R360 Indices (${exch}): ${indices.length} fetched`);
    return result;
  } catch (err) {
    console.error(`[NSE] R360 Indices (${exch}) error:`, err.message);
    const fallback = fallbackCache.get(cacheKey);
    if (fallback) {
      console.log(`[NSE] R360 Indices (${exch}): using fallback cache`);
      return { ...fallback, cached: true };
    }
    return { indices: [], fetchedAt: new Date().toISOString(), error: err.message };
  }
}

// Yahoo carries almost no history for these NSE sector indices (0-3 bars), so when the index itself comes back
// (nearly) empty we chart an NSE-listed ETF that tracks it. Charts are normalised % returns, so ETF price level is irrelevant.
// `exact: false` marks funds that track a neighbouring index, not the same one. NIFTY REALTY has no ETF, so it stays empty.
const INDEX_PROXY_MAP = {
  'NIFTY AUTO':         { ticker: 'AUTOBEES.NS',   name: 'Nippon India Nifty Auto ETF', exact: true },
  'NIFTY FMCG':         { ticker: 'FMCGIETF.NS',   name: 'ICICI Prudential Nifty FMCG ETF', exact: true },
  'NIFTY METAL':        { ticker: 'METALIETF.NS',  name: 'ICICI Prudential Nifty Metal ETF', exact: true },
  'NIFTY ENERGY':       { ticker: 'ENERGY.NS',     name: 'Mirae Asset Nifty Energy ETF', exact: true },
  'NIFTY PSU BANK':     { ticker: 'PSUBNKBEES.NS', name: 'Nippon India ETF Nifty PSU Bank BeES', exact: true },
  'NIFTY PRIVATE BANK': { ticker: 'HDFCPVTBAN.NS', name: 'HDFC Nifty Private Bank ETF', exact: true },
  'NIFTY MIDCAP 100':   { ticker: 'MOM100.NS',     name: 'Motilal Oswal Nifty Midcap 100 ETF', exact: true },
  'NIFTY FIN SERVICE':  { ticker: 'FINIETF.NS',    name: 'ICICI Prudential Nifty Financial Services Ex-Bank ETF', exact: false },
  'NIFTY SMALLCAP 100': { ticker: 'HDFCSML250.NS', name: 'HDFC Nifty Smallcap 250 ETF', exact: false },
};
const MIN_BARS = 10;

// ─── Index Comparison — Historical Data ────────────────────────────────────────
async function fetchIndexComparison(indexKeys = [], days = 365) {
  const validKeys = indexKeys.filter(k => INDEX_TICKER_MAP[k]);
  if (validKeys.length === 0) return [];

  const period2 = new Date();
  const period1 = new Date(period2 - days * 24 * 60 * 60 * 1000);

  const results = await Promise.all(validKeys.map(async key => {
    const ticker = INDEX_TICKER_MAP[key];
    const cacheKey = `idx_hist:${ticker}:${days}`;

    // Return cached data if fresh
    const cached = histCache.get(cacheKey);
    if (cached) {
      console.log(`[IndexCompare] Cache hit: ${key}`);
      return cached;
    }

    try {
      console.log(`[IndexCompare] Fetching ${key} (${ticker}) last ${days}d...`);
      const load = async (t) => {
        const rows = await yahooFinance.historical(t, {
          period1: period1.toISOString().slice(0, 10),
          period2: period2.toISOString().slice(0, 10),
          interval: '1d',
        });
        return rows
          .filter(r => r.adjClose != null || r.close != null)
          .map(r => ({
            time:  r.date.toISOString().slice(0, 10),
            value: +(r.adjClose ?? r.close).toFixed(2),
          }))
          .sort((a, b) => a.time.localeCompare(b.time));
      };

      let data = [];
      try { data = await load(ticker); } catch (e) { if (!INDEX_PROXY_MAP[key]) throw e; }
      let proxy;
      const px = INDEX_PROXY_MAP[key];
      if (data.length < MIN_BARS && px) {
        const alt = await load(px.ticker);
        if (alt.length >= MIN_BARS) {
          console.log(`[IndexCompare] ${key}: index has ${data.length} bars, using proxy ${px.ticker}`);
          data = alt;
          proxy = { ticker: px.ticker, name: px.name, exact: px.exact };
        }
      }

      const entry = { key, label: key, ticker, data, ...(proxy ? { proxy } : {}) };
      histCache.set(cacheKey, entry);
      console.log(`[IndexCompare] ${key}: ${data.length} bars fetched`);
      return entry;
    } catch (err) {
      console.error(`[IndexCompare] ${key} error: ${err.message}`);
      // Return stale cache if available (even if expired)
      const staleEntry = histCache.store?.get(cacheKey);
      if (staleEntry) {
        console.log(`[IndexCompare] ${key}: returning stale cache on error`);
        return staleEntry.val;
      }
      return { key, label: key, ticker, data: [], error: err.message };
    }
  }));

  return results;
}

module.exports = {
  fetchGainersLosers,
  fetchIndexPerformance,
  fetch52WeekHighLow,
  fetchPennyStocks,
  fetchFIIDIIData,
  fetchFIIDIIHistoricalData,
  fetchWorldIndices,
  fetchIPOData,
  fetchCircuitData,
  fetchAndStorePriceBandHitters,
  getPriceBandHittersFromMongo,
  fetchMostActiveData,
  fetchHeatmapData,
  getAllNSEData,
  fetchR360Indices,
  clearCache,
  clearFallbackCache,
  getFallbackStatus,
  testCriticalEndpoints,
  checkAndFetchDailyFIIDII,
  getHistoricalFromMongoDB,
  getTimeSeriesData,
  getTimeSeriesFromCollection,
  fetchLatestFIIDIIFromNSE,
  fetchIndexComparison,
  INDEX_TICKER_MAP,
};
