const mongoose = require('mongoose');

// Définir le modèle pour les lieux
const MenuSchema = new mongoose.Schema({
  name: { type: String, required: true },             // Nom du lieu
  gps_coordinates: {                                  // Coordonnées GPS
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  category: { type: [String], required: true },       // Catégories (ex. : ["Restauration"])
  rating: { type: Number, default: null },            // Note moyenne
  address: { type: String, required: true },          // Adresse complète
});

module.exports = mongoose.model('Menu', MenuSchema);
