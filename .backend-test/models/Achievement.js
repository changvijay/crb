const mongoose = require('mongoose');

const achievementSchema = new mongoose.Schema({
  advisorId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Advisor',
    required: [true, 'advisorId is required'],
    index:    true,
  },
  title: {
    type:      String,
    required:  [true, 'Title is required'],
    trim:      true,
    maxlength: [200, 'Title cannot exceed 200 characters'],
  },
  description: {
    type:      String,
    trim:      true,
    maxlength: [1000, 'Description cannot exceed 1000 characters'],
    default:   '',
  },
  imageUrl: {
    type:  String,
    trim:  true,
    match: [/^https?:\/\/.+/, 'imageUrl must be a valid URL'],
    default: '',
  },
  year: {
    type:    Number,
    min:     [1900, 'Year must be 1900 or later'],
    max:     [2100, 'Year must be 2100 or earlier'],
  },
  createdAt: {
    type:    Date,
    default: Date.now,
  },
}, {
  versionKey: false,
});

module.exports = mongoose.model('Achievement', achievementSchema);
