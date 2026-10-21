const express  = require('express');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

const Advisor = require('../models/Advisor');
const { signAdvisorToken } = require('../middleware/auth');

const router = express.Router();

// ─── Rate limiter: 10 attempts / 15 min per IP on auth endpoints ──────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      10,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, error: 'Too many attempts, please try again later' },
});

// ─── Validation helpers ───────────────────────────────────────────────────────
const registerValidation = [
  body('displayName').trim().notEmpty().withMessage('displayName is required').isLength({ max: 100 }),
  body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('contactNumber').trim().notEmpty().withMessage('contactNumber is required')
    .matches(/^\+?[\d\s\-]{7,20}$/).withMessage('Invalid contact number format'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('advisorType').isIn(['education_institute', 'sebi_registered', 'independent_advisor'])
    .withMessage('advisorType must be one of: education_institute, sebi_registered, independent_advisor'),
  body('about').optional().isLength({ max: 2000 }),
  body('mission').optional().isLength({ max: 1000 }),
  body('vision').optional().isLength({ max: 1000 }),
  body('pnlLink').optional().trim(),
  body('profileLinks').optional().isArray(),
  body('profileLinks.*.platform').optional().trim().notEmpty(),
  body('profileLinks.*.url').optional().trim().isURL().withMessage('Each profileLink url must be a valid URL'),
  body('contactVisibility').optional().isBoolean(),
];

const loginValidation = [
  body('identifier').trim().notEmpty().withMessage('Email or contact number is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

const forgotPasswordValidation = [
  body('identifier').trim().notEmpty().withMessage('Email or contact number is required'),
];

const resetPasswordValidation = [
  body('token').trim().notEmpty().withMessage('Reset token is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
];

// ─── Utility: send validation errors ─────────────────────────────────────────
function handleValidationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, errors: errors.array() });
    return true;
  }
  return false;
}

// ─── POST /api/advisor/auth/register ─────────────────────────────────────────
router.post('/register', authLimiter, registerValidation, async (req, res) => {
  if (handleValidationErrors(req, res)) return;

  const {
    displayName, email, contactNumber, password,
    advisorType, about, mission, vision, pnlLink,
    profileLinks, contactVisibility,
  } = req.body;

  // Check for duplicates
  const existing = await Advisor.findOne({
    $or: [
      { email: email.toLowerCase().trim() },
      { contactNumber: contactNumber.trim() },
    ],
  }).lean();

  if (existing) {
    const field = existing.email === email.toLowerCase().trim() ? 'email' : 'contactNumber';
    return res.status(409).json({ success: false, error: `An advisor with this ${field} already exists` });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const advisor = await Advisor.create({
    displayName,
    email,
    contactNumber,
    passwordHash,
    advisorType,
    about:             about             || '',
    mission:           mission           || '',
    vision:            vision            || '',
    pnlLink:           pnlLink           || '',
    profileLinks:      profileLinks      || [],
    contactVisibility: contactVisibility !== undefined ? contactVisibility : true,
  });

  const token = signAdvisorToken(advisor);

  const profile = advisor.toObject();
  delete profile.passwordHash;

  return res.status(201).json({ success: true, token, advisor: profile });
});

// ─── POST /api/advisor/auth/login ─────────────────────────────────────────────
router.post('/login', authLimiter, loginValidation, async (req, res) => {
  if (handleValidationErrors(req, res)) return;

  const { identifier, password } = req.body;
  const trimmed = identifier.trim();

  // Look up by email OR contactNumber
  const advisor = await Advisor.findOne({
    $or: [
      { email: trimmed.toLowerCase() },
      { contactNumber: trimmed },
    ],
  }).select('+passwordHash').lean();

  if (!advisor) {
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, advisor.passwordHash);
  if (!valid) {
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }

  const token   = signAdvisorToken(advisor);
  const profile = { ...advisor };
  delete profile.passwordHash;

  return res.status(200).json({ success: true, token, advisor: profile });
});

// ─── POST /api/advisor/auth/forgot-password ───────────────────────────────────
// Generates a short-lived reset token. In production, email this token to the advisor.
// Currently, the raw token is returned in the response for integration flexibility.
router.post('/forgot-password', authLimiter, forgotPasswordValidation, async (req, res) => {
  if (handleValidationErrors(req, res)) return;

  const trimmed = req.body.identifier.trim();

  const advisor = await Advisor.findOne({
    $or: [
      { email: trimmed.toLowerCase() },
      { contactNumber: trimmed },
    ],
  }).select('+passwordResetToken +passwordResetExpiry');

  // Always return 200 to prevent user enumeration
  if (!advisor) {
    return res.status(200).json({
      success: true,
      message: 'If this account exists, a reset token has been generated',
    });
  }

  // Generate a secure random token, store its SHA-256 hash
  const rawToken  = crypto.randomBytes(32).toString('hex');
  const hashToken = crypto.createHash('sha256').update(rawToken).digest('hex');

  advisor.passwordResetToken  = hashToken;
  advisor.passwordResetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await advisor.save();

  // TODO: Send rawToken via email (e.g., Nodemailer/SendGrid) in production
  return res.status(200).json({
    success:    true,
    message:    'Password reset token generated. Integrate an email provider to deliver it.',
    resetToken: rawToken, // Remove this in production once email is integrated
  });
});

// ─── POST /api/advisor/auth/reset-password ───────────────────────────────────
router.post('/reset-password', authLimiter, resetPasswordValidation, async (req, res) => {
  if (handleValidationErrors(req, res)) return;

  const { token, newPassword } = req.body;

  const hashToken = crypto.createHash('sha256').update(token.trim()).digest('hex');

  const advisor = await Advisor.findOne({
    passwordResetToken:  hashToken,
    passwordResetExpiry: { $gt: new Date() },
  }).select('+passwordResetToken +passwordResetExpiry +passwordHash');

  if (!advisor) {
    return res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
  }

  advisor.passwordHash        = await bcrypt.hash(newPassword, 12);
  advisor.passwordResetToken  = undefined;
  advisor.passwordResetExpiry = undefined;
  await advisor.save();

  return res.status(200).json({ success: true, message: 'Password reset successfully' });
});

module.exports = router;
