const mongoose = require('mongoose');
const { loisirDb } = require('../index');

const LeisureProducerSchema = new mongoose.Schema({
  lieu: String,
  name: String,
  adresse: String,
  address: String,
  localisation: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: [Number]
  },
  location: {
    type: { type: String, enum: ['Point'] },
    coordinates: [Number]
  },
  gps_coordinates: {
    type: { type: String, enum: ['Point'] },
    coordinates: [Number]
  },
  catégorie: [String],
  category: [String],
  description: String,
  image: String,
  photo: String,
  photos: [String],
  phone_number: String,
  phone: String,
  tarifs: mongoose.Schema.Types.Mixed,
  website: String,
  site_url: String,
  hours: [String],
  opening_hours: [String],
  verified: { type: Boolean, default: false },
  rating: Number,
  note_google: String,
  lien_google_maps: String,
  evenements: [{ 
    intitulé: String,
    catégorie: String,
    lien_evenement: String
  }],
  nombre_evenements: { type: Number, default: 0 },
  followers: [String],
  conversations: [String],
  posts: [String],
  abonnés: { type: Number, default: 0 },
  source: String,
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  price_level: Number,
  tags: [String]
}, {
  strict: false
});

LeisureProducerSchema.pre('save', function(next) {
  if (this.localisation && this.localisation.coordinates && this.localisation.coordinates.length === 2) {
    if (!this.location || !this.location.coordinates) {
      this.location = {
        type: 'Point',
        coordinates: this.localisation.coordinates
      };
    }
    if (!this.gps_coordinates || !this.gps_coordinates.coordinates) {
      this.gps_coordinates = {
        type: 'Point',
        coordinates: this.localisation.coordinates
      };
    }
  } else if (this.location && this.location.coordinates && this.location.coordinates.length === 2) {
    if (!this.localisation || !this.localisation.coordinates) {
      this.localisation = {
        type: 'Point',
        coordinates: this.location.coordinates
      };
    }
    if (!this.gps_coordinates || !this.gps_coordinates.coordinates) {
      this.gps_coordinates = {
        type: 'Point',
        coordinates: this.location.coordinates
      };
    }
  } else if (this.gps_coordinates && this.gps_coordinates.coordinates && this.gps_coordinates.coordinates.length === 2) {
    if (!this.localisation || !this.localisation.coordinates) {
      this.localisation = {
        type: 'Point',
        coordinates: this.gps_coordinates.coordinates
      };
    }
    if (!this.location || !this.location.coordinates) {
      this.location = {
        type: 'Point',
        coordinates: this.gps_coordinates.coordinates
      };
    }
  }
  
  if (this.adresse && !this.address) this.address = this.adresse;
  if (this.address && !this.adresse) this.adresse = this.address;
  
  if (this.phone && !this.phone_number) this.phone_number = this.phone;
  if (this.phone_number && !this.phone) this.phone = this.phone_number;
  
  if (this.site_url && !this.website) this.website = this.site_url;
  if (this.website && !this.site_url) this.site_url = this.website;
  
  if (this.catégorie && this.catégorie.length > 0 && (!this.category || this.category.length === 0)) {
    this.category = this.catégorie;
  }
  if (this.category && this.category.length > 0 && (!this.catégorie || this.catégorie.length === 0)) {
    this.catégorie = this.category;
  }
  
  if (this.hours && this.hours.length > 0 && (!this.opening_hours || this.opening_hours.length === 0)) {
    this.opening_hours = this.hours;
  }
  if (this.opening_hours && this.opening_hours.length > 0 && (!this.hours || this.hours.length === 0)) {
    this.hours = this.opening_hours;
  }
  
  this.updated_at = new Date();
  
  next();
});

LeisureProducerSchema.index({ localisation: '2dsphere' });
LeisureProducerSchema.index({ location: '2dsphere' });
LeisureProducerSchema.index({ gps_coordinates: '2dsphere' });

LeisureProducerSchema.index({
  name: 'text',
  description: 'text',
  catégorie: 'text',
  category: 'text',
  tags: 'text'
});

const LeisureProducer = loisirDb.model('LeisureProducer', LeisureProducerSchema, 'Loisir_Paris_Producers');

module.exports = LeisureProducer; 