const express = require('express');
const router = express.Router();
const newsService = require('../services/newsService');
const aiService = require('../services/aiService');
const technicalService = require('../services/technicalService');

/**
 * GET /api/technical/7day-chart
 * Returns last 7 trading days of close price, SMA 20, EMA 9, EMA 21
 * for chart visualization
 */
router.get('/technical/7day-chart', async (req, res) => {
  const startTime = Date.now();
  try {
    const data = await technicalService.getLast7DaysIndicators();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    res.json({ success: true, ...data, meta: { responseTime: `${duration}s` } });
  } catch (error) {
    console.error('[Technical] 7-day chart error:', error.message);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    res.status(500).json({ success: false, error: error.message, meta: { responseTime: `${duration}s` } });
  }
});

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    provider: process.env.AI_PROVIDER || 'gemini',
    hasNewsApiKey: !!(process.env.NEWS_API_KEY && process.env.NEWS_API_KEY !== 'your_newsapi_key_here'),
    hasAiKey: !!(
      (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') ||
      (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY !== 'your_openrouter_api_key_here')
    ),
  });
});

/**
 * POST /api/generate-report
 * Fetches latest news and generates AI analysis report
 */
router.post('/generate-report', async (req, res) => {
  const startTime = Date.now();
  
  // Set a global timeout for the entire operation
  const TOTAL_TIMEOUT = 180000; // 3 minutes max total time
  const timeoutId = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({
        success: false,
        error: 'Report generation timeout after 3 minutes',
        suggestion: 'The AI service is taking longer than usual. Try again in a few minutes.',
      });
    }
  }, TOTAL_TIMEOUT);

  try {
    // Step 1: Fetch news + technical data in parallel with timeout
    const fetchStartTime = Date.now();
    
    const [newsData, technicalData] = await Promise.race([
      Promise.all([
        newsService.fetchAllNews(),
        technicalService.getFullAnalysis(),
      ]),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Data fetching timeout after 90 seconds')), 90000)
      )
    ]);
    
    const fetchDuration = ((Date.now() - fetchStartTime) / 1000).toFixed(1);
    
    // Step 2: AI Analysis with timeout
    const aiStartTime = Date.now();
    
    const report = await Promise.race([
      aiService.analyzeNews(newsData, technicalData),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('AI analysis timeout after 90 seconds')), 90000)
      )
    ]);
    
    const aiDuration = ((Date.now() - aiStartTime) / 1000).toFixed(1);

    clearTimeout(timeoutId);
    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);

    res.json({
      success: true,
      report,
      technicalData,
      meta: {
        articlesAnalyzed: newsData.articles.length,
        eventsIdentified: report.events?.length || 0,
        generationTime: `${totalDuration}s`,
        newsErrors: newsData.errors,
        fetchTime: `${fetchDuration}s`,
        aiTime: `${aiDuration}s`,
      },
    });
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('[Report] Error:', error.message);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error.message,
        meta: { generationTime: `${duration}s` },
        suggestion: getSuggestion(error.message),
      });
    }
  }
});

/**
 * GET /api/test-news
 * Test endpoint to preview fetched news without AI analysis
 */
router.get('/test-news', async (req, res) => {
  try {
    const newsData = await newsService.fetchAllNews();
    res.json({ success: true, ...newsData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

function getSuggestion(errorMessage) {
  if (errorMessage.includes('GEMINI_API_KEY')) {
    return 'Get a free Gemini API key at https://aistudio.google.com/apikey and add it to your .env file.';
  }
  if (errorMessage.includes('OPENROUTER_API_KEY')) {
    return 'Get an OpenRouter API key at https://openrouter.ai and add it to your .env file.';
  }
  if (errorMessage.includes('rate limit')) {
    return 'You\'ve hit the API rate limit. Wait 60 seconds and try again.';
  }
  if (errorMessage.includes('timeout')) {
    return 'The request timed out. This usually means the AI service is overloaded or your internet connection is slow. Wait a minute and try again.';
  }
  if (errorMessage.includes('Could not fetch news')) {
    return 'Check your internet connection. News fetching requires network access.';
  }
  if (errorMessage.includes('Data fetching timeout')) {
    return 'News or technical data sources are responding slowly. Try again in a few minutes.';
  }
  if (errorMessage.includes('AI analysis timeout')) {
    return 'The AI service is taking longer than usual. This may be due to high demand or complex analysis. Try again in a few minutes.';
  }
  return 'Check the server logs for more details. If the problem persists, try restarting the server.';
}

module.exports = router;
