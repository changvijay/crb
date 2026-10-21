const express = require('express');
const router = express.Router();
const nseService      = require('../services/nseService');
const bhavCopyService = require('../services/bhavCopyService');

/**
 * Shared handler — wraps each data-fetch call with timing, logging, error handling
 */
function wrapHandler(label, fetchFn) {
  return async (req, res) => {
    const startTime = Date.now();
    try {
      const data = await fetchFn();
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      res.json({ success: true, ...data, meta: { responseTime: `${duration}s` } });
    } catch (error) {
      console.error(`[NSE] ${label} Error:`, error.message);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      res.status(500).json({ success: false, error: error.message, meta: { responseTime: `${duration}s` } });
    }
  };
}

// ─── Endpoints ──────────────────────────────────────────────────────────────────

/** GET /api/nse/all — Combined dashboard data (all categories in parallel) */
router.get('/all', async (req, res) => {
  const startTime = Date.now();
  try {
    const data = await nseService.getAllNSEData();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    res.json({ success: true, ...data, meta: { responseTime: `${duration}s` } });
  } catch (error) {
    console.error('[NSE] Error:', error.message);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    res.status(500).json({ success: false, error: error.message, meta: { responseTime: `${duration}s` } });
  }
});

/** GET /api/nse/ipo — IPO data from InvestorGain */
router.get('/ipo', wrapHandler('IPO', () => nseService.fetchIPOData()));

/** GET /api/nse/gainers-losers — Top gainers and losers */
router.get('/gainers-losers', wrapHandler('Gainers/Losers', () => nseService.fetchGainersLosers()));

/** GET /api/nse/circuits — Circuit breaker data only */
router.get('/circuits', wrapHandler('Circuits', () => nseService.fetchCircuitData()));

/** GET /api/nse/price-band-hitters — Read stored NSE price band hitters from MongoDB with cache */
router.get('/price-band-hitters', wrapHandler('Price Band Hitters', () => nseService.getPriceBandHittersFromMongo()));

/** GET /api/nse/index-performance — Indian index performances */
router.get('/index-performance', wrapHandler('Index Performance', () => nseService.fetchIndexPerformance()));

/** GET /api/nse/52week — 52-week high/low stocks */
router.get('/52week', wrapHandler('52-Week H/L', () => nseService.fetch52WeekHighLow()));

/** GET /api/nse/penny-stocks — Penny stocks with intraday charts */
router.get('/penny-stocks', wrapHandler('Penny Stocks', () => nseService.fetchPennyStocks()));

/** GET /api/nse/fii-dii — FII/DII activity */
router.get('/fii-dii', wrapHandler('FII/DII', () => nseService.fetchFIIDIIData()));

/** GET /api/nse/world-indices — World indices */
router.get('/world-indices', wrapHandler('World Indices', () => nseService.fetchWorldIndices()));

/** GET /api/nse/most-active — Most Active & Recovery stocks */
router.get('/most-active', wrapHandler('Most Active', () => nseService.fetchMostActiveData()));

/** GET /api/nse/bhavcopy — Latest BhavCopy data with technical indicators */
router.get('/bhavcopy', wrapHandler('BhavCopy', () => bhavCopyService.getBhavCopyData()));

/** GET /api/nse/heatmap — Stock heatmap data grouped by sector */
router.get('/heatmap', wrapHandler('Stock Heatmap', () => nseService.fetchHeatmapData()));

/** GET /api/nse/r360-indices — NSE/BSE indices via Research360 (with intraday charts) */
router.get('/r360-indices', async (req, res) => {
  const startTime = Date.now();
  const exchange = String(req.query.exchange || 'NSE').toUpperCase().replace(/[^A-Z]/g, '');
  if (!['NSE', 'BSE'].includes(exchange)) {
    return res.status(400).json({ success: false, error: 'Invalid exchange. Use NSE or BSE.' });
  }
  try {
    const data = await nseService.fetchR360Indices(exchange);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    res.json({ success: true, ...data, meta: { responseTime: `${duration}s` } });
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    res.status(500).json({ success: false, error: error.message, meta: { responseTime: `${duration}s` } });
  }
});

/** POST /api/nse/clear-cache — Force clear all caches */
router.post('/clear-cache', (req, res) => {
  nseService.clearCache();
  res.json({ success: true, message: 'All caches cleared' });
});

/** GET /api/nse/index-comparison — Historical comparison for Indian indices via Yahoo Finance */
router.get('/index-comparison', async (req, res) => {
  const startTime = Date.now();
  try {
    // Parse & validate indices param
    const rawIndices = String(req.query.indices || '');
    const indices = rawIndices
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 8); // max 8 indices

    if (indices.length === 0) {
      return res.status(400).json({ success: false, error: 'Provide at least one index via ?indices=NIFTY 50,SENSEX' });
    }

    // Parse & validate days param (30–730)
    const days = Math.min(730, Math.max(30, parseInt(req.query.days) || 365));

    const data = await nseService.fetchIndexComparison(indices, days);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    res.json({
      success: true,
      data,
      availableIndices: Object.keys(nseService.INDEX_TICKER_MAP || {}),
      days,
      meta: { responseTime: `${duration}s` },
    });
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error('[NSE] index-comparison error:', error.message);
    res.status(500).json({ success: false, error: error.message, meta: { responseTime: `${duration}s` } });
  }
});

module.exports = router;
