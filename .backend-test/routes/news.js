const express = require('express');
const router = express.Router();
const newsService = require('../services/newsService');

/**
 * GET /api/news/latest
 * Fetch latest stock market news from all available sources.
 * Returns raw news articles from the last 24 hours only.
 * Query params:
 *   - category: filter by category (optional)
 *   - limit: max articles to return (default: 100)
 */
router.get('/latest', async (req, res) => {
  const startTime = Date.now();

  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 200);
    const category = req.query.category || null;
    const newsData = await newsService.fetchAllNews();

    let articles = newsData.articles || [];

    // Filter by category if specified
    if (category && category !== 'all') {
      articles = articles.filter(
        (a) => a.category && a.category.toLowerCase() === category.toLowerCase()
      );
    }

    // Limit results
    articles = articles.slice(0, limit);

    // Extract unique categories for filter UI
    const allCategories = [
      ...new Set((newsData.articles || []).map((a) => a.category).filter(Boolean)),
    ].sort();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[News] Returned ${articles.length} articles in ${duration}s`);

    res.json({
      success: true,
      articles,
      categories: allCategories,
      meta: {
        totalFetched: newsData.articles?.length || 0,
        returned: articles.length,
        fetchedAt: newsData.fetchedAt,
        responseTime: `${duration}s`,
        sources: newsData.sources,
        errors: newsData.errors,
      },
    });
  } catch (error) {
    console.error('[News] Error:', error.message);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    res.status(500).json({
      success: false,
      error: error.message,
      meta: { responseTime: `${duration}s` },
    });
  }
});

/**
 * GET /api/news/live-markets
 * Fetch live market index data only (Nifty, S&P, Gold, etc.)
 */
router.get('/live-markets', async (req, res) => {
  try {
    const liveData = await newsService.fetchLiveIndexData();
    res.json({
      success: true,
      data: liveData,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
