const mongoose = require('mongoose');

const NSEPriceBandHitterSchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },
  series: {
    code: { type: String, default: '' },
    meaning: { type: String, default: 'Other' },
  },
  ltp: { type: Number, default: 0 },
  change: { type: Number, default: 0 },
  percentChange: { type: Number, default: 0 },
  priceBand: { type: Number, default: 0 },
  highPrice: { type: Number, default: 0 },
  lowPrice: { type: Number, default: 0 },
  yearHigh: { type: Number, default: 0 },
  yearLow: { type: Number, default: 0 },
  totalTradedVol: { type: Number, default: 0 },
  turnover: { type: Number, default: 0 },
  categories: [{ type: String }],
  segments: [{ type: String }],
  nseTimestamp: { type: String, default: null },
  source: { type: String, default: 'NSE live-analysis-price-band-hitter' },
  fetchedAt: { type: Date, default: Date.now },
}, {
  timestamps: true,
  collection: 'NSEPriceBandHitters',
});

NSEPriceBandHitterSchema.index({ fetchedAt: -1 });

module.exports = mongoose.model('NSEPriceBandHitter', NSEPriceBandHitterSchema);