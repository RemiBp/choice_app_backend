const mongoose = require('mongoose');
const { restaurationDb } = require('../index');

const ProducerSchema = new mongoose.Schema({
  place_id: { type: String, unique: true },
  name: String,
  verified: { type: Boolean, default: false },
  featured: { type: Boolean, default: false },
  photo: String,
  description: String,
  menu: Array,
  menu_items: Array,
  address: String,
  formatted_address: String,
  gps_coordinates: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: [Number]
  },
  category: [String],
  cuisine_type: [String],
  specialties: [String],
  opening_hours: [String],
  phone_number: String,
  website: String,
  notes_globales: {
    service: Number,
    lieu: Number,
    portions: Number,
    ambiance: Number
  },
  abonnés: { type: Number, default: 0 },
  photos: [String],
  rating: Number,
  user_ratings_total: Number,
  price_level: Number,
  structured_data: mongoose.Schema.Types.Mixed,
  conversations: [String],
  posts: [String],
  followers: [String],
  business_status: String,
  formatted_phone_number: String,
  international_phone_number: String,
  types: [String],
  url: String,
  vicinity: String,
  geometry: {
    location: {
      lat: Number,
      lng: Number
    },
  },
  icon: String,
  icon_background_color: String,
  icon_mask_base_uri: String,
  permanently_closed: { type: Boolean, default: false },
  reviews: Array,
  utc_offset_minutes: Number,
  wheelchair_accessible_entrance: Boolean,
  plus_code: {
    compound_code: String,
    global_code: String
  },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, {
  strict: false
});

// Ajouter l'index géospatial
ProducerSchema.index({ gps_coordinates: '2dsphere' });
if (ProducerSchema.path('location')) {
  ProducerSchema.index({ location: '2dsphere' });
}

const Producer = restaurationDb.model('Producer', ProducerSchema, 'Paris_Restaurants');

// Export standard
module.exports = Producer;
// Export utilisé dans les controllers pour la compatibilité
module.exports.Producer = Producer;
