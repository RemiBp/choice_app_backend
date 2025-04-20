const mongoose = require('mongoose');

module.exports = (connection) => {
  const BeautyProducerSchema = new mongoose.Schema({
    place_id: { type: String, unique: true },
    name: String,
    verified: { type: Boolean, default: false },
    featured: { type: Boolean, default: false },
    photo: String,
    description: String,
    address: String,
    formatted_address: String,
    gps_coordinates: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: [Number]
    },
    category: [String],
    services: [String],
    specialties: [String],
    opening_hours: [String],
    phone_number: String,
    website: String,
    notes_globales: {
      accueil: Number,
      lieu: Number,
      prestations: Number,
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
    updated_at: { type: Date, default: Date.now },
    hours_of_operation: {
      monday: { opening: String, closing: String, closed: Boolean },
      tuesday: { opening: String, closing: String, closed: Boolean },
      wednesday: { opening: String, closing: String, closed: Boolean },
      thursday: { opening: String, closing: String, closed: Boolean },
      friday: { opening: String, closing: String, closed: Boolean },
      saturday: { opening: String, closing: String, closed: Boolean },
      sunday: { opening: String, closing: String, closed: Boolean }
    },
    amenities: [String],
    pricing: {
      service_list: [{
        name: String,
        price: Number,
        duration: Number
      }]
    },
    staff: [{
      name: String,
      role: String,
      specialties: [String],
      bio: String,
      photo: String
    }],
    booking_url: String,
    accepts_insurance: Boolean,
    certification: [String]
  }, {
    strict: false
  });

  // Ajouter l'index géospatial
  BeautyProducerSchema.index({ gps_coordinates: '2dsphere' });
  if (BeautyProducerSchema.path('location')) {
    BeautyProducerSchema.index({ location: '2dsphere' });
  }

  return connection.model('BeautyProducer', BeautyProducerSchema, 'Beauty_Paris_Producers');
}; 