const mongoose = require('mongoose');

const FIIDIIDataSchema = new mongoose.Schema({
  date: { 
    type: String, 
    required: true, 
    unique: true,  // Prevent duplicate dates
    index: true 
  },
  dateLabel: { type: String },
  fii: { type: Number, required: true },
  dii: { type: Number, required: true },
  netFlow: { type: Number },
  source: { type: String, default: 'NSE API' },
  
  // Additional NSE API fields
  fiiData: {
    buyValue: { type: Number },
    sellValue: { type: Number },
    netValue: { type: Number }
  },
  diiData: {
    buyValue: { type: Number },
    sellValue: { type: Number }, 
    netValue: { type: Number }
  },
  
  fetchedAt: { type: Date, default: Date.now },
  isBusinessDay: { type: Boolean, default: true }
}, {
  timestamps: true,
  collection: 'FIIDIIData'
});

FIIDIIDataSchema.index({ date: -1, isBusinessDay: 1 });

module.exports = mongoose.model('FIIDIIData', FIIDIIDataSchema);