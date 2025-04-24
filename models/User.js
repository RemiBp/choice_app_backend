const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Schema = mongoose.Schema;

// Schema for user connections (friends, followers, etc.)
const ConnectionSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'blocked', 'muted'],
    default: 'pending'
  },
  since: {
    type: Date,
    default: Date.now
  },
  notes: String,
  nickname: String,
  isFavorite: {
    type: Boolean,
    default: false
  }
}, { _id: false });

// Schema for user notification preferences
const NotificationSettingsSchema = new Schema({
  messages: {
    enabled: {
      type: Boolean,
      default: true
    },
    sound: {
      type: Boolean,
      default: true
    },
    preview: {
      type: Boolean,
      default: true
    }
  },
  calls: {
    enabled: {
      type: Boolean,
      default: true
    },
    sound: {
      type: Boolean,
      default: true
    },
    vibration: {
      type: Boolean,
      default: true
    }
  },
  groups: {
    enabled: {
      type: Boolean,
      default: true
    },
    mentions: {
      type: Boolean,
      default: true
    }
  },
  newConnections: {
    type: Boolean,
    default: true
  },
  appUpdates: {
    type: Boolean,
    default: true
  },
  marketing: {
    type: Boolean,
    default: false
  },
  doNotDisturb: {
    enabled: {
      type: Boolean,
      default: false
    },
    from: {
      type: String,
      default: '22:00'
    },
    to: {
      type: String,
      default: '08:00'
    },
    exceptFor: {
      type: String,
      enum: ['none', 'favorites', 'custom'],
      default: 'none'
    },
    exceptList: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }]
  }
}, { _id: false });

// Schema for user privacy settings
const PrivacySettingsSchema = new Schema({
  profile: {
    whoCanSeeProfile: {
      type: String,
      enum: ['everyone', 'connections', 'nobody'],
      default: 'everyone'
    },
    whoCanSeeEmail: {
      type: String,
      enum: ['everyone', 'connections', 'nobody'],
      default: 'connections'
    },
    whoCanSeePhone: {
      type: String,
      enum: ['everyone', 'connections', 'nobody'],
      default: 'connections'
    },
    whoCanSeeLastSeen: {
      type: String,
      enum: ['everyone', 'connections', 'nobody'],
      default: 'everyone'
    },
    whoCanSeeStatus: {
      type: String,
      enum: ['everyone', 'connections', 'nobody'],
      default: 'everyone'
    }
  },
  connections: {
    whoCanSendRequests: {
      type: String,
      enum: ['everyone', 'connections_of_connections', 'nobody'],
      default: 'everyone'
    },
    whoCanSeeConnections: {
      type: String,
      enum: ['everyone', 'connections', 'nobody'],
      default: 'everyone'
    },
    autoAcceptFrom: {
      type: String,
      enum: ['nobody', 'connections_of_connections', 'everyone'],
      default: 'nobody'
    }
  },
  messages: {
    whoCanMessage: {
      type: String,
      enum: ['everyone', 'connections', 'nobody'],
      default: 'everyone'
    },
    readReceipts: {
      type: Boolean,
      default: true
    },
    typingIndicators: {
      type: Boolean,
      default: true
    }
  },
  blockedUsers: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  hiddenUsers: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }]
}, { _id: false });

// Schema for user appearance settings
const AppearanceSettingsSchema = new Schema({
  theme: {
    type: String, 
    enum: ['light', 'dark', 'system'],
    default: 'system'
  },
  chatBackground: {
    type: String,
    default: 'default'
  },
  fontSize: {
    type: String,
    enum: ['small', 'medium', 'large'],
    default: 'medium'
  },
  messageAlignment: {
    type: String,
    enum: ['left', 'right'],
    default: 'right'
  },
  accentColor: {
    type: String,
    default: '#0084ff'
  },
  bubbleStyle: {
    type: String,
    enum: ['rounded', 'squared', 'classic'],
    default: 'rounded'
  }
}, { _id: false });

// User status schema
const UserStatusSchema = new Schema({
  text: {
    type: String,
    default: ''
  },
  emoji: String,
  expiresAt: Date,
  clearAfterExpiry: {
    type: Boolean,
    default: true
  },
  visibility: {
    type: String,
    enum: ['everyone', 'connections', 'nobody'],
    default: 'everyone'
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

// User schema
const UserSchema = new Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  name: {
    first: {
      type: String,
      trim: true
    },
    last: {
      type: String,
      trim: true
    }
  },
  profilePicture: {
    type: String,
    default: ''
  },
  photo_url: String,
  coverPhoto: {
    type: String,
    default: ''
  },
  bio: {
    type: String,
    maxlength: 500,
    default: ''
  },
  phone: {
    type: String,
    default: ''
  },
  dateOfBirth: Date,
  age: Number,
  gender: {
    type: String,
    enum: ['male', 'female', 'other', 'prefer_not_to_say'],
    default: 'prefer_not_to_say'
  },
  location: {
    latitude: Number,
    longitude: Number
  },
  website: {
    type: String,
    default: ''
  },
  socialLinks: {
    facebook: { type: String, default: '' },
    twitter: { type: String, default: '' },
    instagram: { type: String, default: '' },
    linkedin: { type: String, default: '' },
    github: { type: String, default: '' }
  },
  badges: [{
    type: {
      type: String,
      enum: ['verified', 'premium', 'new', 'contributor', 'moderator', 'admin']
    },
    awarded: {
      type: Date,
      default: Date.now
    },
    description: String
  }],
  status: {
    type: UserStatusSchema,
    default: () => ({})
  },
  presence: {
    isOnline: {
      type: Boolean,
      default: false
    },
    lastSeen: {
      type: Date,
      default: Date.now
    },
    device: {
      type: String,
      enum: ['mobile', 'web', 'desktop'],
      default: 'web'
    }
  },
  connections: {
    friends: [ConnectionSchema],
    followers: [ConnectionSchema],
    following: [ConnectionSchema],
    blocked: [ConnectionSchema]
  },
  favorites: {
    conversations: [{
      type: Schema.Types.ObjectId,
      ref: 'Conversation'
    }],
    users: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    messages: [{
      type: Schema.Types.ObjectId,
      ref: 'Message'
    }]
  },
  settings: {
    notifications: {
      type: NotificationSettingsSchema,
      default: () => ({})
    },
    privacy: {
      type: PrivacySettingsSchema,
      default: () => ({})
    },
    appearance: {
      type: AppearanceSettingsSchema,
      default: () => ({})
    },
    language: {
      type: String,
      default: 'en'
    },
    timezone: {
      type: String,
      default: 'UTC'
    },
    autoDownload: {
      images: {
        type: Boolean,
        default: true
      },
      videos: {
        type: Boolean,
        default: false
      },
      documents: {
        type: Boolean,
        default: true
      },
      audio: {
        type: Boolean,
        default: true
      }
    },
    twoFactorAuth: {
      enabled: {
        type: Boolean,
        default: false
      },
      method: {
        type: String,
        enum: ['email', 'sms', 'app'],
        default: 'email'
      },
      verified: {
        type: Boolean,
        default: false
      }
    }
  },
  deviceTokens: [{
    token: String,
    device: {
      type: String,
      enum: ['ios', 'android', 'web', 'desktop'],
      default: 'web'
    },
    lastUsed: {
      type: Date,
      default: Date.now
    }
  }],
  isVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  lastActiveAt: {
    type: Date,
    default: Date.now
  },
  metadata: {
    type: Map,
    of: Schema.Types.Mixed
  },
  choices: [{
    targetId: { type: Schema.Types.ObjectId, required: true },
    targetName: { type: String },
    ratings: { type: Map, of: Number },
    comment: { type: String, default: '' },
    type: { type: String, required: true },
    menuItems: { type: Array, default: [] },
    emotions: { type: Array, default: [] },
    createdAt: { type: Date, default: Date.now }
  }],
  preferred_content_format: {
    text: Number,
    image: Number,
    video: Number
  },
  liked_tags: [String],
  trusted_circle: [String],
  following: [String],
  sector_preferences: {
    food: {
      avg_spending: Number,
      vegan: Boolean,
      carbon_aware: Boolean
    },
    culture: {
      preferred_styles: [String],
      event_types: [String]
    },
    wellness: {
      services: [String],
      atmosphere: [String],
      price_range: Number,
      eco_friendly: Boolean
    }
  },
  interaction_metrics: {
    total_interactions: Number,
    comments_given: Number,
    choices_given: Number,
    shares_given: Number
  },
  consumption_behavior: {
    varies_preferences: Boolean,
    tries_new_content: Boolean
  },
  frequent_locations: [{
    id: String,
    name: String,
    type: String,
    coordinates: [Number],
    visits: [{
      date: Date,
      duration_minutes: Number
    }]
  }],
  affinity_producers: [{
    id: String,
    name: String,
    type: String,
    affinity_score: Number
  }],
  search_keywords: [String],
  is_star: { type: Boolean, default: false },
  followers_count: { type: Number, default: 0 },
  influence_score: { type: Number, default: 0 },
  posts: [{ type: Schema.Types.ObjectId, ref: 'Post' }],
  interests: [{ type: Schema.Types.ObjectId, refPath: 'interestType' }],
  interestType: { type: String, enum: ['Producer', 'LeisureProducer', 'WellnessPlace', 'Event'] },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create indexes for better query performance
UserSchema.index({ username: 1 });
UserSchema.index({ email: 1 });
UserSchema.index({ 'presence.isOnline': 1 });
UserSchema.index({ 'presence.lastSeen': -1 });
UserSchema.index({ 'connections.friends.userId': 1 });
UserSchema.index({ 'connections.followers.userId': 1 });
UserSchema.index({ 'connections.following.userId': 1 });

// Virtual for full name
UserSchema.virtual('fullName').get(function() {
  if (this.name.first && this.name.last) {
    return `${this.name.first} ${this.name.last}`;
  } else if (this.name.first) {
    return this.name.first;
  } else if (this.name.last) {
    return this.name.last;
  }
  return this.username;
});

// Method to check password
UserSchema.methods.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

// Method to generate JWT token
UserSchema.methods.generateAuthToken = function() {
  const token = jwt.sign(
    { id: this._id, username: this.username },
    process.env.JWT_SECRET || 'default_jwt_secret',
    { expiresIn: '30d' }
  );
  return token;
};

// Method to update online status
UserSchema.methods.updatePresence = function(isOnline, device = 'web') {
  this.presence.isOnline = isOnline;
  if (!isOnline) {
    this.presence.lastSeen = new Date();
  }
  this.presence.device = device;
  return this.save();
};

// Method to update status
UserSchema.methods.setStatus = function(status) {
  this.status = {
    ...this.status,
    ...status,
    updatedAt: new Date()
  };
  this.markModified('status');
  return this.save();
};

// Method to clear status
UserSchema.methods.clearStatus = function() {
  this.status = {
    text: '',
    updatedAt: new Date()
  };
  this.markModified('status');
  return this.save();
};

// Method to add connection (friend, follow, etc.)
UserSchema.methods.addConnection = function(userId, type, status = 'pending') {
  const userIdStr = userId.toString();
  const connectionTypes = ['friends', 'followers', 'following', 'blocked'];
  
  if (!connectionTypes.includes(type)) {
    throw new Error(`Invalid connection type: ${type}`);
  }
  
  // Check if connection already exists
  const existingConnection = this.connections[type].find(
    conn => conn.userId.toString() === userIdStr
  );
  
  if (existingConnection) {
    existingConnection.status = status;
    existingConnection.since = new Date();
  } else {
    this.connections[type].push({
      userId,
      status,
      since: new Date()
    });
  }
  
  this.markModified(`connections.${type}`);
  return this.save();
};

// Method to remove connection
UserSchema.methods.removeConnection = function(userId, type) {
  const userIdStr = userId.toString();
  const connectionTypes = ['friends', 'followers', 'following', 'blocked'];
  
  if (!connectionTypes.includes(type)) {
    throw new Error(`Invalid connection type: ${type}`);
  }
  
  this.connections[type] = this.connections[type].filter(
    conn => conn.userId.toString() !== userIdStr
  );
  
  this.markModified(`connections.${type}`);
  return this.save();
};

// Method to update connection status
UserSchema.methods.updateConnectionStatus = function(userId, type, status) {
  const userIdStr = userId.toString();
  const connectionTypes = ['friends', 'followers', 'following', 'blocked'];
  
  if (!connectionTypes.includes(type)) {
    throw new Error(`Invalid connection type: ${type}`);
  }
  
  const connection = this.connections[type].find(
    conn => conn.userId.toString() === userIdStr
  );
  
  if (!connection) {
    return Promise.resolve(this);
  }
  
  connection.status = status;
  
  this.markModified(`connections.${type}`);
  return this.save();
};

// Method to add to favorites
UserSchema.methods.addToFavorites = function(id, type) {
  const idStr = id.toString();
  const favoriteTypes = ['conversations', 'users', 'messages'];
  
  if (!favoriteTypes.includes(type)) {
    throw new Error(`Invalid favorite type: ${type}`);
  }
  
  // Check if already in favorites
  const alreadyFavorite = this.favorites[type].some(
    favId => favId.toString() === idStr
  );
  
  if (!alreadyFavorite) {
    this.favorites[type].push(id);
    this.markModified(`favorites.${type}`);
  }
  
  return this.save();
};

// Method to remove from favorites
UserSchema.methods.removeFromFavorites = function(id, type) {
  const idStr = id.toString();
  const favoriteTypes = ['conversations', 'users', 'messages'];
  
  if (!favoriteTypes.includes(type)) {
    throw new Error(`Invalid favorite type: ${type}`);
  }
  
  this.favorites[type] = this.favorites[type].filter(
    favId => favId.toString() !== idStr
  );
  
  this.markModified(`favorites.${type}`);
  return this.save();
};

// Method to update notification settings
UserSchema.methods.updateNotificationSettings = function(settings) {
  this.settings.notifications = {
    ...this.settings.notifications,
    ...settings
  };
  
  this.markModified('settings.notifications');
  return this.save();
};

// Method to update privacy settings
UserSchema.methods.updatePrivacySettings = function(settings) {
  this.settings.privacy = {
    ...this.settings.privacy,
    ...settings
  };
  
  this.markModified('settings.privacy');
  return this.save();
};

// Method to update appearance settings
UserSchema.methods.updateAppearanceSettings = function(settings) {
  this.settings.appearance = {
    ...this.settings.appearance,
    ...settings
  };
  
  this.markModified('settings.appearance');
  return this.save();
};

// Method to add device token
UserSchema.methods.addDeviceToken = function(token, device = 'web') {
  // Check if token already exists
  const existingToken = this.deviceTokens.find(dt => dt.token === token);
  
  if (existingToken) {
    existingToken.lastUsed = new Date();
    existingToken.device = device;
  } else {
    this.deviceTokens.push({
      token,
      device,
      lastUsed: new Date()
    });
  }
  
  this.markModified('deviceTokens');
  return this.save();
};

// Method to remove device token
UserSchema.methods.removeDeviceToken = function(token) {
  this.deviceTokens = this.deviceTokens.filter(dt => dt.token !== token);
  
  this.markModified('deviceTokens');
  return this.save();
};

// Pre-save middleware
UserSchema.pre('save', async function(next) {
  // Update timestamps
  this.updatedAt = new Date();
  
  // Hash password if modified
  if (this.isModified('password')) {
    try {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    } catch (error) {
      return next(error);
    }
  }
  
  next();
});

// Static method to find user by credentials
UserSchema.statics.findByCredentials = async function(username, password) {
  // Check if input is email or username
  const isEmail = username.includes('@');
  
  // Find user by username or email
  const query = isEmail ? { email: username.toLowerCase() } : { username };
  const user = await this.findOne(query);
  
  if (!user) {
    throw new Error('Invalid credentials');
  }
  
  const isMatch = await user.comparePassword(password);
  
  if (!isMatch) {
    throw new Error('Invalid credentials');
  }
  
  return user;
};

// Function to create the model with a specific connection
const createUserModel = (connection) => {
  return connection.model('User', UserSchema);
};

// Create the default model with the default connection
const User = mongoose.model('User', UserSchema);

// Export the schema, default model, and model creation function
module.exports = User;
module.exports.UserSchema = UserSchema;
module.exports.createUserModel = createUserModel; 