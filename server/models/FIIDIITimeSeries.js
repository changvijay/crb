const mongoose = require('mongoose');

const DayRecordSchema = new mongoose.Schema({
  date: { type: String, required: true },
  fii: { type: Number, required: true },
  dii: { type: Number, required: true },
  netFlow: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

const MonthRecordSchema = new mongoose.Schema({
  month: { type: String, required: true }, // Format: "2026-03"
  fiiTotal: { type: Number, required: true },
  diiTotal: { type: Number, required: true },
  netFlowTotal: { type: Number, required: true },
  avgFii: { type: Number, required: true },
  avgDii: { type: Number, required: true },
  dayCount: { type: Number, required: true }
}, { _id: false });

const YearRecordSchema = new mongoose.Schema({
  year: { type: String, required: true }, // Format: "2026"
  fiiTotal: { type: Number, required: true },
  diiTotal: { type: Number, required: true },
  netFlowTotal: { type: Number, required: true },
  avgFii: { type: Number, required: true },
  avgDii: { type: Number, required: true },
  monthCount: { type: Number, required: true }
}, { _id: false });

const FIIDIITimeSeriesSchema = new mongoose.Schema({
  version: { 
    type: String, 
    default: '1.0',
    index: true 
  },
  data: {
    day: [DayRecordSchema],
    month: [MonthRecordSchema],
    year: [YearRecordSchema]
  },
  lastUpdated: { 
    type: Date, 
    default: Date.now,
    index: true
  }
}, {
  timestamps: true,
  collection: 'FIIDIITimeSeries'
});

// Index for efficient queries
FIIDIITimeSeriesSchema.index({ version: 1, lastUpdated: -1 });

module.exports = mongoose.model('FIIDIITimeSeries', FIIDIITimeSeriesSchema);