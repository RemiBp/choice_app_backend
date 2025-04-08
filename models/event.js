const mongoose = require('mongoose');
const { loisirDb } = require('../index');

const EventSchema = new mongoose.Schema({
  intitulé: String,
  title: String,
  name: String,
  catégorie: String,
  category: String,
  détail: String,
  detail: String,
  description: String,
  lieu: String,
  location: {
    type: { type: String, enum: ['Point'] },
    coordinates: [Number]
  },
  gps_coordinates: {
    type: { type: String, enum: ['Point'] },
    coordinates: [Number]
  },
  venue: String,
  address: String,
  lien_lieu: String,
  prochaines_dates: String,
  prix_reduit: String,
  ancien_prix: String,
  note: String,
  image: String,
  photo: String,
  photos: [String],
  site_url: String,
  website: String,
  purchase_url: String,
  commentaires: [{
    titre: String,
    note: String,
    contenu: String
  }],
  notes_globales: {
    aspects: mongoose.Schema.Types.Mixed,
    emotions: [String],
    appréciation_globale: String
  },
  catégories_prix: [{
    Catégorie: String,
    Prix: [String]
  }],
  date_debut: String,
  date_fin: String,
  date: String,
  startDate: Date,
  endDate: Date,
  horaires: [{
    jour: String,
    heure: String
  }],
  posts: [String],
  interestedUsers: [String],
  choiceUsers: [{
    userId: String
  }],
  choice_count: { type: Number, default: 0 },
  note_ai: Number,
  rating: Number,
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  price_level: Number,
  tags: [String]
}, {
  strict: false
});

EventSchema.pre('save', function(next) {
  if (this.intitulé && !this.title) this.title = this.intitulé;
  if (this.title && !this.intitulé) this.intitulé = this.title;
  if (this.intitulé && !this.name) this.name = this.intitulé;
  if (this.title && !this.name) this.name = this.title;
  
  if (this.catégorie && !this.category) this.category = this.catégorie;
  if (this.category && !this.catégorie) this.catégorie = this.category;
  
  if (this.détail && !this.detail) this.detail = this.détail;
  if (this.detail && !this.détail) this.détail = this.detail;
  if (this.détail && !this.description) this.description = this.détail;
  if (this.detail && !this.description) this.description = this.detail;
  
  if (this.lieu && !this.address) this.address = this.lieu;
  if (this.venue && !this.address) this.address = this.venue;
  
  if (this.location && this.location.coordinates && (!this.gps_coordinates || !this.gps_coordinates.coordinates)) {
    this.gps_coordinates = {
      type: 'Point',
      coordinates: this.location.coordinates
    };
  } else if (this.gps_coordinates && this.gps_coordinates.coordinates && (!this.location || !this.location.coordinates)) {
    this.location = {
      type: 'Point',
      coordinates: this.gps_coordinates.coordinates
    };
  }
  
  if (this.site_url && !this.website) this.website = this.site_url;
  if (this.website && !this.site_url) this.site_url = this.website;
  
  if (this.note_ai && !this.rating) this.rating = this.note_ai;
  if (this.rating && !this.note_ai) this.note_ai = this.rating;
  
  if (this.date_debut && !this.startDate) {
    try {
      this.startDate = new Date(this.date_debut);
    } catch (e) {
      // Ignore si la conversion échoue
    }
  }
  if (this.date_fin && !this.endDate) {
    try {
      this.endDate = new Date(this.date_fin);
    } catch (e) {
      // Ignore si la conversion échoue
    }
  }
  
  this.updated_at = new Date();
  
  next();
});

EventSchema.index({ location: '2dsphere' });
EventSchema.index({ gps_coordinates: '2dsphere' });

EventSchema.index({
  intitulé: 'text',
  title: 'text',
  name: 'text',
  catégorie: 'text',
  category: 'text',
  description: 'text',
  détail: 'text',
  detail: 'text',
  tags: 'text'
});

const Event = loisirDb.model('Event', EventSchema, 'Loisir_Paris_Evenements');

module.exports = Event; 