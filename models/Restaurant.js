const mongoose = require('mongoose');

const RestaurantSchema = new mongoose.Schema({
  name: String,
  address: String,
  gps_coordinates: {
    type: { type: String, default: "Point" },
    coordinates: { type: [Number], required: true }, // [longitude, latitude]
  },
  rating: Number,
  price_level: Number,
  category: [String],
  maps_url: String,
  menus_structures: Object, // Pour stocker les menus
}, { strict: false }); // Permet d'accepter des champs supplémentaires

// Ajoute un index géospatial pour les recherches
RestaurantSchema.index({ gps_coordinates: "2dsphere" });

module.exports = mongoose.model('Restaurant', RestaurantSchema);
