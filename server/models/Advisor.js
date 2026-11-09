const mongoose = require('mongoose');
const crypto = require('crypto');

const profileLinkSchema = new mongoose.Schema({
  platform: { type: String, trim: true, required: true },
  url:      { type: String, trim: true, required: true },
}, { _id: false });

const advisorSchema = new mongoose.Schema({
  accountId: {
    type:    String,
    unique:  true,
    default: () => 'ADV-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
  },
  displayName: {
    type:     String,
    required: [true, 'Display name is required'],
    trim:     true,
    maxlength: [100, 'Display name cannot exceed 100 characters'],
  },
  contactNumber: {
    type:     String,
    required: [true, 'Contact number is required'],
    unique:   true,
    trim:     true,
    match:    [/^\+?[\d\s\-]{7,20}$/, 'Invalid contact number format'],
  },
  email: {
    type:      String,
    required:  [true, 'Email is required'],
    unique:    true,
    lowercase: true,
    trim:      true,
    match:     [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email format'],
  },
  // Never returned in queries by default — use .select('+passwordHash') explicitly
  passwordHash: {
    type:     String,
    required: true,
    select:   false,
  },
  advisorType: {
    type:     String,
    required: [true, 'Advisor type is required'],
    enum: {
      values:  ['education_institute', 'sebi_registered', 'independent_advisor'],
      message: 'advisorType must be one of: education_institute, sebi_registered, independent_advisor',
    },
  },
  totalRecommendations: { type: Number, default: 0, min: 0 },
  successRate:          { type: Number, default: 0, min: 0, max: 100 },
  joinDate:             { type: Date,   default: Date.now },
  profileLinks:         { type: [profileLinkSchema], default: [] },
  pnlLink:              { type: String, trim: true, default: '' },
  about:                { type: String, trim: true, maxlength: [2000, 'About cannot exceed 2000 characters'], default: '' },
  mission:              { type: String, trim: true, maxlength: [1000, 'Mission cannot exceed 1000 characters'], default: '' },
  vision:               { type: String, trim: true, maxlength: [1000, 'Vision cannot exceed 1000 characters'], default: '' },
  contactVisibility:    { type: Boolean, default: true },

  // Password reset fields — not exposed by default
  passwordResetToken:  { type: String, select: false },
  passwordResetExpiry: { type: Date,   select: false },
}, {
  timestamps: true,   // adds createdAt and updatedAt
  versionKey: false,
});

// Compound indexes
advisorSchema.index({ email: 1 });
advisorSchema.index({ contactNumber: 1 });
advisorSchema.index({ advisorType: 1 });

module.exports = mongoose.model('Advisor', advisorSchema);
