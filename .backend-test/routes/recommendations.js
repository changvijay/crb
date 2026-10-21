const express = require('express');
const mongoose = require('mongoose');

const TradeRecommendation = require('../models/TradeRecommendation');
const Advisor             = require('../models/Advisor');

const router = express.Router();

// ─── GET /api/recommendations ─────────────────────────────────────────────────
// Public — all trade recommendations across all advisors, with advisor info
// Query params:
//   page        (default 1)
//   limit       (default 24, max 100)
//   status      OPEN | CLOSED | PARTIAL | CANCELLED | WATCHLIST
//   tradeType   BUY | SELL
//   term        SHORT_TERM | MEDIUM_TERM | LONG_TERM | INTRADAY
//   search      symbol prefix search (case-insensitive)
router.get('/', async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page  || 1, 10));
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit || 24, 10)));
    const skip   = (page - 1) * limit;

    const filter = {};

    const VALID_STATUSES   = ['OPEN', 'CLOSED', 'PARTIAL', 'CANCELLED', 'WATCHLIST', 'SUCCESS', 'FAILED'];
    const VALID_TYPES      = ['BUY', 'SELL'];
    const VALID_TERMS      = ['SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM', 'INTRADAY'];
    const VALID_SORT_FIELDS = ['createdAt', 'ltp', 'upsidePotential', 'pctVsEntry'];

    if (req.query.status    && VALID_STATUSES.includes(req.query.status))   filter.status    = req.query.status;
    if (req.query.tradeType && VALID_TYPES.includes(req.query.tradeType))   filter.tradeType = req.query.tradeType;
    if (req.query.term      && VALID_TERMS.includes(req.query.term))        filter.term      = req.query.term;

    if (req.query.search) {
      const safe = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.symbol = { $regex: `^${safe}`, $options: 'i' };
    }

    const sortField = VALID_SORT_FIELDS.includes(req.query.sortBy) ? req.query.sortBy : 'createdAt';
    const sortDir   = req.query.sortDir === 'asc' ? 1 : -1;

    let recos, total;

    if (sortField === 'pctVsEntry') {
      // pctVsEntry = (ltp - entryPrice) / entryPrice * 100  — computed via aggregation
      const pipeline = [
        { $match: filter },
        { $addFields: {
          pctVsEntry: {
            $cond: {
              if: { $and: [{ $ne: ['$entryPrice', null] }, { $ne: ['$entryPrice', 0] }] },
              then: { $multiply: [{ $divide: [{ $subtract: ['$ltp', '$entryPrice'] }, '$entryPrice'] }, 100] },
              else: 0,
            },
          },
        } },
        { $sort: { pctVsEntry: sortDir } },
        { $facet: {
          data:  [{ $skip: skip }, { $limit: limit }],
          count: [{ $count: 'n' }],
        } },
      ];
      const [result] = await TradeRecommendation.aggregate(pipeline);
      recos = result?.data  || [];
      total = result?.count?.[0]?.n || 0;
    } else {
      [recos, total] = await Promise.all([
        TradeRecommendation.find(filter)
          .sort({ [sortField]: sortDir })
          .skip(skip)
          .limit(limit)
          .lean(),
        TradeRecommendation.countDocuments(filter),
      ]);
    }

    // Collect unique advisor IDs (stored as strings)
    const advisorIds = [...new Set(
      recos
        .map(r => r.addedBy?.userId)
        .filter(id => id && mongoose.isValidObjectId(id))
    )].map(id => new mongoose.Types.ObjectId(id));

    // Fetch advisor display info for those IDs
    const advisors = advisorIds.length > 0
      ? await Advisor.find({ _id: { $in: advisorIds } })
          .select('_id displayName advisorType accountId')
          .lean()
      : [];

    const advisorMap = {};
    advisors.forEach(a => { advisorMap[a._id.toString()] = a; });

    // Attach advisor info to each recommendation
    const data = recos.map(r => {
      const adv = advisorMap[r.addedBy?.userId] || null;
      return {
        ...r,
        advisor: adv
          ? { _id: adv._id, displayName: adv.displayName, advisorType: adv.advisorType }
          : null,
      };
    });

    return res.status(200).json({
      success: true,
      data,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('[Recommendations] GET /api/recommendations error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch recommendations' });
  }
});

module.exports = router;
