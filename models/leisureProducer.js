const mongoose = require('mongoose');

module.exports = (connection) => {
  if (!connection) {
    throw new Error("LeisureProducer model requires a valid DB connection! (connection is undefined)");
  }
  const LeisureProducerSchema = new mongoose.Schema({
    lieu: { type: String, required: true },
    adresse: { type: String, required: true },
    description: { type: String, required: true },
    nombre_evenements: Number,
    evenements: [{
      intitulé: String,
      catégorie: String,
      lien_evenement: String
    }],
    lien_lieu: { type: String, required: true },
    location: {
      type: { 
        type: String, 
        enum: ['Point'], 
        default: 'Point', 
        required: true 
      },
      coordinates: { 
        type: [Number], 
        required: true 
      }
    },
    source: { type: String, required: true },
    image: { type: String, required: true },
    telephone: String,
    site_web: String,
    note_google: mongoose.Schema.Types.Mixed,
    lien_google_maps: String,
    place_id: { type: String, unique: true, sparse: true },
    name: String,
    verified: { type: Boolean, default: false },
    featured: { type: Boolean, default: false },
    photo: String,
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
    followings: [String],
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

  // Ensure the 2dsphere index exists on gps_coordinates and the new location field
  LeisureProducerSchema.index({ gps_coordinates: '2dsphere' });
  LeisureProducerSchema.index({ location: '2dsphere' });

  // Use the connection parameter
  const LeisureProducer = connection.model('LeisureProducer', LeisureProducerSchema, 'Loisir_Paris_Producers');

  // Verify and create index if needed
  console.log('🔍 Vérification des index pour le modèle LeisureProducer...');
  LeisureProducer.collection.getIndexes()
    .then(indexes => {
      console.log('✅ Index disponibles pour LeisureProducer:', Object.keys(indexes));
      const hasGpsIndex = indexes['gps_coordinates_2dsphere'] !== undefined;
      const hasLocationIndex = indexes['location_2dsphere'] !== undefined;
      console.log(`📊 Index gps_coordinates_2dsphere: ${hasGpsIndex ? 'Présent ✓' : 'Absent ✗'}`);
      console.log(`📊 Index location_2dsphere: ${hasLocationIndex ? 'Présent ✓' : 'Absent ✗'}`);
      
      // If the index doesn't exist, create it explicitly
      const indexPromises = [];
      if (!hasGpsIndex) {
        console.log('⚠️ Création de l\'index manquant: gps_coordinates_2dsphere pour LeisureProducer');
        indexPromises.push(LeisureProducer.collection.createIndex({ gps_coordinates: '2dsphere' }));
      }
      if (!hasLocationIndex) {
        console.log('⚠️ Création de l\'index manquant: location_2dsphere pour LeisureProducer');
        indexPromises.push(LeisureProducer.collection.createIndex({ location: '2dsphere' }));
      }
      return Promise.all(indexPromises);
    })
    .catch(err => {
      console.error('❌ Erreur lors de la vérification/création des index pour LeisureProducer:', err);
    });

  return LeisureProducer;
}; 