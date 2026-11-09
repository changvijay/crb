const express = require('express');
const router = express.Router();
const MarketReport = require('../models/MarketReport');

/**
 * GET /api/reports/recent
 * Fetches only the last 7 days of published reports from MongoDB
 * Sorted by generatedAt in descending order
 */
router.get('/recent', async (req, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const reports = await MarketReport.find({
      generatedAt: { $gte: sevenDaysAgo },
      isPublished: true,
    })
      .sort({ generatedAt: -1 })
      .select('report technicalData meta generatedAt');

    if (reports.length === 0) {
      return res.json({
        success: true,
        hasReports: false,
        message: 'No reports available for the last 7 days',
        reports: [],
      });
    }

    // Return frontend-friendly response
    const formattedReports = reports.map(r => ({
      id: r._id,
      title: r.report?.reportTitle || 'Daily Market Report',
      generatedAt: r.generatedAt,
      report: r.report,
      technicalData: r.technicalData,
      meta: r.meta,
    }));

    res.json({
      success: true,
      hasReports: true,
      count: reports.length,
      reports: formattedReports,
      // Also provide the latest report separately for easy access
      latestReport: formattedReports[0] || null,
    });
  } catch (error) {
    console.error('[Reports Recent] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/reports/latest
 * Get only the most recent published report
 */
router.get('/latest', async (req, res) => {
  try {
    const report = await MarketReport.findOne({ isPublished: true })
      .sort({ generatedAt: -1 })
      .select('report technicalData meta generatedAt');

    if (!report) {
      return res.json({
        success: true,
        hasReport: false,
        message: 'No reports available',
      });
    }

    res.json({
      success: true,
      hasReport: true,
      report: report.report,
      technicalData: report.technicalData,
      meta: report.meta,
      generatedAt: report.generatedAt,
    });
  } catch (error) {
    console.error('[Reports Latest] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/reports/:id
 * Get a specific published report by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const report = await MarketReport.findOne({
      _id: req.params.id,
      isPublished: true,
    }).select('report technicalData meta generatedAt');

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found or not published',
      });
    }

    res.json({
      success: true,
      report: report.report,
      technicalData: report.technicalData,
      meta: report.meta,
      generatedAt: report.generatedAt,
    });
  } catch (error) {
    console.error('[Report Detail] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
