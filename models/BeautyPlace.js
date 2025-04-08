const mongoose = require('mongoose');
const { beautyWellnessDb } = require('../index');

/**
 * Schéma pour les établissements de beauté et bien-être
 */
const BeautyPlaceSchema = new mongoose.Schema({
  name: { type: String, required: true, index: true },
  address: { type: String, required: true },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
      required: true
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
      index: '2dsphere'
    }
  },
  category: { type: String, required: true, index: true },
  rating: { type: Number, default: 0 },
  specialties: { type: [String], default: [] },
  amenities: { type: [String], default: [] },
  service_types: { type: [String], default: [] },
  description: { type: String },
  images: { type: [String], default: [] },
  main_image: { type: String },
  opening_hours: { type: [String], default: [] },
  phone: { type: String },
  website: { type: String },
  price_level: { type: Number, min: 1, max: 5 },
  price_range: { type: String },
  reviews: [{
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rating: { type: Number, min: 1, max: 5 },
    comment: { type: String },
    date: { type: Date, default: Date.now }
  }],
  tags: { type: [String], default: [] },
  certification: { type: String },
  is_bio: { type: Boolean, default: false },
  featured: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  choices_count: { type: Number, default: 0 },
  views_count: { type: Number, default: 0 },
  interests_count: { type: Number, default: 0 },
  // Champ pour relier à la collection de producteurs centrale
  producer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Producer' },
  // Champs spécifiques au bien-être
  benefits: { type: [String], default: [] },
  treatments: { type: [String], default: [] },
  services: [{
    name: { type: String, required: true },
    description: { type: String },
    price: { type: Number },
    duration: { type: Number }, // durée en minutes
    category: { type: String }
  }],
  staff: [{
    name: { type: String },
    specialties: { type: [String] },
    bio: { type: String },
    image: { type: String }
  }],
  appointments_available: { type: Boolean, default: true },
  type: { type: String, default: 'wellness' } // Type d'établissement (wellness, beauty, etc.)
});

// Index textuels pour la recherche
BeautyPlaceSchema.index({
  name: 'text',
  description: 'text',
  tags: 'text',
  specialties: 'text',
  category: 'text'
});

// Index géospatial
BeautyPlaceSchema.index({ location: '2dsphere' });

// Horodatage mise à jour
BeautyPlaceSchema.pre('save', function(next) {
  this.updated_at = new Date();
  next();
});

module.exports = beautyWellnessDb.model('BeautyPlace', BeautyPlaceSchema, 'BeautyPlaces'); 