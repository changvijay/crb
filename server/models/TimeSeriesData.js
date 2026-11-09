const mongoose = require('mongoose');

const TimeSeriesDataSchema = new mongoose.Schema({
  data: {
    day: [{
      date: String,           // YYYY-MM-DD
      fii: Number,
      dii: Number,
      netFlow: Number,
      timestamp: Date
    }],
    month: [{
      month: String,          // YYYY-MM
      fiiTotal: Number,
      diiTotal: Number,
      netFlowTotal: Number,
      avgFii: Number,
      avgDii: Number,
      dayCount: Number,
      lastUpdated: Date
    }],
    year: [{
      year: String,           // YYYY
      fiiTotal: Number,
      diiTotal: Number,
      netFlowTotal: Number,
      avgFii: Number,
      avgDii: Number,
      monthCount: Number,
      lastUpdated: Date
    }]
  },
  version: { type: String, default: "1.0", unique: true },
  lastUpdated: { type: Date, default: Date.now }
}, {
  timestamps: true,
  collection: 'FIIDIITimeSeries'
});

TimeSeriesDataSchema.index({ version: 1 });
TimeSeriesDataSchema.index({ lastUpdated: -1 });

module.exports = mongoose.model('TimeSeriesData', TimeSeriesDataSchema);