const express = require('express');
const router = express.Router();
const stockDataService = require('../services/StockdataService');
const DEFAULT_REPORT_TYPE = "consolidated"; // tried first; falls back to "standalone" automatically

/**
 * GET /api/stock/:symbol
 * Optional query param: ?reportType=consolidated|standalone (default: consolidated)
 */
router.get("/stock/:symbol", async (req, res) => {
  const symbol = (req.params.symbol || "").trim().toUpperCase();
  const reportType = (DEFAULT_REPORT_TYPE).toLowerCase();
 
  if (!symbol) {
    return res.status(400).json({ error: "Stock symbol is required." });
  }
  if (!["consolidated", "standalone"].includes(reportType)) {
    return res.status(400).json({ error: "reportType must be 'consolidated' or 'standalone'." });
  }
 
  try {
    const result = await stockDataService.getStockData(symbol, reportType);
    return res.json(result);
  } catch (err) {
    return res.status(502).json({
      symbol,
      error: `Failed to fetch/parse data: ${err.message}`,
    });
  }
});
 
/**
 * GET /api/stocks?symbols=TCS,INFY,WIPRO
 * Batch endpoint — fetches multiple symbols sequentially (rate-limit friendly).
 */
router.get("/stocks", async (req, res) => {
  const symbolsParam = req.query.symbols;
  const reportType = (req.query.reportType || DEFAULT_REPORT_TYPE).toLowerCase();
 
  if (!symbolsParam) {
    return res.status(400).json({ error: "Provide ?symbols=SYM1,SYM2,..." });
  }
 
  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
 
  const results = [];
  for (const symbol of symbols) {
    try {
      const data = await stockDataService.getStockData(symbol, reportType);
      results.push(data);
    } catch (err) {
      results.push({ symbol, error: `Failed to fetch/parse data: ${err.message}` });
    }
    // small delay to avoid rate-limiting screener.in
    await new Promise((r) => setTimeout(r, 1200));
  }
 
  return res.json({ count: results.length, results });
});

module.exports = router;
