const mongoose = require('mongoose');

/**
 * Market Report Schema
 * 
 * Uses Mixed types to store the exact structure from AI output without transformation.
 * This ensures all fields (events, globalMarketSnapshot, etc.) are preserved exactly as generated.
 */

// Main Market Report Schema - Uses Mixed type to preserve exact AI output structure
const MarketDailyReportSchema = new mongoose.Schema({
  // Store the entire report object as-is (Mixed type = no schema enforcement)
  report: { type: mongoose.Schema.Types.Mixed, required: true },
  // Technical data from the technical service
  technicalData: { type: mongoose.Schema.Types.Mixed },
  // Generation metadata
  meta: { type: mongoose.Schema.Types.Mixed },
  generatedAt: { type: Date, default: Date.now },
  isPublished: { type: Boolean, default: true },
}, {
  timestamps: true,
  collection: 'MarketDailyReport',
  // Disable strict mode to allow any fields
  strict: false,
});

// Indexes for better query performance
MarketDailyReportSchema.index({ generatedAt: -1 });
MarketDailyReportSchema.index({ createdAt: -1 });
MarketDailyReportSchema.index({ isPublished: 1 });

module.exports = mongoose.model('MarketDailyReport', MarketDailyReportSchema);
