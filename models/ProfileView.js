const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const profileViewSchema = new Schema({
  producerId: {
    type: Schema.Types.ObjectId,
    required: true,
    index: true,
    refPath: 'onModel' // Referencing potentially different producer models
  },
  onModel: { // To specify which Producer model this ID refers to
    type: String,
    required: true,
    enum: ['Restaurant', 'LeisureProducer', 'BeautyPlace'] // Add other producer types if needed
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User', // Assuming your User model is named 'User' in choiceAppDb
    index: true,
    // Not required, allows for anonymous views
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true,
    index: true
  },
  // Optional: Add session ID or device info if needed later
  // sessionId: { type: String },
  // deviceInfo: { type: Object }
}, {
  timestamps: false, // Using custom 'timestamp' field instead of createdAt/updatedAt
  collection: 'profile_views' // Explicit collection name
});

// Optional: Compound index for efficient querying
profileViewSchema.index({ producerId: 1, timestamp: -1 });
profileViewSchema.index({ userId: 1, timestamp: -1 });

// Note: This model should ideally be registered on the 'choiceAppDb' connection
// The registration might happen in a central place or require passing the connection.
// For now, we define the schema. The controller will use the model assumed to be registered.

// We don't register the model here directly to avoid connection issues during import.
// Mongoose handles this by allowing require() before model registration if needed.
// const ProfileView = mongoose.model('ProfileView', profileViewSchema);
// module.exports = ProfileView;

module.exports = profileViewSchema; // Export schema, registration handled elsewhere (e.g., using createModel) 