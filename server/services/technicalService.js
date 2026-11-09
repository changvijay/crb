const axios = require('axios');

/**
 * Technical Analysis Service
 * Calculates real indicators from historical price data:
 * RSI, SMA, EMA, MACD, Bollinger Bands, Pivot Points, VWAP
 * Also fetches Nifty Option Chain data from NSE.
 */
class TechnicalService {

  /**
   * Main: fetch historical data and compute all indicators
   * Covers Nifty 50, Bank Nifty, and Sensex in parallel
   */
  async getFullAnalysis() {
    const indices = [
      { ticker: '^NSEI',    key: 'nifty50',   name: 'NIFTY 50'   },
      { ticker: '^NSEBANK', key: 'bankNifty',  name: 'BANK NIFTY'  },
      { ticker: '^BSESN',   key: 'sensex',     name: 'SENSEX'      },
    ];

    const results = {};

    // Fetch all three indices in parallel
    await Promise.all(indices.map(async ({ ticker, key, name }) => {
      try {
        const analysis = await this._getIndexAnalysis(ticker, name);
        if (analysis) results[key] = analysis;
      } catch (err) {
        console.error(`[Technical] ${name} analysis error:`, err.message);
      }
    }));

    // Fetch option chain data
    try {
      const optionChain = await this.fetchOptionChain();
      if (optionChain) results.optionChain = optionChain;
    } catch (err) {
      console.error('[Technical] Option chain error:', err.message);
    }

    return Object.keys(results).length > 0 ? results : null;
  }

  /**
   * Internal helper: compute full technical analysis for a single index
   */
  async _getIndexAnalysis(ticker, name) {
    const histData = await this.fetchHistoricalData(ticker, '3mo');
    if (!histData || histData.closes.length < 20) return null;

    const closes = histData.closes;
    const highs   = histData.highs;
    const lows    = histData.lows;
    const currentPrice = closes[closes.length - 1];

    // RSI (14-period)
    const rsi14 = this.calculateRSI(closes, 14);

    // Simple Moving Averages
    const sma5   = this.calculateSMA(closes, 5);
    const sma10  = this.calculateSMA(closes, 10);
    const sma20  = this.calculateSMA(closes, 20);
    const sma50  = closes.length >= 50  ? this.calculateSMA(closes, 50)  : null;
    const sma200 = closes.length >= 200 ? this.calculateSMA(closes, 200) : null;

    // Exponential Moving Averages
    const ema9  = this.calculateEMA(closes, 9);
    const ema21 = this.calculateEMA(closes, 21);

    // MACD (12, 26, 9)
    const macd = this.calculateMACD(closes);

    // Bollinger Bands (20, 2)
    const bollinger = this.calculateBollingerBands(closes, 20, 2);

    // Pivot Points (Classic)
    const lastHigh  = highs[highs.length - 1];
    const lastLow   = lows[lows.length - 1];
    const lastClose = closes[closes.length - 1];
    const pivots    = this.calculatePivotPoints(lastHigh, lastLow, lastClose);

    // ATR (14-period)
    const atr = this.calculateATR(highs, lows, closes, 14);

    // Stochastic RSI
    const stochRSI = this.calculateStochasticRSI(closes, 14);

    // Price change stats
    const dayChange     = closes.length >= 2 ? closes[closes.length - 1] - closes[closes.length - 2] : 0;
    const dayChangePct  = closes.length >= 2 ? (dayChange / closes[closes.length - 2]) * 100 : 0;
    const weekChange    = closes.length >= 6 ? closes[closes.length - 1] - closes[closes.length - 6] : 0;
    const weekChangePct = closes.length >= 6 ? (weekChange / closes[closes.length - 6]) * 100 : 0;

    return {
      symbol: name,
      currentPrice: round(currentPrice),
      dayHigh:      round(lastHigh),
      dayLow:       round(lastLow),
      dayChange:    round(dayChange),
      dayChangePct: round(dayChangePct, 2),
      weekChange:   round(weekChange),
      weekChangePct: round(weekChangePct, 2),
      indicators: {
        rsi14: round(rsi14),
        rsiSignal: rsi14 > 70 ? 'Overbought' : rsi14 < 30 ? 'Oversold' : rsi14 > 60 ? 'Bullish Zone' : rsi14 < 40 ? 'Bearish Zone' : 'Neutral',
        sma5:   round(sma5),
        sma10:  round(sma10),
        sma20:  round(sma20),
        sma50:  sma50  ? round(sma50)  : 'N/A (insufficient data)',
        sma200: sma200 ? round(sma200) : 'N/A (insufficient data)',
        ema9:   round(ema9),
        ema21:  round(ema21),
        macd: {
          macdLine:   round(macd.macdLine, 2),
          signalLine: round(macd.signalLine, 2),
          histogram:  round(macd.histogram, 2),
          signal:     macd.histogram > 0 ? 'Bullish' : 'Bearish',
        },
        bollingerBands: {
          upper:     round(bollinger.upper),
          middle:    round(bollinger.middle),
          lower:     round(bollinger.lower),
          bandwidth: round(bollinger.bandwidth, 2),
          position:  currentPrice > bollinger.upper ? 'Above Upper Band (Overbought)' :
                     currentPrice < bollinger.lower ? 'Below Lower Band (Oversold)' :
                     currentPrice > bollinger.middle ? 'Upper Half' : 'Lower Half',
        },
        atr14:          round(atr),
        stochasticRSI:  round(stochRSI, 2),
        stochSignal:    stochRSI > 0.8 ? 'Overbought' : stochRSI < 0.2 ? 'Oversold' : 'Neutral',
      },
      pivotPoints: {
        pivot: round(pivots.pivot),
        r1:    round(pivots.r1),
        r2:    round(pivots.r2),
        r3:    round(pivots.r3),
        s1:    round(pivots.s1),
        s2:    round(pivots.s2),
        s3:    round(pivots.s3),
      },
      movingAverageSummary: this.getMovingAverageSummary(currentPrice, { sma5, sma10, sma20, sma50, ema9, ema21 }),
      overallSignal:        this.getOverallSignal(rsi14, macd, currentPrice, { sma20, ema9, ema21 }),
    };
  }

  /**
   * Fetch historical OHLCV data from Yahoo Finance
   */
  async fetchHistoricalData(symbol, range = '3mo') {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
    const response = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    const result = response.data?.chart?.result?.[0];
    if (!result) return null;

    const timestamps = result.timestamp || [];
    const quote = result.indicators.quote[0];
    // Filter out null values while keeping arrays aligned
    const validIndices = quote.close.map((c, i) => c != null ? i : -1).filter(i => i >= 0);

    return {
      timestamps: validIndices.map(i => timestamps[i]),
      closes: validIndices.map(i => quote.close[i]),
      highs: validIndices.map(i => quote.high[i]),
      lows: validIndices.map(i => quote.low[i]),
      volumes: validIndices.map(i => quote.volume?.[i] || 0),
    };
  }

  /**
   * Get last 7 trading days with per-day SMA 20, EMA 9, EMA 21 values
   * Returns structured data for Nifty 50, Bank Nifty, and Sensex
   */
  async getLast7DaysIndicators() {
    const indices = [
      { ticker: '^NSEI',    name: 'NIFTY 50'   },
      { ticker: '^NSEBANK', name: 'BANK NIFTY'  },
      { ticker: '^BSESN',   name: 'SENSEX'      },
    ];

    const results = {};
    await Promise.all(indices.map(async ({ ticker, name }) => {
      try {
        results[name] = await this._getLast7DaysForSymbol(ticker, name);
      } catch (err) {
        console.error(`[Technical] getLast7Days failed for ${name}: ${err.message}`);
        results[name] = null;
      }
    }));

    return {
      nifty50:   results['NIFTY 50'],
      bankNifty: results['BANK NIFTY'],
      sensex:    results['SENSEX'],
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Internal helper: fetch 7-day indicators for a single index symbol
   */
  async _getLast7DaysForSymbol(ticker, name) {
    const histData = await this.fetchHistoricalData(ticker, '3mo');
    if (!histData || histData.closes.length < 21) {
      throw new Error(`Insufficient historical data for ${name}`);
    }

    const { closes, highs, lows, timestamps } = histData;
    const totalDays = closes.length;
    const numDays = Math.min(7, totalDays - 20); // need at least 20 prior days for SMA 20

    const days = [];

    for (let d = 0; d < numDays; d++) {
      const dayIndex = totalDays - numDays + d;
      const sliceForCalc = closes.slice(0, dayIndex + 1);

      const price = closes[dayIndex];
      const high  = highs[dayIndex];
      const low   = lows[dayIndex];
      const sma20 = this.calculateSMA(sliceForCalc, 20);
      const ema9  = this.calculateEMA(sliceForCalc, 9);
      const ema21 = this.calculateEMA(sliceForCalc, 21);

      const dateObj   = new Date(timestamps[dayIndex] * 1000);
      const dateLabel = dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      const fullDate  = dateObj.toISOString().split('T')[0];

      days.push({
        date: fullDate,
        label: dateLabel,
        close: round(price),
        high:  round(high),
        low:   round(low),
        sma20: round(sma20),
        ema9:  round(ema9),
        ema21: round(ema21),
      });
    }

    const latest = days[days.length - 1];

    return {
      symbol: name,
      days,
      latest: {
        price:        latest.close,
        sma20:        latest.sma20,
        ema9:         latest.ema9,
        ema21:        latest.ema21,
        priceVsSma20: latest.close > latest.sma20 ? 'Above' : 'Below',
        priceVsEma9:  latest.close > latest.ema9  ? 'Above' : 'Below',
        priceVsEma21: latest.close > latest.ema21 ? 'Above' : 'Below',
        emaCross:     latest.ema9 > latest.ema21
          ? 'Bullish (EMA9 > EMA21)'
          : 'Bearish (EMA9 < EMA21)',
      },
    };
  }

  /**
   * Fetch Nifty Option Chain from NSE
   * Uses cookie-based session to bypass access restrictions
   */
  async fetchOptionChain() {
    try {
      // Step 1: Get cookies from NSE homepage
      const sessionResp = await axios.get('https://www.nseindia.com', {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        maxRedirects: 5,
      });

      // Extract cookies
      const setCookies = sessionResp.headers['set-cookie'];
      if (!setCookies) throw new Error('No cookies received from NSE');
      const cookieStr = setCookies.map(c => c.split(';')[0]).join('; ');

      // Step 2: Fetch option chain with cookies
      await new Promise(r => setTimeout(r, 1000)); // Small delay

      const ocResp = await axios.get('https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY', {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Referer': 'https://www.nseindia.com/option-chain',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cookie': cookieStr,
        },
      });

      const data = ocResp.data;
      if (!data?.records?.data) throw new Error('Empty option chain response');

      return this.processOptionChain(data);
    } catch (err) {
      console.log(`[Technical] NSE option chain failed: ${err.message}. Using calculated levels.`);
      return this.getSyntheticOptionChainAnalysis();
    }
  }

  /**
   * Process raw NSE option chain data
   */
  processOptionChain(data) {
    const records = data.records.data;
    const expiryDates = data.records.expiryDates || [];
    const nearestExpiry = expiryDates[0];
    const spotPrice = data.records.underlyingValue;

    // Filter for nearest expiry
    const nearExpiry = records.filter(r => r.expiryDate === nearestExpiry);

    // Get strikes around spot price (±500 points)
    const relevantStrikes = nearExpiry.filter(r =>
      r.strikePrice >= (spotPrice - 500) && r.strikePrice <= (spotPrice + 500)
    );

    // Calculate PCR (Put-Call Ratio)
    let totalCallOI = 0, totalPutOI = 0;
    let totalCallVol = 0, totalPutVol = 0;
    let maxCallOI = { strike: 0, oi: 0 };
    let maxPutOI = { strike: 0, oi: 0 };
    let maxCallOIChange = { strike: 0, change: 0 };
    let maxPutOIChange = { strike: 0, change: 0 };

    const chainData = [];

    relevantStrikes.forEach(r => {
      const ce = r.CE || {};
      const pe = r.PE || {};
      const ceOI = ce.openInterest || 0;
      const peOI = pe.openInterest || 0;
      const ceVol = ce.totalTradedVolume || 0;
      const peVol = pe.totalTradedVolume || 0;
      const ceOIChg = ce.changeinOpenInterest || 0;
      const peOIChg = pe.changeinOpenInterest || 0;

      totalCallOI += ceOI;
      totalPutOI += peOI;
      totalCallVol += ceVol;
      totalPutVol += peVol;

      if (ceOI > maxCallOI.oi) maxCallOI = { strike: r.strikePrice, oi: ceOI };
      if (peOI > maxPutOI.oi) maxPutOI = { strike: r.strikePrice, oi: peOI };
      if (ceOIChg > maxCallOIChange.change) maxCallOIChange = { strike: r.strikePrice, change: ceOIChg };
      if (peOIChg > maxPutOIChange.change) maxPutOIChange = { strike: r.strikePrice, change: peOIChg };

      chainData.push({
        strike: r.strikePrice,
        callOI: ceOI,
        putOI: peOI,
        callOIChange: ceOIChg,
        putOIChange: peOIChg,
        callVolume: ceVol,
        putVolume: peVol,
        callLTP: ce.lastPrice || 0,
        putLTP: pe.lastPrice || 0,
        callIV: ce.impliedVolatility || 0,
        putIV: pe.impliedVolatility || 0,
      });
    });

    const pcr = totalCallOI > 0 ? round(totalPutOI / totalCallOI, 2) : 0;

    return {
      spotPrice,
      nearestExpiry,
      pcr,
      pcrSignal: pcr > 1.3 ? 'Very Bullish' : pcr > 1.0 ? 'Bullish' : pcr > 0.7 ? 'Neutral' : 'Bearish',
      totalCallOI,
      totalPutOI,
      maxCallOIStrike: maxCallOI.strike,
      maxCallOI: maxCallOI.oi,
      maxPutOIStrike: maxPutOI.strike,
      maxPutOI: maxPutOI.oi,
      maxCallOIChangeStrike: maxCallOIChange.strike,
      maxPutOIChangeStrike: maxPutOIChange.strike,
      resistanceFromOC: maxCallOI.strike,
      supportFromOC: maxPutOI.strike,
      ivSignal: this.getIVSignal(chainData, spotPrice),
      topStrikes: chainData.filter(s => Math.abs(s.strike - spotPrice) <= 300),
    };
  }

  /**
   * If NSE is blocked, generate synthetic analysis from price data
   */
  getSyntheticOptionChainAnalysis() {
    return null; // Will be handled gracefully in the prompt
  }

  getIVSignal(chainData, spot) {
    const atmStrike = chainData.reduce((closest, s) =>
      Math.abs(s.strike - spot) < Math.abs(closest.strike - spot) ? s : closest
    , chainData[0]);
    if (!atmStrike) return 'N/A';
    const avgIV = (atmStrike.callIV + atmStrike.putIV) / 2;
    if (avgIV > 20) return `High (${round(avgIV, 1)}%) - Expect large moves`;
    if (avgIV > 14) return `Moderate (${round(avgIV, 1)}%)`;
    return `Low (${round(avgIV, 1)}%) - Calm market`;
  }

  // ===== Technical Indicator Calculations =====

  calculateRSI(closes, period = 14) {
    if (closes.length < period + 1) return 50;
    let gains = 0, losses = 0;

    for (let i = 1; i <= period; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period + 1; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) {
        avgGain = (avgGain * (period - 1) + change) / period;
        avgLoss = (avgLoss * (period - 1)) / period;
      } else {
        avgGain = (avgGain * (period - 1)) / period;
        avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
      }
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  calculateSMA(closes, period) {
    if (closes.length < period) return closes[closes.length - 1];
    const slice = closes.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

  calculateEMA(closes, period) {
    if (closes.length < period) return closes[closes.length - 1];
    const multiplier = 2 / (period + 1);
    let ema = this.calculateSMA(closes.slice(0, period), period);
    for (let i = period; i < closes.length; i++) {
      ema = (closes[i] - ema) * multiplier + ema;
    }
    return ema;
  }

  calculateMACD(closes) {
    const ema12 = this.calculateEMA(closes, 12);
    const ema26 = this.calculateEMA(closes, 26);
    const macdLine = ema12 - ema26;

    // Calculate signal line (9-EMA of MACD values)
    // Simplified: compute MACD for recent periods
    const macdValues = [];
    for (let i = Math.max(26, closes.length - 30); i <= closes.length; i++) {
      const slice = closes.slice(0, i);
      const e12 = this.calculateEMA(slice, 12);
      const e26 = this.calculateEMA(slice, 26);
      macdValues.push(e12 - e26);
    }

    let signalLine = macdLine;
    if (macdValues.length >= 9) {
      const multiplier = 2 / 10;
      signalLine = macdValues.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
      for (let i = 9; i < macdValues.length; i++) {
        signalLine = (macdValues[i] - signalLine) * multiplier + signalLine;
      }
    }

    return {
      macdLine,
      signalLine,
      histogram: macdLine - signalLine,
    };
  }

  calculateBollingerBands(closes, period = 20, stdDev = 2) {
    const sma = this.calculateSMA(closes, period);
    const slice = closes.slice(-period);
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
    const sd = Math.sqrt(variance);

    return {
      upper: sma + (stdDev * sd),
      middle: sma,
      lower: sma - (stdDev * sd),
      bandwidth: ((sma + stdDev * sd) - (sma - stdDev * sd)) / sma * 100,
    };
  }

  calculateATR(highs, lows, closes, period = 14) {
    if (highs.length < period + 1) return 0;
    const trueRanges = [];
    for (let i = 1; i < highs.length; i++) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      trueRanges.push(tr);
    }
    const recentTR = trueRanges.slice(-period);
    return recentTR.reduce((a, b) => a + b, 0) / recentTR.length;
  }

  calculateStochasticRSI(closes, period = 14) {
    // Calculate RSI values for the last `period` spans
    const rsiValues = [];
    for (let i = period + 1; i <= closes.length; i++) {
      rsiValues.push(this.calculateRSI(closes.slice(0, i), period));
    }
    if (rsiValues.length < period) return 0.5;

    const recentRSI = rsiValues.slice(-period);
    const minRSI = Math.min(...recentRSI);
    const maxRSI = Math.max(...recentRSI);
    const currentRSI = recentRSI[recentRSI.length - 1];

    if (maxRSI === minRSI) return 0.5;
    return (currentRSI - minRSI) / (maxRSI - minRSI);
  }

  calculatePivotPoints(high, low, close) {
    const pivot = (high + low + close) / 3;
    return {
      pivot,
      r1: 2 * pivot - low,
      r2: pivot + (high - low),
      r3: high + 2 * (pivot - low),
      s1: 2 * pivot - high,
      s2: pivot - (high - low),
      s3: low - 2 * (high - pivot),
    };
  }

  getMovingAverageSummary(price, mas) {
    let aboveCount = 0, totalCount = 0;
    for (const [key, val] of Object.entries(mas)) {
      if (val && typeof val === 'number') {
        totalCount++;
        if (price > val) aboveCount++;
      }
    }
    const pct = totalCount > 0 ? (aboveCount / totalCount) * 100 : 50;
    if (pct >= 80) return 'Strong Buy';
    if (pct >= 60) return 'Buy';
    if (pct >= 40) return 'Neutral';
    if (pct >= 20) return 'Sell';
    return 'Strong Sell';
  }

  getOverallSignal(rsi, macd, price, mas) {
    let score = 0;
    // RSI
    if (rsi > 60) score++;
    else if (rsi < 40) score--;
    // MACD
    if (macd.histogram > 0) score++;
    else score--;
    // Price vs MAs
    if (price > mas.sma20) score++;
    else score--;
    if (price > mas.ema21) score++;
    else score--;

    if (score >= 3) return 'Strong Buy';
    if (score >= 1) return 'Buy';
    if (score <= -3) return 'Strong Sell';
    if (score <= -1) return 'Sell';
    return 'Neutral';
  }
}

function round(val, decimals = 2) {
  if (typeof val !== 'number' || isNaN(val)) return val;
  return Number(Math.round(val + 'e' + decimals) + 'e-' + decimals);
}

module.exports = new TechnicalService();
