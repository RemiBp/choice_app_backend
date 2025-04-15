const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Schéma pour les messages
const MessageSchema = new Schema({
  senderId: { type: String, required: true },
  content: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now },
  media: { type: [String], default: [] },
  contentType: { type: String, default: 'text' },
  readBy: { type: [String], default: [] },
  sharedContent: Schema.Types.Mixed,
  isRead: { type: Object, default: {} }
});

// Schéma pour une conversation
const ConversationSchema = new Schema({
  participants: [{ 
    type: Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  isGroup: { type: Boolean, default: false },
  isGroupChat: { type: Boolean, default: false }, // Alias pour isGroup pour compatibilité
  groupName: { type: String, default: 'Groupe' },
  groupAvatar: { type: String },
  groupImage: { type: String }, // Alias pour groupAvatar pour compatibilité
  messages: { type: [MessageSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  lastUpdated: { type: Date, default: Date.now },
  lastMessageDate: { type: Date, default: Date.now }, // Alias pour lastUpdated
  lastMessage: { type: String, default: '' },
  lastMessageSender: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  unreadCount: {
    type: Schema.Types.Mixed,
    default: {}
  },
  isProducerConversation: { type: Boolean, default: false },
  producerId: { type: String },
  producerType: { type: String, enum: ['restaurant', 'leisure', 'beauty', 'wellness'] }
}, {
  strict: false,
  toObject: { virtuals: true }, // Activer les virtuals
  toJSON: { virtuals: true }    // Activer les virtuals
});

// Cette méthode convertit unreadCount de Map à objet simple pour assurer la compatibilité
ConversationSchema.methods.ensureUnreadCountIsObject = function() {
  if (this.unreadCount instanceof Map) {
    const objUnreadCount = {};
    for (const [key, value] of this.unreadCount.entries()) {
      objUnreadCount[key] = value;
    }
    this.unreadCount = objUnreadCount;
  } else if (!this.unreadCount) {
    this.unreadCount = {};
  }
};

// Méthode pour incrémenter le compteur de messages non lus pour un participant
ConversationSchema.methods.incrementUnreadCount = function(participantId) {
  const participantIdStr = participantId.toString();
  this.ensureUnreadCountIsObject();
  this.unreadCount[participantIdStr] = (this.unreadCount[participantIdStr] || 0) + 1;
};

// Méthode pour réinitialiser le compteur de messages non lus pour un participant
ConversationSchema.methods.resetUnreadCount = function(participantId) {
  const participantIdStr = participantId.toString();
  this.ensureUnreadCountIsObject();
  this.unreadCount[participantIdStr] = 0;
};

// Méthode pour obtenir le compteur de messages non lus pour un participant
ConversationSchema.methods.getUnreadCount = function(participantId) {
  const participantIdStr = participantId.toString();
  this.ensureUnreadCountIsObject();
  return this.unreadCount[participantIdStr] || 0;
};

// Méthodes pour manipuler isRead comme s'il s'agissait d'une Map
MessageSchema.methods.getIsRead = function(participantId) {
  const idStr = participantId.toString();
  return this.isRead[idStr] || false;
};

MessageSchema.methods.setIsRead = function(participantId, value) {
  const idStr = participantId.toString();
  this.isRead[idStr] = value;
};

// Middleware pré-save pour synchroniser les champs aliases
ConversationSchema.pre('save', function(next) {
  // Synchroniser isGroup et isGroupChat
  this.isGroupChat = this.isGroup;
  
  // Synchroniser groupAvatar et groupImage
  if (this.groupAvatar && !this.groupImage) {
    this.groupImage = this.groupAvatar;
  } else if (this.groupImage && !this.groupAvatar) {
    this.groupAvatar = this.groupImage;
  }
  
  // Synchroniser lastUpdated et lastMessageDate
  if (this.lastUpdated && !this.lastMessageDate) {
    this.lastMessageDate = this.lastUpdated;
  } else if (this.lastMessageDate && !this.lastUpdated) {
    this.lastUpdated = this.lastMessageDate;
  }
  
  // S'assurer que unreadCount est toujours un objet (pas une Map)
  if (this.unreadCount instanceof Map) {
    const obj = {};
    this.unreadCount.forEach((value, key) => {
      obj[key] = value;
    });
    this.unreadCount = obj;
  }
  
  next();
});

// Fonction pour créer un modèle avec une connexion spécifique
function createConversationModel(connection) {
  return connection.model('Conversation', ConversationSchema);
}

// Exporter à la fois le schéma et le modèle par défaut
module.exports = {
  ConversationSchema,
  Conversation: mongoose.model('Conversation', ConversationSchema),
  createConversationModel
};
