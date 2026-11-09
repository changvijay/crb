const express = require('express');
const router = express.Router();
const globalIndicesService = require('../services/globalIndicesService');

/**
 * Shared handler — wraps each data-fetch call with timing, logging, error handling
 */
function wrapHandler(label, fetchFn) {
  return async (req, res) => {
    const startTime = Date.now();
    try {
      const data = await fetchFn(req);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      res.json({ success: true, data, meta: { responseTime: `${duration}s` } });
    } catch (error) {
      console.error(`[GLOBAL-INDICES] ${label} Error:`, error.message);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      res.status(500).json({ success: false, error: error.message, meta: { responseTime: `${duration}s` } });
    }
  };
}

// ─── Endpoints ──────────────────────────────────────────────────────────────────

/**
 * GET /api/global-indices
 * Returns the latest completed trading day data for ALL global indices, organized by region.
 */
router.get('/', wrapHandler('All Global Indices', () => globalIndicesService.fetchGlobalIndices()));

/**
 * GET /api/global-indices/symbols
 * Returns the list of all available symbols grouped by region.
 */
router.get('/symbols', (req, res) => {
  res.json({ success: true, data: globalIndicesService.getAvailableSymbols() });
});

/**
 * GET /api/global-indices/region/:region
 * Returns latest data for indices in a specific region.
 * e.g. /api/global-indices/region/India
 */
router.get('/region/:region', wrapHandler('Region Indices', (req) => {
  return globalIndicesService.fetchRegionIndices(req.params.region);
}));

/**
 * GET /api/global-indices/symbol/:symbol
 * Returns latest data for a single index symbol.
 * e.g. /api/global-indices/symbol/^GSPC
 */
router.get('/symbol/:symbol', wrapHandler('Single Index', (req) => {
  return globalIndicesService.fetchSingleIndex(req.params.symbol);
}));

/** * GET /api/global-indices/debug/test-symbol/:symbol
 * Debug endpoint to test a specific symbol with detailed logging
 */
router.get('/debug/test-symbol/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol;    
    const data = await globalIndicesService.fetchSingleIndex(symbol);
    res.json({ success: true, symbol, data, tested: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, symbol: req.params.symbol, error: error.message });
  }
});

/** * POST /api/global-indices/clear-cache
 * Force clear the cache.
 */
router.post('/clear-cache', (req, res) => {
  globalIndicesService.clearCache();
  res.json({ success: true, message: 'Global indices cache cleared' });
});

module.exports = router;
