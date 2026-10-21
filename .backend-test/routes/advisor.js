const express = require('express');
const { body, param, validationResult } = require('express-validator');

const Advisor             = require('../models/Advisor');
const Achievement         = require('../models/Achievement');
const Review              = require('../models/Review');
const TradeRecommendation = require('../models/TradeRecommendation');
const Blog = require('../models/Blog');
const { FINANCE_CATEGORIES } = Blog;
const { advisorAuthMiddleware } = require('../middleware/auth');
const { broadcastRecommendationEmail } = require('../services/emailService');

const router = express.Router();

// ─── Utility: send validation errors ─────────────────────────────────────────
function handleValidationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, errors: errors.array() });
    return true;
  }
  return false;
}

// ─── Utility: validate MongoDB ObjectId param ─────────────────────────────────
const validateId = param('id').isMongoId().withMessage('Invalid advisor id');

// ─── GET /api/advisor/:id ─────────────────────────────────────────────────────
// Public — returns advisor profile (no passwordHash, no reset fields)
router.get('/:id', validateId, async (req, res) => {
  if (handleValidationErrors(req, res)) return;

  const advisor = await Advisor.findById(req.params.id).lean();
  if (!advisor) {
    return res.status(404).json({ success: false, error: 'Advisor not found' });
  }

  return res.status(200).json({ success: true, advisor });
});

// ─── PUT /api/advisor/:id ─────────────────────────────────────────────────────
// Protected — advisor can only update their own profile
const updateValidation = [
  validateId,
  body('displayName').optional().trim().isLength({ max: 100 }),
  body('contactNumber').optional().trim().matches(/^\+?[\d\s\-]{7,20}$/).withMessage('Invalid contact number format'),
  body('about').optional().trim().isLength({ max: 2000 }),
  body('mission').optional().trim().isLength({ max: 1000 }),
  body('vision').optional().trim().isLength({ max: 1000 }),
  body('pnlLink').optional().trim(),
  body('profileLinks').optional().isArray(),
  body('profileLinks.*.platform').optional().trim().notEmpty(),
  body('profileLinks.*.url').optional().trim().isURL().withMessage('Each profileLink url must be a valid URL'),
  body('contactVisibility').optional().isBoolean(),
  // Fields that must NOT be updated via this route
  body('email').not().exists().withMessage('Email cannot be changed via this endpoint'),
  body('passwordHash').not().exists().withMessage('Use /auth/reset-password to change password'),
  body('advisorType').not().exists().withMessage('advisorType cannot be changed after registration'),
];

router.put('/:id', advisorAuthMiddleware, updateValidation, async (req, res) => {
  if (handleValidationErrors(req, res)) return;

  if (req.advisor.id !== req.params.id) {
    return res.status(403).json({ success: false, error: 'You can only update your own profile' });
  }

  const allowed = [
    'displayName', 'contactNumber', 'about', 'mission',
    'vision', 'pnlLink', 'profileLinks', 'contactVisibility',
  ];

  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, error: 'No valid fields provided for update' });
  }

  const advisor = await Advisor.findByIdAndUpdate(
    req.params.id,
    { $set: updates },
    { new: true, runValidators: true }
  ).lean();

  if (!advisor) {
    return res.status(404).json({ success: false, error: 'Advisor not found' });
  }

  return res.status(200).json({ success: true, advisor });
});

// ─── GET /api/advisor/:id/reviews ────────────────────────────────────────────
// Public — only published reviews
router.get('/:id/reviews', validateId, async (req, res) => {
  if (handleValidationErrors(req, res)) return;

  const advisor = await Advisor.exists({ _id: req.params.id });
  if (!advisor) {
    return res.status(404).json({ success: false, error: 'Advisor not found' });
  }

  const reviews = await Review.find({ advisorId: req.params.id, isPublished: true })
    .sort({ createdAt: -1 })
    .lean();

  // Aggregate average rating
  const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
  const averageRating = reviews.length > 0
    ? parseFloat((totalRating / reviews.length).toFixed(2))
    : null;

  return res.status(200).json({ success: true, count: reviews.length, averageRating, reviews });
});

// ─── POST /api/advisor/:id/reviews ───────────────────────────────────────────
// Public — any user can submit a review; defaults to isPublished: false (pending moderation)
const reviewValidation = [
  validateId,
  body('userName').trim().notEmpty().withMessage('userName is required').isLength({ max: 100 }),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be an integer between 1 and 5'),
  body('reviewText').optional().trim().isLength({ max: 2000 }),
];

router.post('/:id/reviews', reviewValidation, async (req, res) => {
  if (handleValidationErrors(req, res)) return;

  const advisor = await Advisor.exists({ _id: req.params.id });
  if (!advisor) {
    return res.status(404).json({ success: false, error: 'Advisor not found' });
  }

  const review = await Review.create({
    advisorId:  req.params.id,
    userName:   req.body.userName,
    rating:     req.body.rating,
    reviewText: req.body.reviewText || '',
    isPublished: false,
  });

  return res.status(201).json({
    success: true,
    message: 'Review submitted successfully and is pending moderation',
    review,
  });
});

// ─── GET /api/advisor/:id/achievements ───────────────────────────────────────
// Public
router.get('/:id/achievements', validateId, async (req, res) => {
  if (handleValidationErrors(req, res)) return;

  const advisor = await Advisor.exists({ _id: req.params.id });
  if (!advisor) {
    return res.status(404).json({ success: false, error: 'Advisor not found' });
  }

  const achievements = await Achievement.find({ advisorId: req.params.id })
    .sort({ year: -1, createdAt: -1 })
    .lean();

  return res.status(200).json({ success: true, count: achievements.length, achievements });
});

// ─── POST /api/advisor/:id/achievements ──────────────────────────────────────
// Protected — only the advisor themselves can add achievements
const achievementValidation = [
  validateId,
  body('title').trim().notEmpty().withMessage('title is required').isLength({ max: 200 }),
  body('description').optional().trim().isLength({ max: 1000 }),
  body('imageUrl').optional().trim().isURL().withMessage('imageUrl must be a valid URL'),
  body('year').optional().isInt({ min: 1900, max: 2100 }).withMessage('year must be a number between 1900 and 2100'),
];

router.post('/:id/achievements', advisorAuthMiddleware, achievementValidation, async (req, res) => {
  if (handleValidationErrors(req, res)) return;

  if (req.advisor.id !== req.params.id) {
    return res.status(403).json({ success: false, error: 'You can only add achievements to your own profile' });
  }

  const advisor = await Advisor.exists({ _id: req.params.id });
  if (!advisor) {
    return res.status(404).json({ success: false, error: 'Advisor not found' });
  }

  const achievement = await Achievement.create({
    advisorId:   req.params.id,
    title:       req.body.title,
    description: req.body.description || '',
    imageUrl:    req.body.imageUrl    || '',
    year:        req.body.year,
  });

  return res.status(201).json({ success: true, achievement });
});

// ─── GET /api/advisor/:id/recommendations ────────────────────────────────────
// Public — returns all recommendations added by this advisor
router.get('/:id/recommendations', validateId, async (req, res) => {
  if (handleValidationErrors(req, res)) return;

  const page  = Math.max(1, parseInt(req.query.page  || 1, 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || 20, 10)));
  const skip  = (page - 1) * limit;

  const filter = { 'addedBy.userId': req.params.id };

  const [data, total] = await Promise.all([
    TradeRecommendation.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    TradeRecommendation.countDocuments(filter),
  ]);

  return res.status(200).json({
    success: true,
    data,
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});

// ─── POST /api/advisor/:id/recommendations ───────────────────────────────────
// Protected — only the advisor themselves can add recommendations
const recoValidation = [
  validateId,
  body('symbol').trim().notEmpty().withMessage('symbol is required'),
  body('tradeType').isIn(['BUY', 'SELL']).withMessage('tradeType must be BUY or SELL'),
  body('entryPrice').isFloat({ min: 0 }).withMessage('entryPrice must be a positive number'),
  body('exitPrice').isFloat({ min: 0 }).withMessage('exitPrice must be a positive number'),
  body('ltp').isFloat({ min: 0 }).withMessage('ltp must be a positive number'),
  body('stopLoss').isFloat({ min: 0 }).withMessage('stopLoss must be a positive number'),
  body('upsidePotential').isFloat({ min: 0 }).withMessage('upsidePotential must be a positive number'),
  body('term').isIn(['SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM', 'INTRADAY']).withMessage('Invalid term'),
  body('reason').trim().isLength({ min: 5 }).withMessage('reason must be at least 5 characters'),
  body('status').optional().isIn(['OPEN', 'CLOSED', 'PARTIAL', 'CANCELLED', 'WATCHLIST']),
  body('visible_status').optional().isIn(['VIEW_TO_ALL', 'PRO_MEMBER', 'PRO_PLUS_MEMBER']),
  body('reference').optional({ checkFalsy: true }).trim().isURL().withMessage('reference must be a valid URL'),
  body('breakoutType').optional().isArray(),
  body('timeline').optional().isArray(),
];

router.post('/:id/recommendations', advisorAuthMiddleware, recoValidation, async (req, res) => {
  if (handleValidationErrors(req, res)) return;

  if (req.advisor.id !== req.params.id) {
    return res.status(403).json({ success: false, error: 'You can only add recommendations to your own profile' });
  }

  const symbol = req.body.symbol.trim().toUpperCase();

  // Prevent duplicate OPEN recommendation for same symbol from this advisor
  const existing = await TradeRecommendation.findOne({
    'addedBy.userId': req.params.id,
    symbol,
    status: 'OPEN',
  });
  if (existing) {
    return res.status(409).json({
      success: false,
      error: `An OPEN recommendation for ${symbol} already exists. Close it before adding a new one.`,
    });
  }

  const reco = await TradeRecommendation.create({
    symbol,
    tradeType:       req.body.tradeType,
    entryPrice:      req.body.entryPrice,
    exitPrice:       req.body.exitPrice,
    ltp:             req.body.ltp,
    stopLoss:        req.body.stopLoss,
    upsidePotential: req.body.upsidePotential,
    term:            req.body.term,
    status:          req.body.status         || 'OPEN',
    visible_status:  req.body.visible_status || 'VIEW_TO_ALL',
    reference:       req.body.reference      || '',
    addedBy: {
      userId: req.params.id,
      name:   req.body.addedBy?.name || '',
    },
    addedDate:    req.body.addedDate    || new Date(),
    breakoutType: req.body.breakoutType || [],
    reason:       req.body.reason,
    timeline:     req.body.timeline     || [],
  });

  // Respond immediately — do NOT await any email broadcast
  // Email sending is deferred to a weekly digest job; do not send per-recommendation
  return res.status(201).json({ success: true, data: reco });
});

// ─── GET /api/advisor/blogs/all ─────────────────────────────────────────────
// Public — returns all blogs from all advisors (for news.html)
router.get('/blogs/all', async (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || 50, 10)));
  const blogs = await Blog.find({})
    .sort({ date: -1 })
    .limit(limit)
    .lean();
  return res.status(200).json({ success: true, count: blogs.length, data: blogs });
});

// ─── GET /api/advisor/:id/blogs ──────────────────────────────────────────────
// Public — returns blogs for a specific advisor
router.get('/:id/blogs', validateId, async (req, res) => {
  if (handleValidationErrors(req, res)) return;

  const advisor = await Advisor.exists({ _id: req.params.id });
  if (!advisor) {
    return res.status(404).json({ success: false, error: 'Advisor not found' });
  }

  const blogs = await Blog.find({ advisorId: req.params.id })
    .sort({ date: -1 })
    .lean();

  return res.status(200).json({ success: true, count: blogs.length, data: blogs });
});

// ─── POST /api/advisor/:id/blogs ─────────────────────────────────────────────
// Protected — only the advisor themselves can add blogs
const blogValidation = [
  validateId,
  body('title').trim().notEmpty().withMessage('title is required').isLength({ max: 300 }),
  body('link').trim().isURL({ require_protocol: true }).withMessage('link must be a valid URL starting with http:// or https://'),
  body('category').trim().isIn(FINANCE_CATEGORIES).withMessage('Invalid category'),
];

router.post('/:id/blogs', advisorAuthMiddleware, blogValidation, async (req, res) => {
  if (handleValidationErrors(req, res)) return;

  if (req.advisor.id !== req.params.id) {
    return res.status(403).json({ success: false, error: 'You can only add blogs to your own profile' });
  }

  const advisor = await Advisor.findById(req.params.id).select('displayName').lean();
  if (!advisor) {
    return res.status(404).json({ success: false, error: 'Advisor not found' });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const blog = await Blog.create({
    advisorId:   req.params.id,
    advisorName: advisor.displayName,
    title:       req.body.title,
    date:        today,
    link:        req.body.link,
    category:    req.body.category,
  });

  return res.status(201).json({ success: true, blog });
});

// ─── DELETE /api/advisor/:id/blogs/:blogId ───────────────────────────────────
// Protected — only the advisor themselves can delete their blog entries
router.delete('/:id/blogs/:blogId', advisorAuthMiddleware, validateId, async (req, res) => {
  if (handleValidationErrors(req, res)) return;

  if (req.advisor.id !== req.params.id) {
    return res.status(403).json({ success: false, error: 'You can only delete your own blogs' });
  }

  const deleted = await Blog.findOneAndDelete({ _id: req.params.blogId, advisorId: req.params.id });
  if (!deleted) {
    return res.status(404).json({ success: false, error: 'Blog entry not found' });
  }

  return res.status(200).json({ success: true, message: 'Blog entry deleted' });
});

module.exports = router;
