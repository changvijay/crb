const express = require('express');
const router  = express.Router();
const svc     = require('../services/cryptoService');

function wrapHandler(label, fetchFn) {
  return async (req, res) => {
    const t0 = Date.now();
    try {
      const result = await fetchFn(req);
      const ms = Date.now() - t0;
      res.json({ success: true, ...result, meta: { responseTime: `${(ms / 1000).toFixed(2)}s` } });
    } catch (err) {
      console.error(`[CRYPTO] ${label} error:`, err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  };
}

// GET /api/crypto/markets
router.get('/markets',     wrapHandler('Markets',    () => svc.fetchCoinGeckoMarkets()));

// GET /api/crypto/trending
router.get('/trending',    wrapHandler('Trending',   () => svc.fetchTrending()));

// GET /api/crypto/gainers?count=25
router.get('/gainers',     wrapHandler('Gainers',    (req) => svc.fetchGainers(Number(req.query.count) || 25)));

// GET /api/crypto/losers?count=25
router.get('/losers',      wrapHandler('Losers',     (req) => svc.fetchLosers(Number(req.query.count) || 25)));

// GET /api/crypto/most-active?count=25
router.get('/most-active', wrapHandler('MostActive', (req) => svc.fetchMostActive(Number(req.query.count) || 25)));

// GET /api/crypto/most-volume?count=25
router.get('/most-volume', wrapHandler('MostVolume', (req) => svc.fetchMostVolume(Number(req.query.count) || 25)));

// GET /api/crypto/52week
router.get('/52week',      wrapHandler('52Week',     () => svc.fetch52WeekData()));

// GET /api/crypto/dashboard — all data in one shot
router.get('/dashboard',   wrapHandler('Dashboard',  () => svc.fetchDashboard()));

module.exports = router;
