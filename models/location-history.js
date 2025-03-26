const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Schema for location history tracking
 * Used to verify user presence at locations for choice creation
 */
const LocationHistorySchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  coordinates: {
    type: [Number], // [longitude, latitude]
    required: true,
    index: '2dsphere'
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true,
    index: true
  },
  accuracy: {
    type: Number, // Accuracy in meters
    default: null
  },
  source: {
    type: String, // e.g., 'gps', 'network', 'manual'
    default: 'app'
  }
});

// Create compound index for efficient querying of user locations by time
LocationHistorySchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model('LocationHistory', LocationHistorySchema);