const mongoose = require('mongoose');

const SentPushSchema = new mongoose.Schema({
  producerId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  targetUserId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  timestamp: { type: Date, default: Date.now, index: true },
  title: { type: String, required: true },
  body: { type: String, required: true },
  queryTrigger: { type: String }, // The search query that triggered this (if applicable)
  offerDetails: { // Details of the offer sent
    discount: { type: Number },
    durationHours: { type: Number },
    customMessage: { type: Boolean, default: false } // Was it a custom message?
  },
  fcmMessageId: { type: String }, // Response ID from FCM
  status: { type: String, enum: ['success', 'failure'], default: 'success' },
  failureReason: { type: String } // If status is 'failure'
}, {
  timestamps: true // Adds createdAt and updatedAt
});

module.exports = SentPushSchema; 