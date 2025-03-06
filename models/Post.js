const mongoose = require('mongoose');

// Schéma pour la collection `Posts`
const PostSchema = new mongoose.Schema({
  event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: false },
  producer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Producer', required: false },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  title: { type: String, required: true },
  content: { type: String, required: true },
  media: { type: [String], default: [] },
  tags: { type: [String], default: [] },
  location: {
    name: { type: String, required: false },
    coordinates: { type: [Number], default: [] },
    address: { type: String, required: false },
  },
  posted_at: { type: Date, default: Date.now },
});

// Si vous utilisez spécifiquement `choice_app` :
const choiceAppDb = mongoose.connection.useDb('choice_app');

module.exports = choiceAppDb.model('Post', PostSchema);