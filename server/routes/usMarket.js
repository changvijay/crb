const express = require('express');
const router = express.Router();
const svc = require('../services/usMarketService');

function wrapHandler(label, fetchFn) {
  return async (req, res) => {
    const t0 = Date.now();
    try {
      const result = await fetchFn(req);
      const ms = Date.now() - t0;
      res.json({ success: true, ...result, meta: { responseTime: `${(ms / 1000).toFixed(2)}s` } });
    } catch (err) {
      console.error(`[US-MARKET] ${label} error:`, err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  };
}

// GET /api/us-market/indices
router.get('/indices', wrapHandler('Indices', () => svc.fetchUSIndices()));

// GET /api/us-market/gainers?count=25
router.get('/gainers', wrapHandler('Gainers', (req) => svc.fetchGainers(Number(req.query.count) || 25)));

// GET /api/us-market/losers?count=25
router.get('/losers', wrapHandler('Losers', (req) => svc.fetchLosers(Number(req.query.count) || 25)));

// GET /api/us-market/most-active?count=25
router.get('/most-active', wrapHandler('MostActive', (req) => svc.fetchMostActive(Number(req.query.count) || 25)));

// GET /api/us-market/undervalued?count=20
router.get('/undervalued', wrapHandler('Undervalued', (req) => svc.fetchUndervalued(Number(req.query.count) || 20)));

// GET /api/us-market/52week
router.get('/52week', wrapHandler('52Week', () => svc.fetch52WeekData()));

// GET /api/us-market/heatmap
router.get('/heatmap', wrapHandler('Heatmap', () => svc.fetchHeatmapData()));

// GET /api/us-market/dashboard  — all data in one shot
router.get('/dashboard', wrapHandler('Dashboard', () => svc.fetchDashboard()));

module.exports = router;
