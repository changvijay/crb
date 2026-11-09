const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const MarketReport = require('../models/MarketReport');
const BhavCopy = require('../models/BhavCopy');
const newsService = require('../services/newsService');
const aiService = require('../services/aiService');
const technicalService = require('../services/technicalService');
const nseService     = require('../services/nseService');
const bhavCopyService = require('../services/bhavCopyService');
const emailService = require('../services/emailService');
const { authMiddleware, login, logout } = require('../middleware/auth');
const TradeRecommendation = require('../models/TradeRecommendation');

/**
 * POST /api/admin/login
 * Admin login endpoint
 */
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({
        success: false,
        error: 'Password is required',
      });
    }
    
    const session = login(password);
    
    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Invalid password',
      });
    }
    
    res.json({
      success: true,
      token: session.token,
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    console.error('[Admin Login] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/admin/logout
 * Admin logout endpoint
 */
router.post('/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    logout(token);
  }
  res.json({ success: true, message: 'Logged out successfully' });
});

/**
 * POST /api/admin/generate-report
 * Generate and save a new market report (Admin Only)
 */
router.post('/generate-report', authMiddleware, async (req, res) => {
  const startTime = Date.now();
  console.log('[Admin Report] Report generation requested');
  const TOTAL_TIMEOUT = 180000;
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
    console.log('[Admin Report] Fetching financial news & technical data...');
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
    console.log(`[Admin Report] Data fetched in ${fetchDuration}s - ${newsData.articles.length} articles`);

    console.log(`[Admin Report] Starting AI analysis...`);
    const aiStartTime = Date.now();
    
    const report = await Promise.race([
      aiService.analyzeNews(newsData, technicalData),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('AI analysis timeout after 150 seconds')), 150000)
      )
    ]);
    
    const aiDuration = ((Date.now() - aiStartTime) / 1000).toFixed(1);
    console.log(`[Admin Report] AI analysis complete in ${aiDuration}s`);

    clearTimeout(timeoutId);
    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);

    const meta = {
      articlesAnalyzed: newsData.articles.length,
      eventsIdentified: report.events?.length || 0,
      generationTime: `${totalDuration}s`,
      newsErrors: newsData.errors,
      fetchTime: `${fetchDuration}s`,
      aiTime: `${aiDuration}s`,
    };

    // Save to MongoDB
    const newReport = new MarketReport({
      report,
      technicalData,
      meta,
      generatedAt: new Date(),
      isPublished: true,
    });

    const savedReport = await newReport.save();
    console.log(`[Admin Report] Saved to MongoDB with ID: ${savedReport._id}`);

    res.json({
      success: true,
      report,
      technicalData,
      meta,
      reportId: savedReport._id,
      generatedAt: savedReport.generatedAt,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('[Admin Report] Error:', error.message);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error.message,
        meta: { generationTime: `${duration}s` },
      });
    }
  }
});

/**
 * POST /api/admin/nse/price-band-hitters/sync
 * Fetch NSE price band hitters once from NSE and store them in MongoDB (Admin Only)
 */
router.post('/nse/price-band-hitters/sync', authMiddleware, async (req, res) => {
  try {
    console.log('[Admin NSE] Syncing price band hitters from NSE...');

    const data = await nseService.fetchAndStorePriceBandHitters();

    res.json({
      success: true,
      message: 'Price band hitters synced to MongoDB successfully',
      sync: {
        count: data.count,
        fetchedAt: data.fetchedAt,
        mongo: data.mongo,
      },
    });
  } catch (error) {
    console.error('[Admin NSE] Price band sync error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/admin/bhavcopy/status
 * Returns current BhavCopy system status: DB symbol count, temp files, latest date (Admin Only).
 */
router.get('/bhavcopy/status', authMiddleware, async (req, res) => {
  try {
    const TEMP_DIR = path.join(__dirname, '..', 'temp', 'BhavCopy');

    // Temp files
    let tempFiles = [];
    try {
      tempFiles = fs.readdirSync(TEMP_DIR)
        .filter(f => /^\d{8}\.json$/.test(f))
        .sort();
    } catch { /* temp dir doesn't exist yet */ }

    // DB stats
    const symbolCount = await BhavCopy.countDocuments();
    const latestDoc   = await BhavCopy.findOne({}, { date: 1, calculatedAt: 1 })
      .sort({ calculatedAt: -1 }).lean();

    res.json({
      success: true,
      status: {
        symbolsInDB:     symbolCount,
        tempFilesCount:  tempFiles.length,
        tempFilesNeeded: 60,
        mode:            tempFiles.length >= 60 ? 'incremental' : 'initial',
        oldestTempDate:  tempFiles.length ? tempFiles[0].replace('.json', '') : null,
        newestTempDate:  tempFiles.length ? tempFiles[tempFiles.length - 1].replace('.json', '') : null,
        latestCalcDate:  latestDoc?.date ? new Date(latestDoc.date).toISOString().split('T')[0] : null,
        lastCalculatedAt: latestDoc?.calculatedAt ?? null,
      },
    });
  } catch (error) {
    console.error('[Admin BhavCopy] Status error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/bhavcopy/sync
 * Download, process and store NSE BhavCopy data (Admin Only)
 */
router.post('/bhavcopy/sync', authMiddleware, async (req, res) => {
  try {
    console.log('[Admin BhavCopy] Starting BhavCopy sync...');
    const result = await bhavCopyService.runBhavCopySync();
    res.json({
      success: true,
      message: `BhavCopy sync complete (${result.mode} mode)`,
      result,
    });
  } catch (error) {
    console.error('[Admin BhavCopy] Sync error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/bhavcopy/reset
 * Drop entire BhavCopy collection and re-download 60 days from scratch (Admin Only).
 * Use when indicators are stale/null (e.g. after changing MAX_HISTORY_DAYS).
 */
router.post('/bhavcopy/reset', authMiddleware, async (req, res) => {
  try {
    console.log('[Admin BhavCopy] Full reset requested — dropping collection and resyncing...');
    const result = await bhavCopyService.resetBhavCopyData();
    res.json({
      success: true,
      message: `BhavCopy full reset complete. Downloaded ${result.totalSymbols} symbols across ${result.dates?.length || 0} dates.`,
      result,
    });
  } catch (error) {
    console.error('[Admin BhavCopy] Reset error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/reports
 * Get all reports with pagination (Admin Only)
 */
router.get('/reports', authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [reports, total] = await Promise.all([
      MarketReport.find()
        .sort({ generatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('_id report.reportTitle generatedAt meta.eventsIdentified isPublished createdAt'),
      MarketReport.countDocuments(),
    ]);

    console.log(`[Admin Reports] Found ${total} total reports, returning ${reports.length} reports for page ${page}`);

    res.json({
      success: true,
      reports: reports.map(r => ({
        _id: r._id,
        title: r.report?.reportTitle || 'Untitled Report',
        generatedAt: r.generatedAt,
        eventsCount: r.meta?.eventsIdentified || 0,
        isPublished: r.isPublished,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[Admin Reports] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/admin/debug
 * Debug endpoint to check system status (Admin Only)
 */
router.get('/debug', authMiddleware, async (req, res) => {
  try {
    const totalReports = await MarketReport.countDocuments();
    const publishedReports = await MarketReport.countDocuments({ isPublished: true });
    const recentReports = await MarketReport.find().sort({ generatedAt: -1 }).limit(5).select('_id report.reportTitle generatedAt');
    
    console.log(`[Admin Debug] System check - Total: ${totalReports}, Published: ${publishedReports}`);
    
    res.json({
      success: true,
      system: {
        totalReports,
        publishedReports,
        databaseConnected: true,
        timestamp: new Date().toISOString()
      },
      recentReports: recentReports.map(r => ({
        _id: r._id,
        title: r.report?.reportTitle || 'Untitled',
        generatedAt: r.generatedAt
      }))
    });
  } catch (error) {
    console.error('[Admin Debug] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      system: {
        databaseConnected: false,
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * GET /api/admin/debug/nse-status
 * NSE API status and fallback cache information (Admin Only)
 */
router.get('/debug/nse-status', authMiddleware, async (req, res) => {
  try {
    const fallbackStatus = nseService.getFallbackStatus();
    
    console.log('[Admin Debug NSE] Checking NSE API status and fallbacks');
    
    res.json({
      success: true,
      nseStatus: fallbackStatus,
      timestamp: new Date().toISOString(),
      recommendations: {
        circuitBreakers: fallbackStatus.criticalEndpoints.circuitBreakers === 'No fallback' 
          ? 'Circuit Breaker data may be missing - consider manual cache refresh'
          : 'Circuit Breaker fallback available',
        week52HighLow: fallbackStatus.criticalEndpoints.week52HighLow === 'No fallback'
          ? '52-week data may be missing - consider manual cache refresh'
          : '52-week fallback available'
      }
    });
  } catch (error) {
    console.error('[Admin Debug NSE] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/admin/debug/test-nse-endpoints
 * Test critical NSE endpoints to diagnose production issues (Admin Only)
 */
router.get('/debug/test-nse-endpoints', authMiddleware, async (req, res) => {
  try {
    console.log('[Admin Debug NSE] Testing critical NSE endpoints...');
    
    const testResults = await nseService.testCriticalEndpoints();
    
    res.json({
      success: true,
      testResults,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Admin Debug NSE] Endpoint test error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/admin/debug/clear-fallback-cache
 * Clear NSE fallback cache to force fresh data fetch (Admin Only)
 */
router.post('/debug/clear-fallback-cache', authMiddleware, async (req, res) => {
  try {
    console.log('[Admin Debug NSE] Clearing fallback cache...');
    
    nseService.clearFallbackCache();
    
    res.json({
      success: true,
      message: 'Fallback cache cleared successfully',
      timestamp: new Date().toISOString(),
      nextAction: 'Next API calls will attempt to fetch fresh data from NSE'
    });
  } catch (error) {
    console.error('[Admin Debug NSE] Cache clear error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/admin/debug/circuit-breaker-test
 * Test circuit breaker data specifically (Admin Only)
 */
router.get('/debug/circuit-breaker-test', authMiddleware, async (req, res) => {
  try {
    console.log('[Admin Debug NSE] Testing circuit breaker data fetch...');
    
    const circuitData = await nseService.fetchCircuitData();
    
    res.json({
      success: true,
      circuitData: {
        upperCircuitCount: circuitData.upperCircuit?.length || 0,
        lowerCircuitCount: circuitData.lowerCircuit?.length || 0,
        marketStatus: circuitData.marketStatus,
        errors: circuitData.errors || [],
        usingFallbackData: circuitData.usingFallbackData || false,
        fetchedAt: circuitData.fetchedAt
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Admin Debug NSE] Circuit breaker test error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/admin/debug/52week-test
 * Test 52-week high/low data specifically (Admin Only)
 */
router.get('/debug/52week-test', authMiddleware, async (req, res) => {
  try {
    console.log('[Admin Debug NSE] Testing 52-week high/low data fetch...');
    
    const weekData = await nseService.fetch52WeekHighLow();
    
    res.json({
      success: true,
      weekData: {
        highCount: weekData.high?.length || 0,
        lowCount: weekData.low?.length || 0,
        errors: weekData.errors || [],
        usingFallbackData: weekData.usingFallbackData || false,
        marketStatus: weekData.marketStatus,
        fetchedAt: weekData.fetchedAt
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Admin Debug NSE] 52-week test error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/admin/reports/:id
 * Get full report by ID (Admin Only)
 */
router.get('/reports/:id', authMiddleware, async (req, res) => {
  try {
    const reportId = req.params.id;
    
    // Validate ObjectId format
    if (!reportId || reportId.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(reportId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid report ID format',
        providedId: reportId
      });
    }

    console.log(`[Admin Report Detail] Fetching report: ${reportId}`);
    
    const report = await MarketReport.findById(reportId);
    
    if (!report) {
      console.log(`[Admin Report Detail] Report not found: ${reportId}`);
      return res.status(404).json({
        success: false,
        error: 'Report not found',
        reportId: reportId
      });
    }

    console.log(`[Admin Report Detail] Found report: ${report.report?.reportTitle || 'Untitled'}`);

    res.json({
      success: true,
      report: report.report,
      technicalData: report.technicalData,
      meta: report.meta,
      generatedAt: report.generatedAt,
      isPublished: report.isPublished,
      _id: report._id,
    });
  } catch (error) {
    console.error('[Admin Report Detail] Error:', error.message);
    console.error('[Admin Report Detail] Stack:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message,
      type: 'server_error'
    });
  }
});

/**
 * PUT /api/admin/reports/:id
 * Update an existing report (Admin Only)
 */

router.put('/reports/:id', authMiddleware, async (req, res) => {
  try {
    const { report, isPublished } = req.body;
    
    const existingReport = await MarketReport.findById(req.params.id);
    
    if (!existingReport) {
      return res.status(404).json({
        success: false,
        error: 'Report not found',
      });
    }

    // Update fields if provided
    if (report) {
      existingReport.report = { ...existingReport.report.toObject(), ...report };
    }
    if (typeof isPublished === 'boolean') {
      existingReport.isPublished = isPublished;
    }

    const updatedReport = await existingReport.save();

    res.json({
      success: true,
      message: 'Report updated successfully',
      reportId: updatedReport._id,
    });
  } catch (error) {
    console.error('[Admin Update Report] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * DELETE /api/admin/reports/:id
 * Delete a report (Admin Only)
 */
router.delete('/reports/:id', authMiddleware, async (req, res) => {
  try {
    const report = await MarketReport.findByIdAndDelete(req.params.id);
    
    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found',
      });
    }

    res.json({
      success: true,
      message: 'Report deleted successfully',
    });
  } catch (error) {
    console.error('[Admin Delete Report] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Debug endpoint to check server status
 */
router.get('/debug/status', (req, res) => {
  res.json({
    status: 'Server is running',
    timestamp: new Date().toISOString(),
    headers: req.headers,
    method: req.method
  });
});

/**
 * Debug endpoint - check if report exists and its structure
 */
router.get('/debug/reports/:id', authMiddleware, async (req, res) => {
  try {
    const reportId = req.params.id;
    console.log(`[Debug] Checking report: ${reportId}`);
    
    const report = await MarketReport.findById(reportId);
    if (!report) {
      return res.json({ exists: false, reportId });
    }
    
    const structure = {
      exists: true,
      reportId,
      hasReport: !!report.report,
      hasEvents: !!report.report?.events,
      eventCount: report.report?.events?.length || 0,
      events: report.report?.events?.map(e => ({ eventNumber: e.eventNumber, title: e.title?.substring(0, 30) })) || [],
      metaEventsCount: report.meta?.eventsIdentified || 0
    };
    
    console.log(`[Debug] Report structure:`, structure);
    res.json(structure);
  } catch (error) {
    console.error('[Debug] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/reports/:id/events
 * Get all events for a specific report (Admin Only)
 */
router.get('/reports/:id/events', authMiddleware, async (req, res) => {
  try {
    const reportId = req.params.id;
    
    // Validate ObjectId format
    if (!reportId || reportId.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(reportId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid report ID format',
        providedId: reportId
      });
    }

    console.log(`[Admin Get Events] Searching for report ID: ${reportId}`);
    
    const report = await MarketReport.findById(reportId).select('report.events _id report.reportTitle');
    
    if (!report) {
      console.log(`[Admin Get Events] Report not found: ${reportId}`);
      return res.status(404).json({
        success: false,
        error: 'Report not found',
        reportId: reportId
      });
    }

    console.log(`[Admin Get Events] Found report: ${report.report?.reportTitle || 'Untitled'}, Events: ${report.report?.events?.length || 0}`);

    res.json({
      success: true,
      events: report.report?.events || [],
      reportTitle: report.report?.reportTitle || 'Untitled Report'
    });
  } catch (error) {
    console.error('[Admin Get Events] Error:', error.message);
    console.error('[Admin Get Events] Stack:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message,
      type: 'server_error'
    });
  }
});

/**
 * POST /api/admin/reports/:id/events
 * Add a new event to a report (Admin Only)
 */
router.post('/reports/:id/events', authMiddleware, async (req, res) => {
  try {
    const reportId = req.params.id;
    
    console.log(`\n[Admin Add Event] === NEW REQUEST ===`);
    console.log(`[Admin Add Event] Report ID: ${reportId}`);
    console.log(`[Admin Add Event] Request body keys:`, Object.keys(req.body));
    console.log(`[Admin Add Event] Full request body:`, JSON.stringify(req.body, null, 2));
    
    // Validate ObjectId format
    if (!reportId || reportId.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(reportId)) {
      console.log(`[Admin Add Event] Invalid report ID format: ${reportId}`);
      return res.status(400).json({
        success: false,
        error: 'Invalid report ID format',
        providedId: reportId
      });
    }

    console.log(`[Admin Add Event] Looking for report in database...`);
    const report = await MarketReport.findById(reportId);
    
    if (!report) {
      console.log(`[Admin Add Event] Report not found: ${reportId}`);
      return res.status(404).json({
        success: false,
        error: 'Report not found',
        reportId: reportId
      });
    }

    console.log(`[Admin Add Event] Report found: ${report.report?.reportTitle || 'Untitled'}`);

    const { event } = req.body;
    if (!event) {
      console.log(`[Admin Add Event] No event data in request body`);
      console.log(`[Admin Add Event] Request body structure:`, req.body);
      return res.status(400).json({
        success: false,
        error: 'Event data is required - missing "event" property in request body',
        receivedKeys: Object.keys(req.body)
      });
    }

    console.log(`[Admin Add Event] Event data received:`, {
      title: event.title?.substring(0, 50) + '...',
      titleLength: event.title?.length,
      category: event.category,
      expectedImpact: event.expectedImpact,
      impactSeverity: event.impactSeverity,
      detailedSummaryLength: event.detailedSummary?.length
    });

    // Validate required fields with detailed logging
    const requiredFields = ['title', 'detailedSummary', 'expectedImpact', 'impactSeverity', 'category'];
    const missingFields = [];
    const fieldDetails = {};
    
    for (const field of requiredFields) {
      const value = event[field];
      const trimmedValue = typeof value === 'string' ? value.trim() : value;
      fieldDetails[field] = {
        provided: !!value,
        type: typeof value,
        length: typeof value === 'string' ? value.length : 'N/A',
        trimmedLength: typeof trimmedValue === 'string' ? trimmedValue.length : 'N/A',
        isEmpty: !trimmedValue
      };
      
      if (!trimmedValue) {
        missingFields.push(field);
      }
    }
    
    console.log(`[Admin Add Event] Field validation details:`, fieldDetails);
    
    if (missingFields.length > 0) {
      console.log(`[Admin Add Event] Missing required fields:`, missingFields);
      return res.status(400).json({
        success: false,
        error: `Missing or empty required fields: ${missingFields.join(', ')}`,
        missingFields: missingFields,
        fieldDetails: fieldDetails
      });
    }

    // Initialize report structure if needed
    console.log(`[Admin Add Event] Checking report structure...`);
    if (!report.report) {
      console.log(`[Admin Add Event] Initializing report object`);
      report.report = {};
    }
    if (!report.report.events) {
      console.log(`[Admin Add Event] Initializing events array`);
      report.report.events = [];
    }

    // Generate next event number
    const existingEvents = report.report.events || [];
    console.log(`[Admin Add Event] Existing events count: ${existingEvents.length}`);
    
    const eventNumbers = existingEvents.map(e => parseInt(e.eventNumber) || 0);
    console.log(`[Admin Add Event] Existing event numbers:`, eventNumbers);
    
    const maxEventNumber = eventNumbers.length > 0 ? Math.max(...eventNumbers) : 0;
    const newEventNumber = maxEventNumber + 1;
    
    console.log(`[Admin Add Event] Max existing event number: ${maxEventNumber}, New event number: ${newEventNumber}`);
    
    const newEvent = {
      eventNumber: newEventNumber,
      title: event.title.trim(),
      detailedSummary: event.detailedSummary.trim(),
      historicalComparison: event.historicalComparison?.trim() || '',
      verificationStatus: event.verificationStatus || 'Unverified',
      expectedImpact: event.expectedImpact,
      impactSeverity: event.impactSeverity,
      estimatedImpactPercent: event.estimatedImpactPercent?.trim() || 'TBD',
      affectedMarkets: Array.isArray(event.affectedMarkets) ? event.affectedMarkets : [],
      sourceReliability: event.sourceReliability || 'Medium',
      category: event.category,
      newsDate: event.newsDate?.trim() || new Date().toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      })
    };

    console.log(`[Admin Add Event] Created new event object:`, {
      eventNumber: newEvent.eventNumber,
      title: newEvent.title.substring(0, 50) + '...',
      category: newEvent.category,
      affectedMarketsCount: newEvent.affectedMarkets.length
    });

    // Add event to array
    report.report.events.push(newEvent);
    console.log(`[Admin Add Event] Added event to array. New total: ${report.report.events.length}`);
    
    // CRITICAL: Mark nested path as modified for Mongoose
    report.markModified('report.events');
    report.markModified('report');
    console.log(`[Admin Add Event] Marked nested paths as modified`);
    
    // Update meta count if it exists
    if (report.meta) {
      const oldCount = report.meta.eventsIdentified;
      report.meta.eventsIdentified = report.report.events.length;
      report.markModified('meta');
      console.log(`[Admin Add Event] Updated meta count: ${oldCount} -> ${report.meta.eventsIdentified}`);
    }

    // Save the report
    console.log(`[Admin Add Event] Attempting to save report...`);
    const savedReport = await report.save();
    console.log(`[Admin Add Event] Report saved successfully`);
    
    // VERIFICATION: Re-query the database to confirm changes
    console.log(`[Admin Add Event] Verifying changes in database...`);
    const verifyReport = await MarketReport.findById(reportId).select('report.events meta.eventsIdentified');
    const dbEventCount = verifyReport.report?.events?.length || 0;
    const dbMetaCount = verifyReport.meta?.eventsIdentified || 0;
    
    console.log(`[Admin Add Event] Database verification - Events: ${dbEventCount}, Meta: ${dbMetaCount}`);
    
    if (dbEventCount !== savedReport.report.events.length) {
      console.error(`[Admin Add Event] DATABASE INCONSISTENCY! Memory: ${savedReport.report.events.length}, DB: ${dbEventCount}`);
      return res.status(500).json({
        success: false,
        error: 'Database save failed - inconsistent state detected',
        memoryCount: savedReport.report.events.length,
        databaseCount: dbEventCount
      });
    }
    
    console.log(`[Admin Add Event] ✅ SUCCESS: Event added and verified. Total events: ${savedReport.report.events.length}`);

    res.json({
      success: true,
      message: 'Event added successfully',
      event: newEvent,
      totalEvents: savedReport.report.events.length
    });
  } catch (error) {
    console.error('[Admin Add Event] ❌ UNEXPECTED ERROR:', error.message);
    console.error('[Admin Add Event] Stack trace:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message,
      type: 'server_error'
    });
  }
});

/**
 * PUT /api/admin/reports/:id/events/:eventNumber
 * Update a specific event in a report (Admin Only)
 */
router.put('/reports/:id/events/:eventNumber', authMiddleware, async (req, res) => {
  try {
    const reportId = req.params.id;
    const eventNumber = parseInt(req.params.eventNumber);
    
    // Validate ObjectId format
    if (!reportId || reportId.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(reportId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid report ID format',
        providedId: reportId
      });
    }

    // Validate event number
    if (isNaN(eventNumber) || eventNumber <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid event number',
        providedEventNumber: req.params.eventNumber
      });
    }

    console.log(`[Admin Update Event] Updating event ${eventNumber} in report ${reportId}`);
    
    const report = await MarketReport.findById(reportId);
    
    if (!report) {
      console.log(`[Admin Update Event] Report not found: ${reportId}`);
      return res.status(404).json({
        success: false,
        error: 'Report not found',
        reportId: reportId
      });
    }

    if (!report.report?.events || !Array.isArray(report.report.events)) {
      return res.status(404).json({
        success: false,
        error: 'No events found in this report',
        reportId: reportId
      });
    }

    const eventIndex = report.report.events.findIndex(e => parseInt(e.eventNumber) === eventNumber);
    if (eventIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Event not found',
        eventNumber: eventNumber,
        availableEvents: report.report.events.map(e => ({
          eventNumber: e.eventNumber,
          title: e.title
        }))
      });
    }

    const { event } = req.body;
    if (!event) {
      return res.status(400).json({
        success: false,
        error: 'Event data is required',
      });
    }

    console.log(`[Admin Update Event] Found event at index ${eventIndex}, updating...`);

    // Update the event while preserving eventNumber
    const updatedEvent = {
      ...report.report.events[eventIndex].toObject(),
      ...event,
      eventNumber: eventNumber // Ensure eventNumber doesn't change
    };

    report.report.events[eventIndex] = updatedEvent;
    
    // CRITICAL: Mark nested path as modified for Mongoose
    report.markModified('report.events');
    report.markModified('report');
    
    const savedReport = await report.save();
    
    // VERIFICATION: Re-query the database to confirm changes
    console.log(`[Admin Update Event] Verifying changes in database...`);
    const verifyReport = await MarketReport.findById(reportId).select('report.events');
    const dbEvent = verifyReport.report?.events?.find(e => parseInt(e.eventNumber) === eventNumber);
    
    if (!dbEvent || dbEvent.title !== updatedEvent.title) {
      console.error(`[Admin Update Event] DATABASE INCONSISTENCY! Event not properly updated in DB`);
      throw new Error('Database save failed - event update not persisted');
    }

    console.log(`[Admin Update Event] Event ${eventNumber} updated successfully`);

    res.json({
      success: true,
      message: 'Event updated successfully',
      event: updatedEvent,
    });
  } catch (error) {
    console.error('[Admin Update Event] Error:', error.message);
    console.error('[Admin Update Event] Stack:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message,
      type: 'server_error'
    });
  }
});

/**
 * DELETE /api/admin/reports/:id/events/:eventNumber
 * Delete a specific event from a report (Admin Only)
 */
router.delete('/reports/:id/events/:eventNumber', authMiddleware, async (req, res) => {
  try {
    const reportId = req.params.id;
    const eventNumberParam = req.params.eventNumber;
    const eventNumber = parseInt(eventNumberParam);
    
    console.log(`[Admin Delete Event] Request to delete event ${eventNumberParam} from report ${reportId}`);
    
    // Validate ObjectId format
    if (!reportId || reportId.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(reportId)) {
      console.log(`[Admin Delete Event] Invalid report ID format: ${reportId}`);
      return res.status(400).json({
        success: false,
        error: 'Invalid report ID format',
        providedId: reportId
      });
    }

    // Validate event number
    if (isNaN(eventNumber) || eventNumber <= 0) {
      console.log(`[Admin Delete Event] Invalid event number: ${eventNumberParam}`);
      return res.status(400).json({
        success: false,
        error: 'Invalid event number',
        providedEventNumber: eventNumberParam
      });
    }

    console.log(`[Admin Delete Event] Looking for report: ${reportId}`);
    const report = await MarketReport.findById(reportId);
    
    if (!report) {
      console.log(`[Admin Delete Event] Report not found: ${reportId}`);
      return res.status(404).json({
        success: false,
        error: 'Report not found',
        reportId: reportId
      });
    }

    console.log(`[Admin Delete Event] Report found: ${report.report?.reportTitle || 'Untitled'}`);

    if (!report.report?.events || !Array.isArray(report.report.events)) {
      console.log(`[Admin Delete Event] No events array found in report ${reportId}`);
      return res.status(404).json({
        success: false,
        error: 'No events found in this report',
        reportId: reportId
      });
    }

    console.log(`[Admin Delete Event] Report has ${report.report.events.length} events`);
    
    // Log all event numbers for debugging
    const eventNumbers = report.report.events.map(e => {
      const num = parseInt(e.eventNumber);
      console.log(`[Admin Delete Event] Event: number=${e.eventNumber} (${typeof e.eventNumber}), parsed=${num}, title="${e.title?.substring(0, 30)}..."`);
      return num;
    });
    
    console.log(`[Admin Delete Event] All event numbers: ${eventNumbers.join(', ')}`);
    console.log(`[Admin Delete Event] Looking for event number: ${eventNumber} (${typeof eventNumber})`);

    // Find the event to delete
    let eventIndex = -1;
    for (let i = 0; i < report.report.events.length; i++) {
      const currentEventNum = parseInt(report.report.events[i].eventNumber);
      console.log(`[Admin Delete Event] Checking index ${i}: ${currentEventNum} === ${eventNumber}? ${currentEventNum === eventNumber}`);
      if (currentEventNum === eventNumber) {
        eventIndex = i;
        break;
      }
    }
    
    if (eventIndex === -1) {
      console.log(`[Admin Delete Event] Event ${eventNumber} not found in report ${reportId}`);
      return res.status(404).json({
        success: false,
        error: 'Event not found',
        eventNumber: eventNumber,
        availableEvents: report.report.events.map(e => ({
          eventNumber: parseInt(e.eventNumber),
          title: e.title
        }))
      });
    }

    const deletedEvent = report.report.events[eventIndex];
    console.log(`[Admin Delete Event] Found event at index ${eventIndex}: "${deletedEvent.title}" (Event #${deletedEvent.eventNumber})`);

    // Remove the event
    const removedEvent = report.report.events.splice(eventIndex, 1)[0];
    console.log(`[Admin Delete Event] Removed event: ${removedEvent.title}`);
    
    // CRITICAL: Mark nested path as modified for Mongoose
    report.markModified('report.events');
    report.markModified('report');
    
    // Update the meta count if it exists
    if (report.meta && typeof report.meta.eventsIdentified === 'number') {
      report.meta.eventsIdentified = report.report.events.length;
      console.log(`[Admin Delete Event] Updated meta count to: ${report.meta.eventsIdentified}`);
      report.markModified('meta');
    }

    // Save the report
    console.log(`[Admin Delete Event] Saving report with ${report.report.events.length} remaining events`);
    try {
      const savedReport = await report.save();
      console.log(`[Admin Delete Event] Report saved successfully. Final event count: ${savedReport.report.events.length}`);
      
      // VERIFICATION: Re-query the database to confirm changes
      console.log(`[Admin Delete Event] Verifying changes in database...`);
      const verifyReport = await MarketReport.findById(reportId).select('report.events meta.eventsIdentified');
      const dbEventCount = verifyReport.report?.events?.length || 0;
      const dbMetaCount = verifyReport.meta?.eventsIdentified || 0;
      
      console.log(`[Admin Delete Event] Database verification - Events: ${dbEventCount}, Meta: ${dbMetaCount}`);
      
      if (dbEventCount !== report.report.events.length) {
        console.error(`[Admin Delete Event] DATABASE INCONSISTENCY! Memory: ${report.report.events.length}, DB: ${dbEventCount}`);
        throw new Error('Database save failed - inconsistent state detected');
      }
      
    } catch (saveError) {
      console.error(`[Admin Delete Event] Save error:`, saveError.message);
      throw saveError;
    }

    res.json({
      success: true,
      message: 'Event deleted successfully',
      deletedEvent: {
        eventNumber: parseInt(deletedEvent.eventNumber),
        title: deletedEvent.title
      },
      remainingEvents: report.report.events.length
    });
  } catch (error) {
    console.error('[Admin Delete Event] Unexpected error:', error.message);
    console.error('[Admin Delete Event] Stack:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message,
      type: 'server_error'
    });
  }
});

/**
 * PATCH /api/admin/reports/:id/publish
 * Toggle publish status (Admin Only)
 */
router.patch('/reports/:id/publish', authMiddleware, async (req, res) => {
  try {
    const report = await MarketReport.findById(req.params.id);
    
    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found',
      });
    }

    report.isPublished = !report.isPublished;
    await report.save();

    res.json({
      success: true,
      message: `Report ${report.isPublished ? 'published' : 'unpublished'} successfully`,
      isPublished: report.isPublished,
    });
  } catch (error) {
    console.error('[Admin Toggle Publish] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ---------------------------------------------------------------------------
// Trade Recommendations
// ---------------------------------------------------------------------------

/**
 * POST /api/admin/trade-recommendations
 * Create a new trade recommendation.
 * Returns 409 if an OPEN trade for the same symbol already exists.
 */
router.post('/trade-recommendations', authMiddleware, async (req, res) => {
  try {
    const {
      symbol, entryPrice, exitPrice, ltp, stopLoss, upsidePotential,
      status, tradeType, term, reference, addedBy, addedDate,
      breakoutType, reason, timeline, visible_status,
    } = req.body;

    // --- Required field validation ---
    const missing = [];
    if (!symbol) missing.push('symbol');
    if (entryPrice === undefined || entryPrice === null || entryPrice === '') missing.push('entryPrice');
    if (exitPrice === undefined || exitPrice === null || exitPrice === '') missing.push('exitPrice');
    if (ltp === undefined || ltp === null || ltp === '') missing.push('ltp');
    if (stopLoss === undefined || stopLoss === null || stopLoss === '') missing.push('stopLoss');
    if (upsidePotential === undefined || upsidePotential === null || upsidePotential === '') missing.push('upsidePotential');
    if (!tradeType) missing.push('tradeType');
    if (!term) missing.push('term');
    if (!reason) missing.push('reason');

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missing.join(', ')}`,
      });
    }

    // --- Enum validation ---
    const validStatuses = ['OPEN', 'CLOSED', 'PARTIAL', 'CANCELLED', 'WATCHLIST'];
    const validTradeTypes = ['BUY', 'SELL'];
    const validTerms = ['SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM', 'INTRADAY'];
    const validVisible = ['VIEW_TO_ALL', 'PRO_MEMBER', 'PRO_PLUS_MEMBER'];

    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: `Invalid status: ${status}` });
    }
    if (!validTradeTypes.includes(tradeType)) {
      return res.status(400).json({ success: false, error: `Invalid tradeType: ${tradeType}` });
    }
    if (!validTerms.includes(term)) {
      return res.status(400).json({ success: false, error: `Invalid term: ${term}` });
    }
    if (visible_status && !validVisible.includes(visible_status)) {
      return res.status(400).json({ success: false, error: `Invalid visible_status: ${visible_status}` });
    }

    // --- Duplicate guard: same symbol + OPEN status ---
    const effectiveStatus = status || 'OPEN';
    if (effectiveStatus === 'OPEN') {
      const existing = await TradeRecommendation.findOne({
        symbol: symbol.trim().toUpperCase(),
        status: 'OPEN',
      }).lean();
      if (existing) {
        return res.status(409).json({
          success: false,
          error: `An OPEN trade recommendation for ${symbol.toUpperCase()} already exists. Close it before adding a new one.`,
        });
      }
    }

    const doc = new TradeRecommendation({
      symbol: symbol.trim().toUpperCase(),
      entryPrice: Number(entryPrice),
      exitPrice: Number(exitPrice),
      ltp: Number(ltp),
      stopLoss: Number(stopLoss),
      upsidePotential: Number(upsidePotential),
      status: effectiveStatus,
      tradeType,
      term,
      reference: reference || '',
      addedBy: {
        userId: (addedBy && addedBy.userId) ? addedBy.userId : '',
        name: (addedBy && addedBy.name) ? addedBy.name : '',
      },
      addedDate: addedDate ? new Date(addedDate) : new Date(),
      breakoutType: Array.isArray(breakoutType) ? breakoutType : [],
      reason,
      timeline: Array.isArray(timeline) ? timeline : [],
      visible_status: visible_status || 'VIEW_TO_ALL',
    });

    const saved = await doc.save();

    console.log(`[TradeReco] Created: ${saved.symbol} ${saved.tradeType} @ ${saved.entryPrice}`);

    return res.status(201).json({ success: true, data: saved });
  } catch (error) {
    console.error('[TradeReco POST] Error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/trade-recommendations
 * Paginated list sorted by createdAt desc.
 * Query params: page (default 1), limit (default 20)
 */
router.get('/trade-recommendations', authMiddleware, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      TradeRecommendation.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      TradeRecommendation.countDocuments(),
    ]);

    return res.json({
      success: true,
      data,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('[TradeReco GET] Error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/email/send-weekly
 * Trigger weekly broadcast for unsent recommendations (Admin Only)
 */
router.post('/email/send-weekly', authMiddleware, async (req, res) => {
  try {
    console.log('[Admin Email] Triggering weekly recommendation broadcast...');
    const summary = await emailService.sendWeeklyUnsentRecommendations();
    return res.json({ success: true, summary });
  } catch (error) {
    console.error('[Admin Email] Weekly send error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});
router.delete('/trade-recommendations/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await TradeRecommendation.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Recommendation not found.' });
    }
    console.log(`[TradeReco] Deleted: ${deleted.symbol} (${id})`);
    return res.json({ success: true });
  } catch (error) {
    console.error('[TradeReco DELETE] Error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/trade-recommendations/sync-prices
 * Syncs LTP of all OPEN trade recommendations from the latest BhavCopy data.
 * Marks status SUCCESS if day high > exitPrice, FAILED if day low < stopLoss.
 */
router.post('/trade-recommendations/sync-prices', authMiddleware, async (req, res) => {
  try {
    console.log('[TradeReco Sync] Starting BhavCopy price sync...');
    const result = await bhavCopyService.syncRecommendationsWithBhavCopy();

    console.log('[TradeReco Sync] Refreshing advisor recommendation stats...');
    const advisorStats = await bhavCopyService.refreshAdvisorRecommendationStats();

    const successCount = result.updated.filter(u => u.newStatus === 'SUCCESS').length;
    const failedCount  = result.updated.filter(u => u.newStatus === 'FAILED').length;
    const ltpOnly      = result.updated.filter(u => u.newStatus === 'OPEN').length;

    return res.json({
      success:      true,
      dateStr:      result.dateStr,
      totalOpen:    result.totalOpen,
      updated:      result.updated.length,
      successCount,
      failedCount,
      ltpOnly,
      notFound:     result.notFound,
      advisorStats,
      details:      result.updated,
    });
  } catch (error) {
    console.error('[TradeReco Sync] Error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
