const express = require('express');
const router = express.Router();

// Yahoo Finance
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// Instrument definitions
const INSTRUMENTS = [
  { name: 'Nifty 50',   symbol: '^NSEI',    code: 'NIFTY50',   color: '#f59e0b', currency: 'INR' },
  { name: 'Bank Nifty', symbol: '^NSEBANK',  code: 'BANKNIFTY', color: '#3b82f6', currency: 'INR' },
  { name: 'BSE Sensex', symbol: '^BSESN',    code: 'SENSEX',    color: '#10b981', currency: 'INR' },
];

// IST helpers
function getISTMinutes() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

function getTradingSession() {
  const m = getISTMinutes();
  if (m >= 9 * 60 + 15 && m <= 15 * 60 + 30) return 'MARKET';
  if (m >= 9 * 60       && m <  9 * 60 + 15)  return 'PRE_MARKET';
  if (m >  15 * 60 + 30 && m <  16 * 60)      return 'POST_MARKET';
  return 'CLOSED';
}

function cacheTTL() {
  const s = getTradingSession();
  if (s === 'MARKET')     return 2  * 60 * 1000;
  if (s === 'PRE_MARKET') return 5  * 60 * 1000;
  return                         15 * 60 * 1000;
}

// Convert UTC Date to IST time label e.g. "09:15 AM"
function toISTLabel(date) {
  const ist  = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  const h24  = ist.getUTCHours();
  const mm   = String(ist.getUTCMinutes()).padStart(2, '0');
  const ampm = h24 < 12 ? 'AM' : 'PM';
  const h12  = String(h24 % 12 || 12).padStart(2, '0');
  return `${h12}:${mm} ${ampm}`;
}

function round2(v) {
  if (v == null || isNaN(v)) return null;
  return parseFloat(Number(v).toFixed(2));
}

// Cache
let intradayCache = null;
let cacheExpiry   = null;

// GET /api/intraday-charts
router.get('/', async (req, res) => {
  try {
    if (intradayCache && cacheExpiry && Date.now() < cacheExpiry) {
      return res.json(intradayCache);
    }
    const data    = await fetchAllCharts();
    intradayCache = { success: true, data, timestamp: new Date().toISOString() };
    cacheExpiry   = Date.now() + cacheTTL();
    res.json(intradayCache);
  } catch (err) {
    console.error('[intradayCharts] fatal:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch intraday charts data', timestamp: new Date().toISOString() });
  }
});

// POST /api/intraday-charts/clear-cache
router.post('/clear-cache', (_req, res) => {
  intradayCache = null;
  cacheExpiry   = null;
  res.json({ success: true, message: 'Cache cleared', timestamp: new Date().toISOString() });
});

async function fetchAllCharts() {
  const settled = await Promise.allSettled(INSTRUMENTS.map(fetchChartForInstrument));
  const charts  = settled.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    console.warn(`[intradayCharts] ${INSTRUMENTS[i].name} failed:`, r.reason?.message || r.reason);
    return placeholderChart(INSTRUMENTS[i]);
  });
  return {
    charts,
    summary: {
      totalInstruments: charts.length,
      bullishCount:     charts.filter(c => c.trend === 'bullish').length,
      bearishCount:     charts.filter(c => c.trend === 'bearish').length,
      tradingSession:   getTradingSession(),
      lastRefresh:      new Date().toISOString(),
    },
  };
}

async function fetchChartForInstrument(instrument) {
  // 7-day window ensures we get candles even on holidays/weekends.
  // yahoo-finance2 v3 uses period1, not range.
  const period1 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const result = await yahooFinance.chart(
    instrument.symbol,
    { interval: '5m', period1 },
    { validateResult: false }
  );

  const meta      = result.meta || {};
  const allQuotes = (result.quotes || []).filter(q => q != null && q.close != null);

  // Group candles by trading date and sort
  const byDate = {};
  allQuotes.forEach(q => {
    const d = new Date(q.date).toISOString().slice(0, 10);
    (byDate[d] = byDate[d] || []).push(q);
  });
  const sortedDates  = Object.keys(byDate).sort();
  const lastDate     = sortedDates[sortedDates.length - 1];
  const prevDate     = sortedDates[sortedDates.length - 2];
  const dayQuotes    = byDate[lastDate]  || [];
  const prevDayQuotes= byDate[prevDate]  || [];

  const chartPoints = dayQuotes.map(q => ({
    time:      new Date(q.date).toISOString(),
    price:     round2(q.close),
    timeLabel: toISTLabel(new Date(q.date)),
  }));

  const cur = meta.regularMarketPrice;
  // Use the last actual candle of the previous trading day as prevClose.
  // chartPreviousClose refers to before our period1 window (7 days ago), not yesterday.
  const prevClose = prevDayQuotes.length
    ? prevDayQuotes[prevDayQuotes.length - 1].close
    : (meta.chartPreviousClose ?? meta.previousClose ?? cur);
  const openPrice = dayQuotes.length ? round2(dayQuotes[0].open ?? dayQuotes[0].close) : round2(prevClose);
  const chg = (cur != null && prevClose != null) ? round2(cur - prevClose) : null;
  const pct = (cur != null && prevClose != null && prevClose !== 0)
    ? round2((cur - prevClose) / prevClose * 100)
    : null;

  return {
    name:           instrument.name,
    code:           instrument.code,
    symbol:         instrument.symbol,
    color:          instrument.color,
    currency:       instrument.currency,
    currentPrice:   round2(cur),
    openPrice,
    change:         chg,
    changePercent:  pct,
    dayHigh:        round2(meta.regularMarketDayHigh),
    dayLow:         round2(meta.regularMarketDayLow),
    volume:         meta.regularMarketVolume || 0,
    lastTradingDate: lastDate ?? null,
    chartPoints,
    lastUpdated:    new Date().toISOString(),
    trend: (pct ?? 0) > 0 ? 'bullish' : (pct ?? 0) < 0 ? 'bearish' : 'neutral',
  };
}

function placeholderChart(instrument) {
  return {
    name:          instrument.name,
    code:          instrument.code,
    symbol:        instrument.symbol,
    color:         instrument.color,
    currency:      instrument.currency,
    currentPrice:  null,
    openPrice:     null,
    change:        null,
    changePercent: null,
    dayHigh:       null,
    dayLow:        null,
    volume:        null,
    chartPoints:   [],
    lastUpdated:   new Date().toISOString(),
    trend:         'neutral',
    error:         'Data temporarily unavailable',
  };
}

module.exports = router;