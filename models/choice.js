const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Schema for user choices/ratings for locations
 * Used to store ratings, emotions, and other feedback
 */
const ChoiceSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  locationId: {
    type: Schema.Types.ObjectId,
    required: true,
    index: true
  },
  locationType: {
    type: String,
    enum: ['restaurant', 'event'],
    required: true
  },
  ratings: {
    type: Map,
    of: Number,
    default: {},
    validate: {
      validator: function(ratings) {
        // Ensure all ratings are between 0 and 10
        for (const rating of Object.values(ratings)) {
          if (rating < 0 || rating > 10) return false;
        }
        return true;
      },
      message: 'Ratings must be between 0 and 10'
    }
  },
  emotions: [{
    type: String,
    trim: true
  }],
  menuItems: [{
    type: Schema.Types.ObjectId,
    ref: 'MenuItem'
  }],
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  comment: {
    type: String,
    trim: true
  }
});

// Create compound indexes for efficient queries
ChoiceSchema.index({ userId: 1, timestamp: -1 });
ChoiceSchema.index({ locationId: 1, locationType: 1 });

module.exports = mongoose.model('Choice', ChoiceSchema);