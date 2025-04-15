const mongoose = require('mongoose');

/**
 * Schéma pour les établissements de bien-être
 */
const WellnessPlaceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    enum: ['spa', 'yoga', 'massage', 'meditation', 'fitness', 'salon', 'other'],
    required: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: function(v) {
          return v.length === 2 && 
                 v[0] >= -180 && v[0] <= 180 && 
                 v[1] >= -90 && v[1] <= 90;
        },
        message: props => `${props.value} n'est pas une coordonnée valide!`
      }
    },
    address: String,
    city: String,
    postal_code: String,
    country: String
  },
  contact: {
    phone: String,
    email: String,
    website: String,
    social_media: {
      facebook: String,
      instagram: String,
      twitter: String
    }
  },
  business_hours: {
    monday: { open: String, close: String },
    tuesday: { open: String, close: String },
    wednesday: { open: String, close: String },
    thursday: { open: String, close: String },
    friday: { open: String, close: String },
    saturday: { open: String, close: String },
    sunday: { open: String, close: String }
  },
  services: [{
    name: String,
    description: String,
    duration: Number, // en minutes
    price: Number
  }],
  images: [String],
  rating: {
    average: { type: Number, default: 0 },
    count: { type: Number, default: 0 }
  },
  reviews: [{
    user_id: mongoose.Schema.Types.ObjectId,
    rating: Number,
    comment: String,
    date: { type: Date, default: Date.now }
  }],
  amenities: [String],
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  is_verified: { type: Boolean, default: false },
  is_active: { type: Boolean, default: true },
  
  // Support pour les Choice
  choiceUsers: [{
    userId: mongoose.Schema.Types.ObjectId,
    ratings: {
      type: Map,
      of: Number
    },
    comment: String,
    emotions: [String],
    createdAt: { type: Date, default: Date.now }
  }],
  
  // Support pour les Interested
  interestedUsers: [mongoose.Schema.Types.ObjectId],
  
  // Support pour les favoris
  favorites: [mongoose.Schema.Types.ObjectId],
  
  // Compteurs
  choice_count: { type: Number, default: 0 },
  interest_count: { type: Number, default: 0 },
  favorite_count: { type: Number, default: 0 }
}, { 
  strict: false 
});

// Index géospatial
WellnessPlaceSchema.index({ location: '2dsphere' });

// Horodatage mise à jour
WellnessPlaceSchema.pre('save', function(next) {
  this.updated_at = new Date();
  next();
});

// Ajouter un index géospatial pour les recherches de proximité
WellnessPlaceSchema.index({ 'location.coordinates': '2dsphere' });

module.exports = (connection) => {
  return connection.model('WellnessPlace', WellnessPlaceSchema, 'WellnessPlaces');
}; 