const express = require('express');
const router  = express.Router();
const TimeSeriesData = require('../models/TimeSeriesData');
const nseService     = require('../services/nseService');

const VERSION = '1.0';
const DAY_LIMIT   = 30;
const MONTH_LIMIT = 12;
const round2 = n => Math.round(n * 100) / 100;

// GET /api/fii-dii-flows
router.get('/', async (req, res) => {
  try {
    const flowsData = await fetchFIIDIIFlows();
    res.json({ success: true, data: flowsData, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch FII/DII flows data',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/fii-dii-flows/fallback-status - Check fallback system status
router.get('/fallback-status', async (req, res) => {
  try {
    const status = nseService.getFallbackStatus();
    res.json({
      success: true,
      fallbackStatus: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get fallback status',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * fetchFIIDIIFlows
 *
 * 1. Read existing document from DB (the single version:"1.0" doc).
 * 2. Fetch latest from NSE API.
 * 3. If date already in day[] → return DB data as-is.
 * 4. If new → add to day[], update month[], year[] on SAME doc, save.
 * 5. Re-read from DB and return full data.
 */
async function fetchFIIDIIFlows() {
  // ── Step 1: read existing document from DB ─────────────────────────────────
  let doc = await TimeSeriesData.findOne({ version: VERSION });
  if (!doc) {
    doc = new TimeSeriesData({ version: VERSION, data: { day: [], month: [], year: [] } });
    await doc.save();
  }

  // ── Step 2: fetch latest from NSE ──────────────────────────────────────────
  let nseRecord;
  try {
    nseRecord = await nseService.fetchLatestFIIDIIFromNSE();
  } catch {
    return extractData(doc);
  }

  // ── Step 3: if date already exists, return DB data as-is ───────────────────
  const existingDates = (doc.data.day || []).map(d => d.date);
  if (existingDates.includes(nseRecord.date)) {
    return extractData(doc);
  }

  // ── Step 4: add new day + update month/year on the SAME document ───────────
  doc.data.day.push({
    date:      nseRecord.date,
    fii:       nseRecord.fii,
    dii:       nseRecord.dii,
    netFlow:   round2(nseRecord.fii + nseRecord.dii),
    timestamp: new Date(),
  });
  doc.data.day.sort((a, b) => (b.date > a.date ? 1 : -1));
  if (doc.data.day.length > DAY_LIMIT) {
    doc.data.day = doc.data.day.slice(0, DAY_LIMIT);
  }

  updateMonth(doc.data, nseRecord);
  updateYear(doc.data, nseRecord);

  doc.lastUpdated = new Date();
  doc.markModified('data');
  await doc.save();

  // ── Step 5: re-read from DB and return full data ───────────────────────────
  const fresh = await TimeSeriesData.findOne({ version: VERSION }).lean();
  return extractData(fresh);
}

function extractData(doc) {
  return {
    day:   doc?.data?.day   || [],
    month: doc?.data?.month || [],
    year:  doc?.data?.year  || [],
  };
}

function updateMonth(data, rec) {
  const monthKey  = rec.date.substring(0, 7);
  const monthDays = data.day.filter(d => d.date.startsWith(monthKey));
  let entry = data.month.find(m => m.month === monthKey);

  if (entry) {
    entry.fiiTotal     = round2(monthDays.reduce((s, d) => s + d.fii, 0));
    entry.diiTotal     = round2(monthDays.reduce((s, d) => s + d.dii, 0));
    entry.netFlowTotal = round2(entry.fiiTotal + entry.diiTotal);
    entry.dayCount     = monthDays.length;
    entry.avgFii       = round2(entry.fiiTotal / entry.dayCount);
    entry.avgDii       = round2(entry.diiTotal / entry.dayCount);
    entry.lastUpdated  = new Date();
  } else {
    const fiiTotal = round2(monthDays.reduce((s, d) => s + d.fii, 0));
    const diiTotal = round2(monthDays.reduce((s, d) => s + d.dii, 0));
    data.month.push({
      month: monthKey, fiiTotal, diiTotal,
      netFlowTotal: round2(fiiTotal + diiTotal),
      avgFii: round2(fiiTotal / monthDays.length),
      avgDii: round2(diiTotal / monthDays.length),
      dayCount: monthDays.length, lastUpdated: new Date(),
    });
  }
  data.month.sort((a, b) => (b.month > a.month ? 1 : -1));
  if (data.month.length > MONTH_LIMIT) {
    data.month = data.month.slice(0, MONTH_LIMIT);
  }
}

function updateYear(data, rec) {
  const yearKey    = rec.date.substring(0, 4);
  const yearMonths = data.month.filter(m => m.month.startsWith(yearKey));
  let entry = data.year.find(y => y.year === yearKey);

  if (entry) {
    entry.fiiTotal     = round2(yearMonths.reduce((s, m) => s + m.fiiTotal, 0));
    entry.diiTotal     = round2(yearMonths.reduce((s, m) => s + m.diiTotal, 0));
    entry.netFlowTotal = round2(entry.fiiTotal + entry.diiTotal);
    entry.monthCount   = yearMonths.length;
    const totalDays    = yearMonths.reduce((s, m) => s + m.dayCount, 0);
    entry.avgFii       = totalDays > 0 ? round2(entry.fiiTotal / totalDays) : 0;
    entry.avgDii       = totalDays > 0 ? round2(entry.diiTotal / totalDays) : 0;
    entry.lastUpdated  = new Date();
  } else {
    const fiiTotal  = round2(yearMonths.reduce((s, m) => s + m.fiiTotal, 0));
    const diiTotal  = round2(yearMonths.reduce((s, m) => s + m.diiTotal, 0));
    const totalDays = yearMonths.reduce((s, m) => s + m.dayCount, 0);
    data.year.push({
      year: yearKey, fiiTotal, diiTotal,
      netFlowTotal: round2(fiiTotal + diiTotal),
      avgFii: totalDays > 0 ? round2(fiiTotal / totalDays) : 0,
      avgDii: totalDays > 0 ? round2(diiTotal / totalDays) : 0,
      monthCount: yearMonths.length, lastUpdated: new Date(),
    });
  }
  data.year.sort((a, b) => (b.year > a.year ? 1 : -1));
}

module.exports = router;