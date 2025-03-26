const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Schema for events
 * Used for tracking events, locations, and user feedback
 */
const EventSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  description: {
    type: String,
    trim: true
  },
  coordinates: {
    type: [Number], // [longitude, latitude]
    required: true,
    index: '2dsphere'
  },
  address: {
    type: String,
    trim: true
  },
  startDate: {
    type: Date,
    required: true,
    index: true
  },
  endDate: {
    type: Date,
    required: true,
    index: true
  },
  category: {
    type: String,
    trim: true,
    index: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  // Rating data
  ratings: {
    type: Map,
    of: Number,
    default: {}
  },
  ratingCounts: {
    type: Map,
    of: Number,
    default: {}
  },
  // Emotion tracking
  emotionCounts: {
    type: Map,
    of: Number,
    default: {}
  },
  popularEmotions: [{
    type: String,
    trim: true
  }],
  // Additional info
  images: [{
    type: String,
    trim: true
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Create indexes for efficient querying
EventSchema.index({ startDate: 1, endDate: 1 });
EventSchema.index({ category: 1 });
EventSchema.index({ "ratings.overall": -1 });

module.exports = mongoose.model('Event', EventSchema);