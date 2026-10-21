const mongoose = require('mongoose');

const FINANCE_CATEGORIES = [
  'Market Analysis',
  'Stock Tips',
  'Mutual Funds',
  'IPO',
  'Technical Analysis',
  'Fundamental Analysis',
  'Economy & Macro',
  'Banking & Finance',
  'Commodities',
  'Forex',
  'Crypto',
  'Personal Finance',
];

const blogSchema = new mongoose.Schema(
  {
    advisorId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Advisor',
      required: [true, 'advisorId is required'],
      index:    true,
    },
    advisorName: {
      type:      String,
      required:  [true, 'advisorName is required'],
      trim:      true,
      maxlength: [100, 'advisorName cannot exceed 100 characters'],
    },
    title: {
      type:      String,
      required:  [true, 'Title is required'],
      trim:      true,
      maxlength: [300, 'Title cannot exceed 300 characters'],
    },
    date: {
      type:    Date,
      required: true,
    },
    link: {
      type:    String,
      required: [true, 'Link is required'],
      trim:    true,
      match:   [/^https?:\/\/.+/, 'Link must be a valid URL starting with http:// or https://'],
    },
    category: {
      type:     String,
      required: [true, 'Category is required'],
      enum:     {
        values:  FINANCE_CATEGORIES,
        message: 'Category must be one of the allowed finance categories',
      },
    },
  },
  {
    versionKey: false,
    timestamps: { createdAt: 'createdAt', updatedAt: false },
  }
);

blogSchema.index({ date: -1 });
blogSchema.index({ advisorId: 1, date: -1 });

module.exports = mongoose.model('Blog', blogSchema);
module.exports.FINANCE_CATEGORIES = FINANCE_CATEGORIES;
