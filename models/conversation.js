const mongoose = require('mongoose');
const { choiceAppDb } = require('../index');

// Schéma pour les messages
const MessageSchema = new mongoose.Schema({
  senderId: String,
  content: String,
  timestamp: { type: Date, default: Date.now },
  media: [String],
  contentType: { type: String, default: 'text' },
  readBy: [String],
  sharedContent: mongoose.Schema.Types.Mixed
});

// Schéma pour une conversation
const ConversationSchema = new mongoose.Schema({
  participants: [String],
  isGroup: { type: Boolean, default: false },
  groupName: String,
  groupAvatar: String,
  messages: [MessageSchema],
  createdAt: { type: Date, default: Date.now },
  lastUpdated: { type: Date, default: Date.now },
  lastMessage: String,
  unreadCount: { type: Number, default: 0 },
  isProducerConversation: { type: Boolean, default: false },
  producerId: String,
  producerType: { type: String, enum: ['restaurant', 'leisure', 'beauty', 'wellness'] }
}, {
  strict: false
});

// Création des modèles
const Conversation = choiceAppDb.model('Conversation', ConversationSchema, 'conversations');
const Message = choiceAppDb.model('Message', MessageSchema, 'messages');

module.exports = {
  Conversation,
  Message
};
