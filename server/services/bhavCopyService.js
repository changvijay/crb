'use strict';

const os     = require('os');
const fs     = require('fs');
const path   = require('path');
const { Worker } = require('worker_threads');
const axios  = require('axios');
const BhavCopy = require('../models/BhavCopy');

// Temp directory: /temp/BhavCopy/ — stores one JSON file per trading day (rolling 60-day window)
const TEMP_DIR = path.join(__dirname, '..', 'temp', 'BhavCopy');

// ── Constants ────────────────────────────────────────────────────────────────

const BHAV_URL_BASE = 'https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_';

const INDICATORS_CONFIG = {
  rsiPeriod:               14,
  smaPeriod:               20,
  emaPeriod:               20,
  atrPeriod:               14,
  bollingerPeriod:         20,
  macdFast:                12,
  macdSlow:                26,
  macdSignal:               9,
  momentumPeriod:          14,
  volumeBreakoutMultiple:   2.0,
  deliveryBreakoutMultiple: 1.5,
};

const MAX_HISTORY_DAYS       = 60;  // must be > max indicator period (MACD=35, SMA/EMA/BB=20, RSI=15, ATR=15)
const DOWNLOAD_BATCH_SIZE    = 5;   // concurrent NSE CSV requests per batch (initial run)
const DOWNLOAD_BATCH_DELAY   = 350; // ms between batches to avoid NSE rate-limit
const BHAV_CACHE_TTL_MS      = 5 * 60 * 1000; // 5 min
const NUM_WORKERS            = Math.min(os.cpus().length, 8);

// ── Date Helpers ─────────────────────────────────────────────────────────────

/** Returns date formatted as DDMMYYYY for the NSE archives URL */
function formatDateDDMMYYYY(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}${mm}${d.getFullYear()}`;
}

function dayStart(d) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function isWeekend(d) {
  const day = d.getDay();
  return day === 0 || day === 6; // Sun=0, Sat=6
}

/**
 * Returns the last N weekday (Mon–Fri) dates going backwards from yesterday.
 * Sorted oldest → newest.
 */
function lastNWeekdays(n) {
  const dates = [];
  const cur = new Date();
  cur.setHours(0, 0, 0, 0);
  cur.setDate(cur.getDate() - 1); // start from yesterday
  while (dates.length < n) {
    if (!isWeekend(cur)) dates.push(new Date(cur));
    cur.setDate(cur.getDate() - 1);
  }
  return dates.reverse();
}

/** The date to use for an incremental sync (today if after 18:30 IST, else yesterday) */
function targetDateForIncremental() {
  const now = new Date();
  // Convert to IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset);
  const istHour   = ist.getUTCHours();
  const istMinute = ist.getUTCMinutes();

  const target = dayStart(now);
  if (istHour < 18 || (istHour === 18 && istMinute < 30)) {
    // BhavCopy for today not yet ready, use yesterday
    target.setDate(target.getDate() - 1);
  }
  return target;
}

/** Returns date formatted as YYYYMMDD — used as temp file name key (alphabetically sortable) */
function formatDateYYYYMMDD(d) {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

// ── Temp File Management ─────────────────────────────────────────────────────
//
// The rolling 60-day history is stored as individual JSON files in /temp/BhavCopy/.
// File naming: YYYYMMDD.json (sortable alphabetically = chronologically).
// Each file contains the full array of parsed OHLCV records for that trading day.
// MongoDB stores only ONE record per stock symbol (the latest calculation result).

function ensureTempDir() {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Returns all temp files sorted ascending (oldest first).
 * @returns {{ dateStr: string, filePath: string }[]}
 */
function listTempFiles() {
  ensureTempDir();
  return fs.readdirSync(TEMP_DIR)
    .filter(f => /^\d{8}\.json$/.test(f))
    .sort()
    .map(f => ({ dateStr: f.replace('.json', ''), filePath: path.join(TEMP_DIR, f) }));
}

/**
 * Saves a day's OHLCV records to /temp/BhavCopy/YYYYMMDD.json.
 * @param {Date}     date
 * @param {object[]} records
 */
function saveTempFile(date, records) {
  ensureTempDir();
  const dateStr  = formatDateYYYYMMDD(date instanceof Date ? date : new Date(date));
  const filePath = path.join(TEMP_DIR, `${dateStr}.json`);
  fs.writeFileSync(filePath, JSON.stringify(records));
}

/**
 * Reads all temp files and builds a per-symbol history map.
 * Records within each symbol are ordered oldest → newest (matching file sort order).
 * @returns {{ [symbol: string]: object[] }}
 */
function loadAllTempHistory() {
  const files = listTempFiles();
  const symHistory = {};
  for (const { filePath } of files) {
    let records;
    try {
      records = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      continue; // skip corrupted file
    }
    for (const rec of records) {
      if (!symHistory[rec.symbol]) symHistory[rec.symbol] = [];
      symHistory[rec.symbol].push({ ...rec, date: new Date(rec.date) });
    }
  }
  // Files were sorted oldest→newest so push order is already correct
  return symHistory;
}

/**
 * Builds the latest available record for every symbol in the temp history.
 * This keeps MongoDB aligned to the full rolling universe instead of only
 * the symbols present in the newest trading day.
 * @param {{ [symbol: string]: object[] }} symHistory
 * @returns {object[]}
 */
function buildLatestRecordsFromHistory(symHistory) {
  return Object.values(symHistory)
    .map(history => history[history.length - 1])
    .filter(Boolean);
}

/** Deletes the oldest temp file to slide the rolling window forward. */
function deleteOldestTempFile() {
  const files = listTempFiles();
  if (files.length > 0) {
    fs.unlinkSync(files[0].filePath);
  }
}

/**
 * Safety-net: removes any temp files beyond the keepDays limit.
 * @param {number} keepDays
 */
function cleanExcessTempFiles(keepDays = MAX_HISTORY_DAYS) {
  const files = listTempFiles();
  if (files.length > keepDays) {
    const toDelete = files.slice(0, files.length - keepDays);
    for (const { filePath, dateStr } of toDelete) {
      fs.unlinkSync(filePath);
    }
  }
}

// ── Indicator Math ───────────────────────────────────────────────────────────

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
  // history: sorted oldest→newest records for one symbol
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

// ── CSV Download & Parse ─────────────────────────────────────────────────────

async function downloadCSV(date) {
  const url = `${BHAV_URL_BASE}${formatDateDDMMYYYY(date)}.csv`;
  const resp = await axios.get(url, {
    timeout: 30000,
    responseType: 'text',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept':     'text/csv,*/*',
      'Referer':    'https://www.nseindia.com/',
    },
  });
  return resp.data;
}

function parseCSV(csvText, date) {
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (lines.length < 2) return [];

  // Strip BOM, normalise header
  const rawHeader = lines[0].replace(/^\uFEFF/, '');
  const headers   = rawHeader.split(',').map(h => h.trim().toUpperCase());

  const ci = name => headers.indexOf(name);
  const IDX = {
    SYM:    ci('SYMBOL'),
    SER:    ci('SERIES'),
    OPEN:   ci('OPEN_PRICE'),
    HIGH:   ci('HIGH_PRICE'),
    LOW:    ci('LOW_PRICE'),
    CLOSE:  ci('CLOSE_PRICE'),
    PREV:   ci('PREV_CLOSE'),
    AVG:    ci('AVG_PRICE'),
    VOL:    ci('TTL_TRD_QNTY'),
    TURN:   ci('TURNOVER_LACS'),
    TRADES: ci('NO_OF_TRADES'),
    DQTY:   ci('DELIV_QTY'),
    DPCT:   ci('DELIV_PER'),
  };

  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    const cols   = raw.split(',');
    const series = (cols[IDX.SER] || '').trim().toUpperCase();
    if (series !== 'EQ') continue;
    const symbol = (cols[IDX.SYM] || '').trim().toUpperCase();
    if (!symbol) continue;

    const n = (idx) => {
      if (idx < 0 || idx >= cols.length) return null;
      const v = parseFloat(cols[idx]);
      return isNaN(v) ? null : v;
    };

    records.push({
      symbol,
      series:        'EQ',
      date:          dayStart(date),
      open:          n(IDX.OPEN),
      high:          n(IDX.HIGH),
      low:           n(IDX.LOW),
      close:         n(IDX.CLOSE),
      previousClose: n(IDX.PREV),
      vwap:          n(IDX.AVG),
      volume:        n(IDX.VOL),
      turnoverLacs:  n(IDX.TURN),
      totalTrades:   n(IDX.TRADES),
      deliveryQty:   n(IDX.DQTY),
      deliveryPct:   n(IDX.DPCT),
    });
  }
  return records;
}

// ── Parallel Batch Indicator Processing ─────────────────────────────────────

/**
 * Splits latestRecords into NUM_WORKERS batches, dispatches each batch to a
 * worker thread, and collects the results (with progress logging) in parallel.
 *
 * @param {object[]} latestRecords  – Records for the latest trading date
 * @param {object}   symHistory     – Map of symbol → sorted history records
 * @returns {Promise<object[]>}     – Records enriched with `indicators`
 */
async function runParallelBatches(latestRecords, symHistory) {
  const total     = latestRecords.length;
  const batchSize = Math.ceil(total / NUM_WORKERS);
  const batches   = [];
  for (let i = 0; i < total; i += batchSize) {
    batches.push(latestRecords.slice(i, i + batchSize));
  }

  const workerFile = path.join(__dirname, 'bhavCopyWorker.js');
  

  const batchPromises = batches.map((batch, batchId) =>
    new Promise((resolve, reject) => {
      // Only pass the relevant slice of symHistory to keep IPC overhead low
      const batchHistory = {};
      for (const rec of batch) {
        if (symHistory[rec.symbol]) batchHistory[rec.symbol] = symHistory[rec.symbol];
      }

      const worker = new Worker(workerFile, {
        workerData: { records: batch, symHistory: batchHistory, cfg: INDICATORS_CONFIG, batchId },
      });

      worker.on('message', msg => {
        if (msg.type === 'progress') {
          
        } else if (msg.type === 'done') {
          
          resolve(msg.results);
        }
      });

      worker.on('error', reject);
      worker.on('exit', code => {
        if (code !== 0) reject(new Error(`Worker batch ${batchId + 1} exited with code ${code}`));
      });
    })
  );

  const batchResults = await Promise.all(batchPromises);
  const allResults   = batchResults.flat();
  return allResults;
}

// ── Core Sync ────────────────────────────────────────────────────────────────

/**
 * Main BhavCopy sync orchestrator.
 *
 * INITIAL MODE  (< MAX_HISTORY_DAYS temp files present):
 *   - Downloads the last 60 trading days in batches of 5
 *   - Saves each day as a JSON file in /temp/BhavCopy/
 *   - Resumes gracefully if a previous run was interrupted (skips existing files)
 *   - Calculates indicators from the full 60-day temp history
 *   - Upserts ONE record per symbol into MongoDB
 *
 * INCREMENTAL MODE (60 temp files present):
 *   - Deletes the oldest temp file (slides the 60-day window forward)
 *   - Downloads today's BhavCopy and saves to temp
 *   - Rebuilds symHistory from all 60 temp files
 *   - Recalculates indicators and upserts the latest result per symbol
 *
 * MongoDB result: exactly ONE record per stock symbol at all times.
 */
async function runBhavCopySync(options = {}) {
  const seedRecords = Array.isArray(options.seedRecords) ? options.seedRecords : [];
  ensureTempDir();
  const existingFiles = listTempFiles();
  const initial       = existingFiles.length < MAX_HISTORY_DAYS;

  const status = {
    mode:    initial ? 'initial' : 'incremental',
    dates:   [],
    skipped: [],
    errors:  [],
  };

  let latestRecords; // latest trading-day records used as the seed for the current sync

  // ── INITIAL MODE ───────────────────────────────────────────────────────────
  if (initial) {
    
    const allWeekdays      = lastNWeekdays(MAX_HISTORY_DAYS);
    const existingDateStrs = new Set(existingFiles.map(f => f.dateStr));
    const datesToDownload  = allWeekdays.filter(d => !existingDateStrs.has(formatDateYYYYMMDD(d)));

    if (datesToDownload.length > 0) {
      
      for (let i = 0; i < datesToDownload.length; i += DOWNLOAD_BATCH_SIZE) {
        const batch = datesToDownload.slice(i, i + DOWNLOAD_BATCH_SIZE);
        
        const settled = await Promise.allSettled(
          batch.map(async date => {
            const dateKey = date.toISOString().split('T')[0];
            try {
              const csv     = await downloadCSV(date);
              const records = parseCSV(csv, date);
              return { date, dateKey, records, ok: true };
            } catch (err) {
              return { date, dateKey, error: err.message, ok: false };
            }
          })
        );

        for (const s of settled) {
          const { date, dateKey, records, error, ok } = s.value;
          if (ok) {
            if (records.length === 0) {
              status.skipped.push({ date: dateKey, reason: 'no EQ records or holiday' });
            } else {
              saveTempFile(date, records);
              status.dates.push({ date: dateKey, records: records.length });
            }
          } else {
            status.errors.push({ date: dateKey, error });
          }
        }

        if (i + DOWNLOAD_BATCH_SIZE < datesToDownload.length) {
          await new Promise(r => setTimeout(r, DOWNLOAD_BATCH_DELAY));
        }
      }
    } else {
    }

    // Load latest file's records for indicator calculation
    const allFiles = listTempFiles();
    if (allFiles.length === 0) {
      return { ...status, totalStored: 0, totalSymbols: 0 };
    }
    const latestFile = allFiles[allFiles.length - 1];
    latestRecords = JSON.parse(fs.readFileSync(latestFile.filePath, 'utf8'))
      .map(r => ({ ...r, date: new Date(r.date) }));

  // ── INCREMENTAL MODE ───────────────────────────────────────────────────────
  } else {
    const target = targetDateForIncremental();
    if (isWeekend(target)) {
      status.skipped.push({ date: target.toISOString().split('T')[0], reason: 'weekend' });
      return { ...status, totalStored: 0, totalSymbols: 0 };
    }

    const targetDateStr = formatDateYYYYMMDD(target);
    const targetKey     = target.toISOString().split('T')[0];

    // Idempotency guard: don't re-process today if already done
    if (existingFiles.some(f => f.dateStr === targetDateStr)) {
      status.skipped.push({ date: targetKey, reason: 'already processed today' });
      return { ...status, totalStored: 0, totalSymbols: 0 };
    }

    // Slide the rolling window: remove oldest day
    deleteOldestTempFile();

    // Download and save today's data
    try {
      const csv     = await downloadCSV(target);
      const records = parseCSV(csv, target);
      if (records.length === 0) {
        status.skipped.push({ date: targetKey, reason: 'no EQ records or holiday' });
        return { ...status, totalStored: 0, totalSymbols: 0 };
      }
      saveTempFile(target, records);
      status.dates.push({ date: targetKey, records: records.length });
      latestRecords = records.map(r => ({ ...r, date: new Date(r.date) }));
    } catch (err) {
      status.errors.push({ date: targetKey, error: err.message });
      console.error(`[BhavCopy] Failed to download ${targetKey}: ${err.message}`);
      return { ...status, totalStored: 0, totalSymbols: 0 };
    }
  }

  // ── Safety net: trim temp beyond MAX_HISTORY_DAYS ────────────────────────
  cleanExcessTempFiles(MAX_HISTORY_DAYS);

  // ── Build per-symbol history entirely from temp files ────────────────────
  const symHistory = loadAllTempHistory();

  // Preserve symbols that already existed in MongoDB even if they are not
  // present in the current rolling temp window.
  for (const rec of seedRecords) {
    if (!rec?.symbol || symHistory[rec.symbol]) continue;
    symHistory[rec.symbol] = [{ ...rec, date: new Date(rec.date) }];
  }

  const latestUniverseRecords = buildLatestRecordsFromHistory(symHistory);

  // ── Calculate indicators for the full rolling symbol universe ────────────
  const latestWithIndicators = await runParallelBatches(latestUniverseRecords, symHistory);

  // ── Bulk upsert: ONE record per symbol (filter on symbol only) ───────────
  let totalStored = 0;
  const CHUNK = 500;
  for (let i = 0; i < latestWithIndicators.length; i += CHUNK) {
    const ops = latestWithIndicators.slice(i, i + CHUNK).map(rec => ({
      updateOne: {
        filter: { symbol: rec.symbol },           // ← symbol-only: one living record per stock
        update: {
          $set: {
            symbol:        rec.symbol,
            series:        rec.series,
            date:          rec.date,
            open:          rec.open,
            high:          rec.high,
            low:           rec.low,
            close:         rec.close,
            previousClose: rec.previousClose,
            volume:        rec.volume,
            deliveryQty:   rec.deliveryQty,
            deliveryPct:   rec.deliveryPct,
            vwap:          rec.vwap,
            totalTrades:   rec.totalTrades,
            turnoverLacs:  rec.turnoverLacs,
            indicators:    rec.indicators,
            source:        'NSE BhavCopy',
            fetchedAt:     new Date(),
            calculatedAt:  new Date(),
          },
        },
        upsert: true,
      },
    }));
    const res = await BhavCopy.bulkWrite(ops, { ordered: false });
    totalStored += (res.upsertedCount || 0) + (res.modifiedCount || 0);
  }

  const latestKey = latestRecords[0]?.date
    ? new Date(latestRecords[0].date).toISOString().split('T')[0]
    : null;

  
  return { ...status, totalStored, totalSymbols: latestWithIndicators.length, latestDate: latestKey };
}

// ── Public Read ──────────────────────────────────────────────────────────────

let _cache      = null;
let _cacheTime  = 0;

async function getBhavCopyData() {
  const now = Date.now();
  if (_cache && now - _cacheTime < BHAV_CACHE_TTL_MS) return _cache;

  // One record per symbol — fetch all, sorted by symbol
  const stocks = await BhavCopy.find(
    {},
    { _id: 0, __v: 0, createdAt: 0, updatedAt: 0 }
  ).sort({ symbol: 1 }).lean();

  if (stocks.length === 0) {
    return { stocks: [], count: 0, latestDate: null, source: 'mongodb', fetchedAt: new Date().toISOString() };
  }

  // latestDate: the most recent `date` field across all symbols (should be identical for all)
  const latestDate = stocks.reduce(
    (max, s) => (s.date && s.date > max ? s.date : max),
    stocks[0].date
  );

  const result = {
    stocks,
    count:      stocks.length,
    latestDate: new Date(latestDate).toISOString().split('T')[0],
    source:     'mongodb',
    fetchedAt:  new Date().toISOString(),
  };

  _cache     = result;
  _cacheTime = now;
  return result;
}

async function resetBhavCopyData() {

  const previousDocs = await BhavCopy.find({}, { _id: 0, __v: 0 }).lean();

  // Clear MongoDB
  await BhavCopy.deleteMany({});

  // Clear temp directory
  const files = listTempFiles();
  for (const { filePath } of files) {
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  }

  // Invalidate read cache
  _cache     = null;
  _cacheTime = 0;

  return runBhavCopySync({ seedRecords: previousDocs });
}

/**
 * Syncs OPEN trade recommendations against the latest BhavCopy day data.
 *
 * For each OPEN recommendation:
 *  - Updates `ltp` to the closing price of the matching symbol.
 *  - If day high > exitPrice  → status = 'SUCCESS' (target hit)
 *  - If day low  < stopLoss   → status = 'FAILED'  (stop-loss triggered)
 *  - If both conditions are true on the same day, SUCCESS takes priority.
 *  - Symbols missing from BhavCopy are fetched as a fallback from Yahoo Finance (SYMBOL.NS).
 *
 * Returns a summary object with counts and per-symbol details.
 */
async function syncRecommendationsWithBhavCopy() {
  const TradeRecommendation = require('../models/TradeRecommendation');
  const YahooFinance = require('yahoo-finance2').default;
  const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

  // ── 1. Load latest BhavCopy day from temp files ──────────────────────────
  const files = listTempFiles();
  if (files.length === 0) {
    throw new Error('No BhavCopy temp files found. Run a BhavCopy sync first.');
  }

  const latestFile = files[files.length - 1]; // sorted oldest→newest
  let dayRecords;
  try {
    dayRecords = JSON.parse(fs.readFileSync(latestFile.filePath, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to read BhavCopy file ${latestFile.dateStr}: ${err.message}`);
  }

  // Build a symbol → record lookup (only EQ series)
  const bhavMap = {};
  for (const rec of dayRecords) {
    if (rec.series === 'EQ') {
      bhavMap[rec.symbol.toUpperCase()] = rec;
    }
  }

  // ── 2. Fetch all OPEN recommendations ─────────────────────────────────────
  const openRecos = await TradeRecommendation.find({ status: 'OPEN' });
  if (openRecos.length === 0) {
    return { dateStr: latestFile.dateStr, totalOpen: 0, updated: [], notFound: [] };
  }

  // ── 3. Identify symbols missing from BhavCopy and batch-fetch from Yahoo ──
  const missingSymbols = openRecos
    .filter(r => !bhavMap[r.symbol.toUpperCase()])
    .map(r => r.symbol.toUpperCase());

  const yahooMap = {};
  if (missingSymbols.length > 0) {
    const tickers = missingSymbols.map(s => `${s}.NS`);
    const settled = await Promise.allSettled(
      tickers.map(t => yahooFinance.quote(t, {}, { validateResult: false }))
    );
    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];
      if (result.status === 'fulfilled' && result.value) {
        const q = result.value;
        const sym = missingSymbols[i];
        // Only use if we have valid price data
        if (q.regularMarketPrice != null) {
          yahooMap[sym] = {
            close: q.regularMarketPrice,
            high:  q.regularMarketDayHigh  || q.regularMarketPrice,
            low:   q.regularMarketDayLow   || q.regularMarketPrice,
            source: 'yahoo',
          };
        } else {
          console.warn(`[BhavCopy Sync] Yahoo returned no price for ${sym}`);
        }
      } else {
        console.warn(`[BhavCopy Sync] Yahoo fetch failed for ${missingSymbols[i]}: ${settled[i].reason?.message || 'unknown error'}`);
      }
    }
  }

  // ── 4. Process each recommendation ───────────────────────────────────────
  const updated   = [];
  const notFound  = [];

  for (const reco of openRecos) {
    const sym  = reco.symbol.toUpperCase();
    const bhav = bhavMap[sym] || yahooMap[sym];

    if (!bhav) {
      notFound.push(reco.symbol);
      continue;
    }

    const prevStatus = reco.status;
    const prevLtp    = reco.ltp;

    // Always update LTP to today's closing price
    reco.ltp = bhav.close;

    // Determine new status (SUCCESS takes priority over FAILED)
    let newStatus = null;
    if (bhav.high > reco.exitPrice) {
      newStatus = 'SUCCESS';
    } else if (bhav.low < reco.stopLoss) {
      newStatus = 'FAILED';
    }

    if (newStatus) {
      reco.status = newStatus;
    }

    await reco.save();

    updated.push({
      symbol:     reco.symbol,
      source:     bhav.source || 'bhavcopy',
      prevLtp,
      newLtp:     reco.ltp,
      high:       bhav.high,
      low:        bhav.low,
      exitPrice:  reco.exitPrice,
      stopLoss:   reco.stopLoss,
      prevStatus,
      newStatus:  reco.status,
    });
  }

  return {
    dateStr:    latestFile.dateStr,
    totalOpen:  openRecos.length,
    updated,
    notFound,
  };
}

async function refreshAdvisorRecommendationStats() {
  const Advisor = require('../models/Advisor');
  const TradeRecommendation = require('../models/TradeRecommendation');
  const agg = await TradeRecommendation.aggregate([
    { $match: { 'addedBy.userId': { $exists: true, $ne: '' } } },
    { $group: {
      _id: '$addedBy.userId',
      totalRecommendations: { $sum: 1 },
      successCount: { $sum: { $cond: [{ $eq: ['$status', 'SUCCESS'] }, 1, 0] } },
      failedCount: { $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] } },
    } },
  ]);

  const statsByAdvisor = agg.reduce((acc, doc) => {
    acc[doc._id] = doc;
    return acc;
  }, {});

  const advisors = await Advisor.find().select('_id').lean();
  const bulkOps = advisors.map(advisor => {
    const userId = advisor._id.toString();
    const stats = statsByAdvisor[userId] || { totalRecommendations: 0, successCount: 0, failedCount: 0 };
    const successRate = (stats.successCount + stats.failedCount) > 0
      ? Number(((stats.successCount / (stats.successCount + stats.failedCount)) * 100).toFixed(2))
      : 0;

    return {
      updateOne: {
        filter: { _id: advisor._id },
        update: {
          $set: {
            totalRecommendations: stats.totalRecommendations,
            successRate,
          },
        },
      },
    };
  });

  if (bulkOps.length > 0) {
    await Advisor.bulkWrite(bulkOps, { ordered: false });
  }

  return {
    advisorsScanned: advisors.length,
    advisorsUpdated: bulkOps.length,
  };
}

module.exports = { runBhavCopySync, getBhavCopyData, resetBhavCopyData, syncRecommendationsWithBhavCopy, refreshAdvisorRecommendationStats };
