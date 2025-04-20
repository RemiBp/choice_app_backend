const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MessageSchema = new Schema({
  conversationId: {
    type: Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true
  },
  senderId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true
  },
  contentType: {
    type: String,
    enum: ['text', 'image', 'video', 'location', 'audio', 'document', 'contact', 'shared_post'],
    default: 'text'
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  // Stocke l'état de lecture pour chaque participant sous forme d'objet
  // Format: { "userId1": true, "userId2": false }
  isRead: {
    type: Schema.Types.Mixed,
    default: {}
  },
  // Pour les messages partageant du contenu (post, event, etc.)
  sharedContent: {
    type: Schema.Types.Mixed,
    default: null
  },
  // Support pour le tag d'utilisateurs dans les messages
  mentions: [{
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    username: { type: String },
    displayName: { type: String },
    startIndex: { type: Number },
    endIndex: { type: Number }
  }],
  // Support pour les pièces jointes
  attachments: {
    type: [String],
    default: []
  }
}, { timestamps: true });

// Méthode pour marquer le message comme lu par un utilisateur
MessageSchema.methods.markAsReadBy = function(userId) {
  if (!this.isRead) {
    this.isRead = {};
  }
  this.isRead[userId.toString()] = true;
  return this.save();
};

// Méthode pour vérifier si le message est lu par un utilisateur
MessageSchema.methods.isReadBy = function(userId) {
  return this.isRead && this.isRead[userId.toString()] === true;
};

// Fonction pour créer le modèle avec une connexion spécifique
const createMessageModel = (connection) => {
  return connection.model('Message', MessageSchema);
};

// Création du modèle par défaut avec la connexion par défaut
const Message = mongoose.model('Message', MessageSchema);

// Exporter le schéma, le modèle par défaut et la fonction pour créer un modèle avec une connexion spécifique
module.exports = Message;
module.exports.MessageSchema = MessageSchema;
module.exports.createMessageModel = createMessageModel; 