const mongoose = require('mongoose');

// Schéma pour les messages
const MessageSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

// Schéma pour les conversations
const ConversationSchema = new mongoose.Schema({
  participants: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true, // Validation pour s'assurer que les participants sont fournis
      validate: {
        validator: mongoose.Types.ObjectId.isValid,
        message: 'Participant doit être un ObjectId valide.',
      },
    },
  ],
  messages: [MessageSchema],
  lastUpdated: { type: Date, default: Date.now },
});

// Créer un tableau de participants à partir des IDs
module.exports.createConversationParticipants = (senderId, recipientIds) => {
  if (!senderId || !recipientIds) {
    throw new Error('Les IDs des participants ne peuvent pas être vides.');
  }

  return [senderId, ...recipientIds].map((id) => mongoose.Types.ObjectId(id));
};

// Exporter le modèle Conversation
module.exports = mongoose.model('Conversation', ConversationSchema);
