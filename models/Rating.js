const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ratingSchema = new Schema({
  producerId: {
    type: Schema.Types.ObjectId,
    required: true,
    index: true,
    refPath: 'onProducerModel' // Reference the specific producer model type
  },
  onProducerModel: {
    type: String,
    required: true,
    enum: ['Restaurant', 'LeisureProducer', 'BeautyPlace'] // Keep consistent with other models
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User', // Reference the User model in choiceAppDb
    required: true,
    index: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  // Optional: Store individual aspect ratings if needed directly here
  // aspectRatings: {
  //   type: Map,
  //   of: Number
  // },
  comment: {
    type: String,
    trim: true
  },
  // Use Mongoose timestamps for creation date
}, {
  timestamps: true, // Automatically add createdAt and updatedAt
  collection: 'ratings' // Explicit collection name
});

// Indexes for common queries
ratingSchema.index({ producerId: 1, createdAt: -1 });
ratingSchema.index({ userId: 1, producerId: 1 });

// Export the schema. Model registration is handled elsewhere.
module.exports = ratingSchema; 