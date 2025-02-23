const mongoose = require('mongoose');

const ProducerSchema = new mongoose.Schema({
  place_id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, unique: true, sparse: true },
  verified: { type: Boolean, default: false },
  photo: { type: String, default: null },
  description: { type: String, default: '' },
  menu: [
    {
      nom: { type: String },
      description: { type: String },
      prix: { type: String },
      catégorie: { type: String },
    },
  ],
  address: { type: String, required: true },
  gps_coordinates: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: { type: [Number], default: [0, 0] },
  },
  category: { type: [String], default: [] },
  opening_hours: { type: [String], default: [] },
  phone_number: { type: String, default: 'Non spécifié' },
  international_phone_number: { type: String, default: null },
  maps_url: { type: String, default: null },
  website: { type: String, default: 'Non spécifié' },
  business_status: { type: String, default: 'OPERATIONAL' },
  price_level: { type: Number, default: null },
  rating: { type: Number, default: null },
  user_ratings_total: { type: Number, default: null },
  serves_vegetarian_food: { type: String, default: 'Non spécifié' },
  service_options: { type: Object, default: {} },
  popular_times: { type: [Object], default: [] },
  notes_globales: {
    service: { type: Number, default: 0 },
    lieu: { type: Number, default: 0 },
    portions: { type: Number, default: 0 },
    ambiance: { type: Number, default: 0 },
  },
  abonnés: { type: Number, default: 0 },
  photos: { type: [String], default: [] },
  structured_data: {
    type: {
      'Menus Globaux': [
        {
          _id: mongoose.Schema.Types.ObjectId,
          nom: { type: String, required: true },
          prix: { type: String, required: true },
          inclus: [
            {
              catégorie: { type: String, required: true },
              items: [
                {
                  nom: { type: String, required: true },
                  description: { type: String, default: '' },
                  prix: { type: String, required: true },
                  note: { type: String, default: '' },
                },
              ],
            },
          ],
        },
      ],
      'Items Indépendants': [
        {
          catégorie: { type: String, required: true },
          items: [
            {
              _id: mongoose.Schema.Types.ObjectId,
              nom: { type: String, required: true },
              description: { type: String, default: '' },
              prix: { type: Number, required: true },
              note: { type: String, default: '' },
              portion_size: { type: Number, default: null },
              nutrition: {
                calories: { type: Number, default: null },
                carbohydrates: { type: Number, default: null },
                proteins: { type: Number, default: null },
                fats: { type: Number, default: null },
                sodium: { type: Number, default: null },
                fiber: { type: Number, default: null },
                fruits_vegetables: { type: Number, default: null },
                carbon_footprint: { type: Number, default: null },
                nutri_score: { type: String, default: null },
              },
            },
          ],
        },
      ],
    },
    default: {
      'Menus Globaux': [],
      'Items Indépendants': [],
    },
  },
  conversations: { type: [mongoose.Schema.Types.ObjectId], ref: 'Conversation', default: [] },
  abonnés: { type: Number, default: 0 },
});

ProducerSchema.index({ gps_coordinates: '2dsphere' });

module.exports = mongoose.model('Producer', ProducerSchema, 'producers');
