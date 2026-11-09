const mongoose = require('mongoose');

const TimelineEntrySchema = new mongoose.Schema({
  target: { type: String, trim: true, default: '' },
  value: { type: String, trim: true, default: '' },
  status: {
    type: String,
    enum: ['pending', 'completed', 'missed'],
    default: 'pending',
  },
}, { _id: false });

const TradeRecommendationSchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    index: true,
  },
  entryPrice: { type: Number, required: true },
  exitPrice: { type: Number, required: true },
  ltp: { type: Number, required: true },
  stopLoss: { type: Number, required: true },
  upsidePotential: { type: Number, required: true },

  status: {
    type: String,
    enum: ['OPEN', 'CLOSED', 'PARTIAL', 'CANCELLED', 'WATCHLIST', 'SUCCESS', 'FAILED'],
    default: 'OPEN',
  },
  tradeType: {
    type: String,
    enum: ['BUY', 'SELL'],
    required: true,
  },
  term: {
    type: String,
    enum: ['SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM', 'INTRADAY'],
    required: true,
  },

  reference: { type: String, trim: true, default: '' },

  addedBy: {
    userId: { type: String, trim: true, default: '' },
    name: { type: String, trim: true, default: '' },
  },
  addedDate: { type: Date, default: Date.now },

  breakoutType: [{ type: String }],

  reason: { type: String, required: true, trim: true },

  timeline: [TimelineEntrySchema],

  visible_status: {
    type: String,
    enum: ['VIEW_TO_ALL', 'PRO_MEMBER', 'PRO_PLUS_MEMBER'],
    default: 'VIEW_TO_ALL',
  },

emailSent: { type: Boolean, default: false },


}, {
  timestamps: true,
  collection: 'TradeRecommendations',
});

TradeRecommendationSchema.index({ createdAt: -1 });
TradeRecommendationSchema.index({ status: 1 });

module.exports = mongoose.model('TradeRecommendation', TradeRecommendationSchema);
