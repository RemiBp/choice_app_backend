const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Reaction schema
const ReactionSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  emoji: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

// Reply info schema
const ReplyInfoSchema = new Schema({
  messageId: {
    type: Schema.Types.ObjectId,
    ref: 'Message',
    required: true
  },
  senderId: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  content: {
    type: String
  },
  contentType: {
    type: String,
    enum: ['text', 'image', 'audio', 'video', 'file', 'location']
  }
}, { _id: false });

// Forward info schema
const ForwardInfoSchema = new Schema({
  originalMessageId: {
    type: Schema.Types.ObjectId,
    ref: 'Message'
  },
  originalConversationId: {
    type: Schema.Types.ObjectId,
    ref: 'Conversation'
  },
  originalSenderId: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  forwardedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

// Media info schema
const MediaInfoSchema = new Schema({
  url: {
    type: String,
    required: true
  },
  thumbnailUrl: {
    type: String
  },
  fileName: {
    type: String
  },
  fileSize: {
    type: Number
  },
  fileMimeType: {
    type: String
  },
  width: Number,
  height: Number,
  duration: Number,
  blurHash: String
}, { _id: false });

// Location info schema
const LocationInfoSchema = new Schema({
  latitude: {
    type: Number,
    required: true
  },
  longitude: {
    type: Number,
    required: true
  },
  address: {
    type: String
  },
  name: {
    type: String
  }
}, { _id: false });

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
    enum: ['text', 'image', 'audio', 'video', 'file', 'location', 'sticker', 'gif', 'contact', 'systemMessage'],
    default: 'text'
  },
  mediaInfo: MediaInfoSchema,
  locationInfo: LocationInfoSchema,
  replyTo: ReplyInfoSchema,
  forwardInfo: ForwardInfoSchema,
  reactions: [ReactionSchema],
  mentions: [{
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    username: String,
    indices: [Number]  // Start and end positions in the content
  }],
  isEdited: {
    type: Boolean,
    default: false
  },
  editHistory: [{
    content: String,
    editedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isPinned: {
    type: Boolean,
    default: false
  },
  readBy: [{
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  deliveredTo: [{
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    deliveredAt: {
      type: Date,
      default: Date.now
    }
  }],
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,
  deletedFor: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  expireAt: Date,  // For self-destructing messages
  metadata: {
    type: Map,
    of: Schema.Types.Mixed
  },
  importance: {
    type: String,
    enum: ['normal', 'high', 'urgent'],
    default: 'normal'
  },
  silent: {
    type: Boolean,
    default: false  // For sending messages without notifications
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
MessageSchema.index({ conversationId: 1, createdAt: -1 });
MessageSchema.index({ senderId: 1, createdAt: -1 });
MessageSchema.index({ 'replyTo.messageId': 1 });
MessageSchema.index({ 'expireAt': 1 }, { expireAfterSeconds: 0 });

// Virtual for reply count
MessageSchema.virtual('replyCount', {
  ref: 'Message',
  localField: '_id',
  foreignField: 'replyTo.messageId',
  count: true
});

// Method to add a reaction
MessageSchema.methods.addReaction = function(userId, emoji) {
  // Check if user has already reacted with this emoji
  const existingReactionIndex = this.reactions.findIndex(
    reaction => reaction.userId.toString() === userId.toString() && reaction.emoji === emoji
  );
  
  if (existingReactionIndex >= 0) {
    // User already reacted with this emoji, do nothing
    return Promise.resolve(this);
  }
  
  // Remove any existing reaction from this user (one reaction per user)
  this.reactions = this.reactions.filter(
    reaction => reaction.userId.toString() !== userId.toString()
  );
  
  // Add the new reaction
  this.reactions.push({
    userId,
    emoji,
    createdAt: new Date()
  });
  
  this.markModified('reactions');
  return this.save();
};

// Method to remove a reaction
MessageSchema.methods.removeReaction = function(userId) {
  const userIdStr = userId.toString();
  
  // Check if user has reacted
  const hadReaction = this.reactions.some(
    reaction => reaction.userId.toString() === userIdStr
  );
  
  if (!hadReaction) {
    return Promise.resolve(this);
  }
  
  // Remove the reaction
  this.reactions = this.reactions.filter(
    reaction => reaction.userId.toString() !== userIdStr
  );
  
  this.markModified('reactions');
  return this.save();
};

// Method to mark as read for a user
MessageSchema.methods.markAsRead = function(userId) {
  const userIdStr = userId.toString();
  
  // Check if already read by this user
  const alreadyRead = this.readBy.some(
    read => read.userId.toString() === userIdStr
  );
  
  if (alreadyRead) {
    return Promise.resolve(this);
  }
  
  // Add to readBy
  this.readBy.push({
    userId,
    readAt: new Date()
  });
  
  this.markModified('readBy');
  return this.save();
};

// Method to mark as delivered for a user
MessageSchema.methods.markAsDelivered = function(userId) {
  const userIdStr = userId.toString();
  
  // Check if already delivered to this user
  const alreadyDelivered = this.deliveredTo.some(
    delivery => delivery.userId.toString() === userIdStr
  );
  
  if (alreadyDelivered) {
    return Promise.resolve(this);
  }
  
  // Add to deliveredTo
  this.deliveredTo.push({
    userId,
    deliveredAt: new Date()
  });
  
  this.markModified('deliveredTo');
  return this.save();
};

// Method to edit a message
MessageSchema.methods.editContent = function(newContent) {
  // Store current content in history
  if (!this.editHistory) {
    this.editHistory = [];
  }
  
  this.editHistory.push({
    content: this.content,
    editedAt: new Date()
  });
  
  // Update content and mark as edited
  this.content = newContent;
  this.isEdited = true;
  this.updatedAt = new Date();
  
  this.markModified('editHistory');
  return this.save();
};

// Method to delete a message (soft delete)
MessageSchema.methods.softDelete = function() {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.content = "This message was deleted";
  return this.save();
};

// Method to delete a message for specific users
MessageSchema.methods.deleteForUsers = function(userIds) {
  if (!Array.isArray(userIds)) {
    userIds = [userIds];
  }
  
  userIds.forEach(userId => {
    const userIdStr = userId.toString();
    
    if (!this.deletedFor.some(id => id.toString() === userIdStr)) {
      this.deletedFor.push(userId);
    }
  });
  
  this.markModified('deletedFor');
  return this.save();
};

// Pre-save middleware
MessageSchema.pre('save', function(next) {
  // Update the updatedAt timestamp
  this.updatedAt = new Date();
  next();
});

// Function to create the model with a specific connection
const createMessageModel = (connection) => {
  return connection.model('Message', MessageSchema);
};

// Create the default model with the default connection
const Message = mongoose.model('Message', MessageSchema);

// Export the schema, default model, and model creation function
module.exports = Message;
module.exports.MessageSchema = MessageSchema;
module.exports.createMessageModel = createMessageModel; 