const mongoose = require('mongoose');

const RestaurantSchema = new mongoose.Schema({
  name: String,
  address: String,
  coordinates: {
    type: {
      type: String,
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    }
  },
  gps_coordinates: {
    type: { type: String, default: "Point" },
    coordinates: { type: [Number], required: true }, // [longitude, latitude]
  },
  place_id: String,
  photos: [String],
  rating: Number,
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
  price_level: Number,
  category: [String],
  maps_url: String,
  website: String,
  phone: String,
  opening_hours: Object,
  business_status: String,
  vicinity: String,
  description: String,
  menus_structures: Object, // Pour stocker les structures de menus
}, { 
  strict: false // Permet d'accepter des champs supplémentaires
});

// Ajouter un index géospatial pour les recherches
RestaurantSchema.index({ "gps_coordinates": "2dsphere" });
RestaurantSchema.index({ "coordinates": "2dsphere" });

module.exports = mongoose.model('Restaurant', RestaurantSchema);
