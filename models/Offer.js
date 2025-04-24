const mongoose = require('mongoose');
const { customAlphabet } = require('nanoid');

// Generator for short, unique, human-readable codes (e.g., ABC-123)
// Adjust alphabet and size as needed
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const nanoid = customAlphabet(alphabet, 6); // Generates 6-character codes

const offerSchema = new mongoose.Schema({
  producerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Assuming producers are also Users, adjust if ref is to a 'Producer' model
    required: true,
    index: true,
  },
  targetUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  originalSearchQuery: {
    type: String,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  body: {
    type: String,
    required: true,
    trim: true,
  },
  discountPercentage: {
    type: Number,
    min: 0,
    max: 100,
  },
  status: {
    type: String,
    enum: ['pending', 'sent', 'accepted', 'validated', 'expired', 'rejected', 'cancelled'],
    default: 'pending',
    index: true,
  },
  offerCode: {
    type: String,
    required: true,
    unique: true,
    default: () => `CHO-${nanoid()}`, // Generate unique code like CHO-ABC123
    index: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  validatedAt: {
    type: Date,
  },
  // Optional: Store which search activity triggered this
  triggeringSearchId: {
     type: mongoose.Schema.Types.ObjectId,
     ref: 'UserActivity' // Assuming your activity model is named UserActivity
  },
  // Optional: Store product/item ID if offer is specific
  relatedItemId: {
     type: mongoose.Schema.Types.ObjectId
  }
}, {
  timestamps: true // Adds createdAt and updatedAt automatically
});

// Ensure offerCode is unique before saving
// Note: Requires nanoid installation (`npm install nanoid`)
offerSchema.pre('save', function(next) {
  // Generate code if not present (should be handled by default, but as fallback)
  if (!this.offerCode || this.isNew) {
    this.offerCode = `CHO-${nanoid()}`;
  }
  next();
});

// Need to connect this to the correct database connection
// This might need adjustment based on how models are created in your project (e.g., using modelCreator)
// For now, assume a global `db.choiceAppDb` or similar exists.
let Offer;
try {
  if (mongoose.connection.readyState === 1 && mongoose.connection.name === 'choiceAppDb') {
      Offer = mongoose.model('Offer', offerSchema);
  } else {
      // Attempt to get from global or specific connection if defined elsewhere
      const choiceAppDb = mongoose.connections.find(conn => conn.name === 'choiceAppDb') || global.db?.choiceAppDb;
      if (choiceAppDb) {
          Offer = choiceAppDb.model('Offer', offerSchema);
      } else {
          console.warn('⚠️ Offer model could not be registered to choiceAppDb connection. Using default mongoose connection.');
          Offer = mongoose.model('Offer', offerSchema);
      }
  }
} catch (e) {
    // Model already exists, likely due to hot-reloading
    Offer = mongoose.model('Offer');
}

module.exports = Offer; 