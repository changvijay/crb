'use strict';

/**
 * BhavCopy Worker Thread
 * Receives a batch of records + per-symbol history via workerData,
 * computes all technical indicators in parallel with the other workers,
 * and streams progress messages back to the parent thread.
 *
 * workerData shape:
 *   { records: BhavRecord[], symHistory: { [symbol]: BhavRecord[] }, cfg: IndicatorsConfig, batchId: number }
 */

const { workerData, parentPort } = require('worker_threads');

// ── Indicator Math (self-contained – no external dependencies) ───────────────

function calcSMA(arr, period) {
  if (arr.length < period) return null;
  const slice = arr.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

function calcEMA(arr, period) {
  if (arr.length < period) return null;
  const k = 2 / (period + 1);
  let ema = arr.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < arr.length; i++) ema = arr[i] * k + ema * (1 - k);
  return ema;
}

function calcRSI(closes, period) {
  if (closes.length < period + 1) return null;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff >= 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff <  0 ? -diff : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function calcATR(highs, lows, closes, period) {
  if (closes.length < 2) return null;
  const trs = [];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(
      highs[i]  - lows[i],
      Math.abs(highs[i]  - closes[i - 1]),
      Math.abs(lows[i]   - closes[i - 1])
    ));
  }
  return calcEMA(trs, period);
}

function calcMACD(closes, fast, slow, signal) {
  if (closes.length < slow + signal) return null;
  const kf = 2 / (fast   + 1);
  const ks = 2 / (slow   + 1);
  let ef = closes.slice(0, fast).reduce((s, v) => s + v, 0) / fast;
  let es = closes.slice(0, slow).reduce((s, v) => s + v, 0) / slow;
  const macdLine = [];
  for (let i = Math.max(fast, slow); i < closes.length; i++) {
    ef = closes[i] * kf + ef * (1 - kf);
    es = closes[i] * ks + es * (1 - ks);
    macdLine.push(ef - es);
  }
  if (macdLine.length < signal) return null;
  const sigLine = calcEMA(macdLine, signal);
  if (sigLine === null) return null;
  const line = macdLine[macdLine.length - 1];
  return {
    line:      +line.toFixed(4),
    signal:    +sigLine.toFixed(4),
    histogram: +(line - sigLine).toFixed(4),
  };
}

function calcBollinger(closes, period) {
  if (closes.length < period) return null;
  const slice  = closes.slice(-period);
  const mid    = slice.reduce((s, v) => s + v, 0) / period;
  const stddev = Math.sqrt(slice.reduce((s, v) => s + (v - mid) ** 2, 0) / period);
  return {
    upper:  +(mid + 2 * stddev).toFixed(2),
    middle: +mid.toFixed(2),
    lower:  +(mid - 2 * stddev).toFixed(2),
  };
}

function computeIndicators(history, cfg) {
  const closes    = history.map(r => r.close).filter(v => v != null);
  const highs     = history.map(r => r.high).filter(v => v != null);
  const lows      = history.map(r => r.low).filter(v => v != null);
  const volumes   = history.map(r => r.volume).filter(v => v != null);
  const delivPcts = history.map(r => r.deliveryPct).filter(v => v != null);
  if (closes.length === 0) return {};

  const latest = history[history.length - 1];

  const rsi  = calcRSI(closes, cfg.rsiPeriod);
  const sma  = calcSMA(closes, cfg.smaPeriod);
  const ema  = calcEMA(closes, cfg.emaPeriod);
  const atr  = calcATR(highs, lows, closes, cfg.atrPeriod);
  const macd = calcMACD(closes, cfg.macdFast, cfg.macdSlow, cfg.macdSignal);
  const bb   = calcBollinger(closes, cfg.bollingerPeriod);

  const momentum = closes.length > cfg.momentumPeriod
    ? +(closes[closes.length - 1] - closes[closes.length - 1 - cfg.momentumPeriod]).toFixed(4)
    : null;

  let volumeBreakout = false;
  if (volumes.length >= 2) {
    const avgVol = volumes.slice(0, -1).reduce((s, v) => s + v, 0) / (volumes.length - 1);
    volumeBreakout = (latest.volume || 0) > avgVol * cfg.volumeBreakoutMultiple;
  }

  let deliveryBreakout = false;
  if (delivPcts.length >= 2) {
    const avgDel = delivPcts.slice(0, -1).reduce((s, v) => s + v, 0) / (delivPcts.length - 1);
    deliveryBreakout = (latest.deliveryPct || 0) > avgDel * cfg.deliveryBreakoutMultiple;
  }

  return {
    rsi:      rsi  !== null ? +rsi.toFixed(2) : null,
    sma:      sma  !== null ? +sma.toFixed(2) : null,
    ema:      ema  !== null ? +ema.toFixed(2) : null,
    atr:      atr  !== null ? +atr.toFixed(4) : null,
    macd:     macd || null,
    bollingerBands: bb || null,
    momentum,
    volumeBreakout,
    deliveryBreakout,
    config: {
      rsiPeriod:       cfg.rsiPeriod,
      smaPeriod:       cfg.smaPeriod,
      emaPeriod:       cfg.emaPeriod,
      atrPeriod:       cfg.atrPeriod,
      bollingerPeriod: cfg.bollingerPeriod,
    },
  };
}

// ── Batch Processing ─────────────────────────────────────────────────────────

const { records, symHistory, cfg, batchId } = workerData;
const total = records.length;

// Report progress every ~10% of records (minimum every 50)
const PROGRESS_INTERVAL = Math.max(50, Math.floor(total / 10));

const results = [];
const batchStart = Date.now();

for (let idx = 0; idx < total; idx++) {
  const rec      = records[idx];
  const history  = symHistory[rec.symbol] || [rec];
  const indicators = computeIndicators(history, cfg);
  results.push({ ...rec, indicators });

  if ((idx + 1) % PROGRESS_INTERVAL === 0 || idx === total - 1) {
    parentPort.postMessage({ type: 'progress', batchId, done: idx + 1, total });
  }
}

const elapsed = Date.now() - batchStart;
parentPort.postMessage({ type: 'done', batchId, results, total, elapsedMs: elapsed });
