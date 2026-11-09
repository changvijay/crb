'use strict';

const mongoose = require('mongoose');

const BhavCopySchema = new mongoose.Schema(
  {
    symbol:        { type: String, required: true, uppercase: true, trim: true },
    date:          { type: Date,   required: true },  // date of the latest BhavCopy used for calculation
    series:        { type: String, default: 'EQ' },

    // ─── Raw market data ──────────────────────────────────────────────────────
    open:          Number,
    high:          Number,
    low:           Number,
    close:         Number,
    previousClose: Number,
    volume:        Number,
    deliveryQty:   Number,
    deliveryPct:   Number,
    vwap:          Number,      // AVG_PRICE (VWAP)
    totalTrades:   Number,
    turnoverLacs:  Number,      // liquidity metric

    // ─── Calculated technical indicators ─────────────────────────────────────
    indicators: {
      rsi:      Number,
      sma:      Number,
      ema:      Number,
      atr:      Number,
      macd: {
        line:      Number,
        signal:    Number,
        histogram: Number,
      },
      bollingerBands: {
        upper:  Number,
        middle: Number,
        lower:  Number,
      },
      momentum:         Number,
      volumeBreakout:   Boolean,
      deliveryBreakout: Boolean,
      config: {
        rsiPeriod:       { type: Number, default: 14 },
        smaPeriod:       { type: Number, default: 20 },
        emaPeriod:       { type: Number, default: 20 },
        atrPeriod:       { type: Number, default: 14 },
        bollingerPeriod: { type: Number, default: 20 },
      },
    },

    // ─── Fundamental data (Yahoo Finance) ────────────────────────────────────
    fundamentals: {
      pe:         Number,
      roe:        Number,
      peg:        Number,
      debtEquity: Number,
      eps:        Number,
      bookValue:  Number,
      sector:     String,
      industry:   String,
      marketCap:  Number,
      fetchedAt:  Date,
    },

    source:       { type: String, default: 'NSE BhavCopy' },
    fetchedAt:    { type: Date,   default: Date.now },
    calculatedAt: { type: Date,   default: Date.now }, // updated on every daily sync
  },
  {
    timestamps: true,
    collection: 'BhavCopy',
  }
);

// One record per symbol (always the latest calculated result)
BhavCopySchema.index({ symbol: 1 }, { unique: true });

module.exports = mongoose.model('BhavCopy', BhavCopySchema);
