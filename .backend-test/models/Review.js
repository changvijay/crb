const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  advisorId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Advisor',
    required: [true, 'advisorId is required'],
    index:    true,
  },
  userName: {
    type:      String,
    required:  [true, 'User name is required'],
    trim:      true,
    maxlength: [100, 'User name cannot exceed 100 characters'],
  },
  rating: {
    type:     Number,
    required: [true, 'Rating is required'],
    min:      [1, 'Rating must be at least 1'],
    max:      [5, 'Rating cannot exceed 5'],
    validate: {
      validator: Number.isInteger,
      message:   'Rating must be a whole number between 1 and 5',
    },
  },
  reviewText: {
    type:      String,
    trim:      true,
    maxlength: [2000, 'Review text cannot exceed 2000 characters'],
    default:   '',
  },
  // Defaults to false — requires admin/advisor moderation before showing publicly
  isPublished: {
    type:    Boolean,
    default: false,
  },
  createdAt: {
    type:    Date,
    default: Date.now,
  },
}, {
  versionKey: false,
});

module.exports = mongoose.model('Review', reviewSchema);
