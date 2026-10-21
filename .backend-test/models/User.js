/**
 * User model — stores Auth0 user details after first login.
 * One record per Auth0 subject (sub), updated on every login.
 */
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    auth0Id: {
      type:     String,
      required: true,
      unique:   true,
      index:    true,
    },
    email: {
      type:      String,
      required:  true,
      unique:    true,
      lowercase: true,
      trim:      true,
    },
    name: {
      type:  String,
      trim:  true,
      default: '',
    },
    picture: {
      type:    String,
      default: '',
    },
    emailVerified: {
      type:    Boolean,
      default: false,
    },
    lastLogin: {
      type:    Date,
      default: Date.now,
    },
    // Email notification preferences
    emailNotifications: {
      recommendations: { type: Boolean, default: true },  // trade recommendation alerts
    },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model('User', userSchema);
