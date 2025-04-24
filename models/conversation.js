const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const uuid = require('uuid');

// Participant schema with role and other settings
const ParticipantSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: {
    type: String,
    enum: ['admin', 'moderator', 'member'],
    default: 'member'
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  nickname: String,
  isMuted: {
    type: Boolean,
    default: false
  },
  mutedUntil: Date,
  isBlocked: {
    type: Boolean,
    default: false
  },
  settings: {
    notifications: {
      type: Boolean,
      default: true
    },
    muteUntil: Date,
    customBackground: String,
    pinned: {
      type: Boolean,
      default: false
    },
    archived: {
      type: Boolean,
      default: false
    },
    themeColor: String
  },
  lastReadMessageId: {
    type: Schema.Types.ObjectId,
    ref: 'Message'
  },
  lastDeliveredMessageId: {
    type: Schema.Types.ObjectId,
    ref: 'Message'
  },
  unreadCount: {
    type: Number,
    default: 0
  }
}, { _id: false });

// Group information schema
const GroupInfoSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  description: String,
  avatar: String,
  coverPhoto: String,
  isPublic: {
    type: Boolean,
    default: false
  },
  joinRequests: [{
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    requestedAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending'
    }
  }],
  rules: [String],
  links: [String],
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, { _id: false });

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
  participants: [ParticipantSchema],
  type: {
    type: String,
    enum: ['private', 'group', 'broadcast', 'self'],
    default: 'private'
  },
  groupInfo: GroupInfoSchema,
  lastMessage: {
    messageId: {
      type: Schema.Types.ObjectId,
      ref: 'Message'
    },
    content: String,
    contentType: {
      type: String,
      enum: ['text', 'image', 'audio', 'video', 'file', 'location', 'sticker', 'gif', 'contact', 'systemMessage']
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    senderName: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  },
  pinnedMessages: [{
    type: Schema.Types.ObjectId,
    ref: 'Message'
  }],
  settings: {
    encryption: {
      type: Boolean,
      default: false
    },
    encryptionType: {
      type: String,
      enum: ['none', 'e2ee'],
      default: 'none'
    },
    disappearingMessages: {
      enabled: {
        type: Boolean,
        default: false
      },
      timeout: {
        type: Number,
        default: 86400 // 24 hours in seconds
      }
    },
    slowMode: {
      enabled: {
        type: Boolean,
        default: false
      },
      interval: {
        type: Number,
        default: 0 // in seconds
      }
    },
    whoCanSeeMembers: {
      type: String,
      enum: ['everyone', 'admins', 'members'],
      default: 'everyone'
    },
    whoCanAddMembers: {
      type: String,
      enum: ['everyone', 'admins', 'members'],
      default: 'everyone'
    },
    whoCanSendMessages: {
      type: String,
      enum: ['everyone', 'admins', 'members'],
      default: 'everyone'
    }
  },
  metadata: {
    type: Map,
    of: Schema.Types.Mixed
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for query optimization
ConversationSchema.index({ 'participants.userId': 1 });
ConversationSchema.index({ 'groupInfo.isPublic': 1 });
ConversationSchema.index({ updatedAt: -1 });
ConversationSchema.index({ 'lastMessage.timestamp': -1 });

// Virtual for message count
ConversationSchema.virtual('messageCount', {
  ref: 'Message',
  localField: '_id',
  foreignField: 'conversationId',
  count: true
});

// Method to add a participant
ConversationSchema.methods.addParticipant = function(userId, role = 'member') {
  const userIdStr = userId.toString();
  
  // Check if user is already a participant
  const existingParticipant = this.participants.find(
    p => p.userId.toString() === userIdStr
  );
  
  if (existingParticipant) {
    return Promise.resolve(this);
  }
  
  // Add new participant
  this.participants.push({
    userId,
    role,
    joinedAt: new Date(),
    settings: {
      notifications: true
    },
    unreadCount: 0
  });
  
  this.markModified('participants');
  return this.save();
};

// Method to remove a participant
ConversationSchema.methods.removeParticipant = function(userId) {
  const userIdStr = userId.toString();
  
  // Check if user is a participant
  const participantIndex = this.participants.findIndex(
    p => p.userId.toString() === userIdStr
  );
  
  if (participantIndex === -1) {
    return Promise.resolve(this);
  }
  
  // Remove participant
  this.participants.splice(participantIndex, 1);
  
  this.markModified('participants');
  return this.save();
};

// Method to update participant role
ConversationSchema.methods.updateParticipantRole = function(userId, newRole) {
  const userIdStr = userId.toString();
  
  // Find participant
  const participant = this.participants.find(
    p => p.userId.toString() === userIdStr
  );
  
  if (!participant) {
    return Promise.resolve(this);
  }
  
  // Update role
  participant.role = newRole;
  
  this.markModified('participants');
  return this.save();
};

// Method to update last message
ConversationSchema.methods.updateLastMessage = function(message, senderName) {
  this.lastMessage = {
    messageId: message._id,
    content: message.content,
    contentType: message.contentType,
    senderId: message.senderId,
    senderName: senderName,
    timestamp: message.createdAt || new Date()
  };
  
  this.updatedAt = new Date();
  
  this.markModified('lastMessage');
  return this.save();
};

// Method to pin a message
ConversationSchema.methods.pinMessage = function(messageId) {
  const messageIdStr = messageId.toString();
  
  // Check if message is already pinned
  const alreadyPinned = this.pinnedMessages.some(
    id => id.toString() === messageIdStr
  );
  
  if (alreadyPinned) {
    return Promise.resolve(this);
  }
  
  // Add to pinned messages (limit to 3 pinned messages)
  if (this.pinnedMessages.length >= 3) {
    this.pinnedMessages.shift(); // Remove oldest pinned message
  }
  
  this.pinnedMessages.push(messageId);
  
  this.markModified('pinnedMessages');
  return this.save();
};

// Method to unpin a message
ConversationSchema.methods.unpinMessage = function(messageId) {
  const messageIdStr = messageId.toString();
  
  // Check if message is pinned
  const pinnedIndex = this.pinnedMessages.findIndex(
    id => id.toString() === messageIdStr
  );
  
  if (pinnedIndex === -1) {
    return Promise.resolve(this);
  }
  
  // Remove from pinned messages
  this.pinnedMessages.splice(pinnedIndex, 1);
  
  this.markModified('pinnedMessages');
  return this.save();
};

// Method to mark as read for a user
ConversationSchema.methods.markAsReadForUser = function(userId, messageId) {
  const userIdStr = userId.toString();
  
  // Find participant
  const participant = this.participants.find(
    p => p.userId.toString() === userIdStr
  );
  
  if (!participant) {
    return Promise.resolve(this);
  }
  
  // Update last read message ID and reset unread count
  participant.lastReadMessageId = messageId;
  participant.unreadCount = 0;
  
  this.markModified('participants');
  return this.save();
};

// Method to increment unread count for all participants except sender
ConversationSchema.methods.incrementUnreadCount = function(senderId) {
  const senderIdStr = senderId.toString();
  
  this.participants.forEach(participant => {
    if (participant.userId.toString() !== senderIdStr) {
      participant.unreadCount += 1;
    }
  });
  
  this.markModified('participants');
  return this.save();
};

// Method to mute conversation for a user
ConversationSchema.methods.muteForUser = function(userId, duration = null) {
  const userIdStr = userId.toString();
  
  // Find participant
  const participant = this.participants.find(
    p => p.userId.toString() === userIdStr
  );
  
  if (!participant) {
    return Promise.resolve(this);
  }
  
  // Update mute settings
  participant.settings.notifications = false;
  
  if (duration) {
    const muteUntil = new Date();
    muteUntil.setSeconds(muteUntil.getSeconds() + duration);
    participant.settings.muteUntil = muteUntil;
  } else {
    participant.settings.muteUntil = null; // Mute indefinitely
  }
  
  this.markModified('participants');
  return this.save();
};

// Method to unmute conversation for a user
ConversationSchema.methods.unmuteForUser = function(userId) {
  const userIdStr = userId.toString();
  
  // Find participant
  const participant = this.participants.find(
    p => p.userId.toString() === userIdStr
  );
  
  if (!participant) {
    return Promise.resolve(this);
  }
  
  // Update mute settings
  participant.settings.notifications = true;
  participant.settings.muteUntil = null;
  
  this.markModified('participants');
  return this.save();
};

// Method to archive conversation for a user
ConversationSchema.methods.archiveForUser = function(userId) {
  const userIdStr = userId.toString();
  
  // Find participant
  const participant = this.participants.find(
    p => p.userId.toString() === userIdStr
  );
  
  if (!participant) {
    return Promise.resolve(this);
  }
  
  // Update archive setting
  participant.settings.archived = true;
  
  this.markModified('participants');
  return this.save();
};

// Method to unarchive conversation for a user
ConversationSchema.methods.unarchiveForUser = function(userId) {
  const userIdStr = userId.toString();
  
  // Find participant
  const participant = this.participants.find(
    p => p.userId.toString() === userIdStr
  );
  
  if (!participant) {
    return Promise.resolve(this);
  }
  
  // Update archive setting
  participant.settings.archived = false;
  
  this.markModified('participants');
  return this.save();
};

// Pre-save middleware
ConversationSchema.pre('save', function(next) {
  // Update the updatedAt timestamp
  this.updatedAt = new Date();
  next();
});

// Static method to create a private conversation between two users
ConversationSchema.statics.createPrivateConversation = async function(userId1, userId2) {
  const existingConversation = await this.findOne({
    type: 'private',
    'participants.userId': { $all: [userId1, userId2] },
    participants: { $size: 2 }
  });
  
  if (existingConversation) {
    return existingConversation;
  }
  
  const newConversation = new this({
    type: 'private',
    participants: [
      { userId: userId1, role: 'member', unreadCount: 0 },
      { userId: userId2, role: 'member', unreadCount: 0 }
    ]
  });
  
  return newConversation.save();
};

// Static method to create a group conversation
ConversationSchema.statics.createGroupConversation = async function(groupName, creatorId, participantIds = []) {
  // Ensure creator is in participants
  if (!participantIds.some(id => id.toString() === creatorId.toString())) {
    participantIds.push(creatorId);
  }
  
  const participants = participantIds.map(userId => ({
    userId,
    role: userId.toString() === creatorId.toString() ? 'admin' : 'member',
    unreadCount: 0
  }));
  
  const newConversation = new this({
    type: 'group',
    participants,
    groupInfo: {
      name: groupName,
      createdBy: creatorId
    }
  });
  
  return newConversation.save();
};

// Function to create the model with a specific connection
const createConversationModel = (connection) => {
  return connection.model('Conversation', ConversationSchema);
};

// Create the default model with the default connection
const Conversation = mongoose.model('Conversation', ConversationSchema);

// Export the schema, default model, and model creation function
module.exports = Conversation;
module.exports.ConversationSchema = ConversationSchema;
module.exports.createConversationModel = createConversationModel;

