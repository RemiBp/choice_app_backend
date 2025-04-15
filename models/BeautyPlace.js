const mongoose = require('mongoose');

/**
 * Schéma pour les établissements de beauté et bien-être
 */
const BeautyPlaceSchema = new mongoose.Schema({
  // Champs d'identifiants
  place_id: { type: String, index: true }, // Google Maps place_id utilisé par wellness.py
  name: { type: String, required: true, index: true },
  address: { type: String, required: true },
  full_address: { type: String }, // Adresse complète fournie par wellness.py

  // Champs pour la localisation géographique
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
  gps_coordinates: { // Format utilisé par wellness.py
    lat: { type: Number },
    lng: { type: Number }
  },

  // Catégorisation
  category: { type: String, required: true, index: true },
  sous_categorie: { type: String, index: true }, // Utilisé par wellness.py
  specialties: { type: [String], default: [] },
  google_type: { type: String }, // Type de lieu dans Google Maps
  
  // Evaluation
  rating: { type: Number, default: 0 },
  user_ratings_total: { type: Number, default: 0 }, // Nombre total d'avis (Google)
  average_score: { type: Number, default: 2.5 }, // Score moyen global (wellness.py)
  
  // Notes détaillées par critère
  notes: { 
    type: mongoose.Schema.Types.Mixed, 
    default: {} 
  }, // Ex: {"Qualité des soins": 4.2, "Propreté": 3.8, etc.}
  
  // Caractéristiques de l'établissement
  amenities: { type: [String], default: [] },
  service_types: { type: [String], default: [] },
  description: { type: String },
  
  // Images
  images: { type: [String], default: [] },
  main_image: { type: String },
  photos: { 
    type: [{
      url: { type: String },
      source: { type: String },
      is_main_screenshot: { type: Boolean, default: false }
    }], 
    default: [] 
  }, // Format utilisé par wellness.py
  profile_photo: { type: String }, // Image principale (wellness.py)
  
  // Informations pratiques
  opening_hours: { type: [String], default: [] },
  phone: { type: String },
  website: { type: String },
  price_level: { type: Number, min: 1, max: 5 },
  price_range: { type: String },
  
  // Sources externes
  tripadvisor_url: { type: String },
  comments_source: { type: String },
  
  // Commentaires et avis
  reviews: [{
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rating: { type: Number, min: 1, max: 5 },
    comment: { type: String },
    date: { type: Date, default: Date.now }
  }],
  
  // Format de commentaires utilisé par wellness.py
  comments: [{
    author_name: { type: String },
    rating: { type: Number },
    text: { type: String },
    time: { type: Date },
    language: { type: String }
  }],
  
  // Métadonnées
  tags: { type: [String], default: [] },
  certification: { type: String },
  is_bio: { type: Boolean, default: false },
  featured: { type: Boolean, default: false },
  creation_date: { type: Date, default: Date.now },
  last_updated: { type: Date, default: Date.now },
  
  // Statistiques
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
  category: 'text',
  sous_categorie: 'text'
});

// Index géospatial
BeautyPlaceSchema.index({ location: '2dsphere' });

// Index sur place_id pour les recherches rapides
BeautyPlaceSchema.index({ place_id: 1 });

// Horodatage mise à jour
BeautyPlaceSchema.pre('save', function(next) {
  this.last_updated = new Date();
  
  // Synchroniser les coordonnées GPS si manquantes mais location présent
  if (this.location && this.location.coordinates && 
      (!this.gps_coordinates || !this.gps_coordinates.lat || !this.gps_coordinates.lng)) {
    this.gps_coordinates = {
      lng: this.location.coordinates[0],
      lat: this.location.coordinates[1]
    };
  }
  
  // Synchroniser location si manquant mais gps_coordinates présent
  if (this.gps_coordinates && this.gps_coordinates.lat && this.gps_coordinates.lng &&
      (!this.location || !this.location.coordinates)) {
    this.location = {
      type: 'Point',
      coordinates: [this.gps_coordinates.lng, this.gps_coordinates.lat]
    };
  }
  
  next();
});

module.exports = (connection) => {
  return connection.model('BeautyPlace', BeautyPlaceSchema, 'BeautyPlaces');
}; 