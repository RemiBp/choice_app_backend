const mongoose = require('mongoose');
const { Schema } = mongoose;

// Change this to use a function pattern like UserModels.js
module.exports = (connection) => {
  // --- ADDED: Schema for users who made a choice at this producer ---
  const ChoiceUserSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    ratings: { type: Map, of: Number }, // Contains ratings like service, lieu, etc.
    comment: { type: String, default: '' },
    menuItems: { type: Array, default: [] }, // Specific to restaurant choices
    // Note: emotions are usually linked to events/wellness, maybe not directly stored here? Check choices.js if needed.
    createdAt: { type: Date, default: Date.now }
  }, { _id: false });

  const ProducerSchema = new mongoose.Schema({
    place_id: { type: String, unique: true, sparse: true },
    name: { type: String, required: true },
    verified: { type: Boolean, default: false },
    featured: { type: Boolean, default: false },
    photo: String,
    description: String,
    menu: Array,
    menu_items: Array,
    address: { type: String, required: true },
    formatted_address: String,
    gps_coordinates: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: [Number]
    },
    category: [String],
    cuisine_type: [String],
    specialties: [String],
    opening_hours: [String],
    phone_number: String,
    website: String,
    platform_links: {
      thefork: String,
      tripadvisor: String
    },
    service_options: {
      dine_in: Boolean,
      takeaway: Boolean,
      delivery: Boolean
    },
    menus_structures: mongoose.Schema.Types.Mixed,
    notes_globales: {
      service: Number,
      lieu: Number,
      portions: Number,
      ambiance: Number
    },
    abonnés: { type: Number, default: 0 },
    photos: [String],
    rating: Number,
    user_ratings_total: Number,
    price_level: Number,
    structured_data: mongoose.Schema.Types.Mixed,
    conversations: [String],
    posts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
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
    // Abonnement et données financières
    subscription: {
      level: { type: String, enum: ['gratuit', 'starter', 'pro', 'legend'], default: 'gratuit' },
      start_date: { type: Date },
      end_date: { type: Date },
      stripe_subscription_id: String,
      auto_renew: { type: Boolean, default: true },
      payment_method: String,
      status: { type: String, enum: ['active', 'past_due', 'canceled', 'unpaid'], default: 'active' }
    },
    // Historique des transactions
    transaction_history: [{
      transaction_id: String,
      type: { type: String, enum: ['subscription', 'refund', 'one_time', 'adjustment'] },
      amount: Number,
      currency: { type: String, default: 'EUR' },
      status: { type: String, enum: ['succeeded', 'pending', 'failed', 'refunded'] },
      payment_method: String,
      description: String,
      metadata: mongoose.Schema.Types.Mixed,
      created_at: { type: Date, default: Date.now }
    }],
    // Historique des changements d'abonnements
    subscription_history: [{
      previous_level: String,
      new_level: String,
      date: { type: Date, default: Date.now },
      reason: String,
      subscription_id: String
    }],
    payment_methods: [{
      method_id: String,
      type: { type: String, enum: ['card', 'bank_account', 'apple_pay', 'google_pay'], default: 'card' },
      last4: String,
      brand: String,
      expiry_date: String,
      is_default: { type: Boolean, default: false },
      created_at: { type: Date, default: Date.now }
    }],
    stripe_customer_id: String,
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    // --- ADJUSTED: Fields for relations ---
    followers: {
      count: { type: Number, default: 0 },
      users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
    },
    following: {
      count: { type: Number, default: 0 },
      users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
    },
    interestedUsers: {
      count: { type: Number, default: 0 },
      users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
    },
    // --- EXISTING: Fields related to user choices ---
    choiceUsers: [ChoiceUserSchema],
    choiceCount: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 }, // Count of users who provided ratings
    ratingTotals: { // Sum of ratings for calculating averages
      service: { type: Number, default: 0 },
      lieu: { type: Number, default: 0 },
      portions: { type: Number, default: 0 },
      ambiance: { type: Number, default: 0 },
      proprete: { type: Number, default: 0 }, // For wellness/beauty? Check usage
      expertise: { type: Number, default: 0 }  // For wellness/beauty? Check usage
      // Add other rating keys if needed (e.g., 'qualite' for events)
    }
    // --- END ADDED ---
  }, {
    strict: false
  });

  // Ajouter l'index géospatial et s'assurer qu'il est créé correctement
  ProducerSchema.index({ gps_coordinates: '2dsphere' });
  ProducerSchema.index({ "geometry.location": '2dsphere' });

  // Use the connection parameter instead of directly referencing restaurationDb
  const Producer = connection.model('Producer', ProducerSchema, 'producers');

  // Vérification des index
  console.log('🔍 Vérification des index pour le modèle Producer...');
  Producer.collection.getIndexes()
    .then(indexes => {
      console.log('✅ Index disponibles pour Producer:', Object.keys(indexes));
      const hasGpsIndex = indexes['gps_coordinates_2dsphere'] !== undefined;
      const hasGeometryIndex = indexes['geometry.location_2dsphere'] !== undefined;
      console.log(`📊 Index gps_coordinates_2dsphere: ${hasGpsIndex ? 'Présent ✓' : 'Absent ✗'}`);
      console.log(`📊 Index geometry.location_2dsphere: ${hasGeometryIndex ? 'Présent ✓' : 'Absent ✗'}`);
      
      // Si les index n'existent pas, les créer explicitement
      const indexPromises = [];
      if (!hasGpsIndex) {
        console.log('⚠️ Création de l\'index manquant: gps_coordinates_2dsphere');
        indexPromises.push(Producer.collection.createIndex({ gps_coordinates: '2dsphere' }));
      }
      if (!hasGeometryIndex) {
        console.log('⚠️ Création de l\'index manquant: geometry.location_2dsphere');
        indexPromises.push(Producer.collection.createIndex({ "geometry.location": '2dsphere' }));
      }
      
      return Promise.all(indexPromises);
    })
    .catch(err => {
      console.error('❌ Erreur lors de la vérification/création des index:', err);
    });

  return Producer;
};
