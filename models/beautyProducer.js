const mongoose = require('mongoose');
const { beautyWellnessDb } = require('../index');

const BeautyProducerSchema = new mongoose.Schema({
  place_id: String,
  name: String,
  verified: { type: Boolean, default: false },
  featured: { type: Boolean, default: false },
  photo: String,
  description: String,
  services: Array,
  address: String,
  formatted_address: String,
  gps_coordinates: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: [Number]
  },
  location: {
    type: { type: String, enum: ['Point'] },
    coordinates: [Number]
  },
  category: [String],
  service_type: [String],
  specialties: [String],
  opening_hours: [String],
  phone_number: String,
  website: String,
  notes_globales: {
    service: Number,
    lieu: Number,
    quality: Number,
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
  appointment_system: {
    enabled: { type: Boolean, default: false },
    slots: [{
      date: Date,
      start_time: String,
      end_time: String,
      booked: { type: Boolean, default: false },
      booked_by: String
    }]
  },
  staff: [{
    name: String,
    position: String,
    bio: String,
    photo: String,
    specialties: [String]
  }],
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  tags: [String],
  main_image: String,
  services: [{
    name: String,
    description: String,
    price: Number,
    duration: Number,
    category: String
  }],
  phone: String
}, {
  strict: false
});

BeautyProducerSchema.pre('save', function(next) {
  if (this.gps_coordinates && this.gps_coordinates.coordinates && (!this.location || !this.location.coordinates)) {
    this.location = {
      type: 'Point',
      coordinates: this.gps_coordinates.coordinates
    };
  } else if (this.location && this.location.coordinates && (!this.gps_coordinates || !this.gps_coordinates.coordinates)) {
    this.gps_coordinates = {
      type: 'Point',
      coordinates: this.location.coordinates
    };
  }
  
  if (this.phone && !this.phone_number) {
    this.phone_number = this.phone;
  } else if (this.phone_number && !this.phone) {
    this.phone = this.phone_number;
  }
  
  this.updated_at = new Date();
  
  next();
});

BeautyProducerSchema.index({ gps_coordinates: '2dsphere' });
BeautyProducerSchema.index({ location: '2dsphere' });

BeautyProducerSchema.index({
  name: 'text',
  description: 'text',
  tags: 'text',
  specialties: 'text',
  category: 'text',
  service_type: 'text'
});

const BeautyProducer = beautyWellnessDb.model('BeautyProducer', BeautyProducerSchema, 'BeautyPlaces');

module.exports = BeautyProducer; 