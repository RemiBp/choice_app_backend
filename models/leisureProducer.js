const mongoose = require('mongoose');

module.exports = (connection) => {
  const LeisureProducerSchema = new mongoose.Schema({
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
    activities: [String],
    specialties: [String],
    opening_hours: [String],
    phone_number: String,
    website: String,
    notes_globales: {
      accueil: Number,
      lieu: Number,
      activités: Number,
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
    events: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Event' }],
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
    entry_fee: {
      adult: Number,
      child: Number,
      senior: Number,
      student: Number
    },
    age_restrictions: String,
    booking_required: Boolean,
    cancellation_policy: String,
    accessibility_features: [String],
    seasonal_availability: {
      spring: Boolean,
      summer: Boolean,
      fall: Boolean,
      winter: Boolean
    }
  }, {
    strict: false
  });

  // Ensure the 2dsphere index exists on gps_coordinates
  LeisureProducerSchema.index({ gps_coordinates: '2dsphere' });

  // Use the connection parameter
  const LeisureProducer = connection.model('LeisureProducer', LeisureProducerSchema, 'Paris_Loisirs');

  // Verify and create index if needed
  console.log('🔍 Vérification des index pour le modèle LeisureProducer...');
  LeisureProducer.collection.getIndexes()
    .then(indexes => {
      console.log('✅ Index disponibles pour LeisureProducer:', Object.keys(indexes));
      const hasGpsIndex = indexes['gps_coordinates_2dsphere'] !== undefined;
      console.log(`📊 Index gps_coordinates_2dsphere: ${hasGpsIndex ? 'Présent ✓' : 'Absent ✗'}`);
      
      // If the index doesn't exist, create it explicitly
      if (!hasGpsIndex) {
        console.log('⚠️ Création de l\'index manquant: gps_coordinates_2dsphere pour LeisureProducer');
        return LeisureProducer.collection.createIndex({ gps_coordinates: '2dsphere' });
      }
    })
    .catch(err => {
      console.error('❌ Erreur lors de la vérification/création des index pour LeisureProducer:', err);
    });

  return LeisureProducer;
}; 