const mongoose = require('mongoose');
const { choiceAppDb } = require('../index');

/**
 * Schéma pour les posts et publications
 */
const postSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: {
    type: String,
    required: true
  },
  media: [{
    type: {
      type: String,
      enum: ['image', 'video', 'audio'],
      required: true
    },
    url: {
      type: String,
      required: true
    },
    thumbnail: String,
    width: Number,
    height: Number,
    duration: Number // Pour les vidéos et audio
  }],
  tags: [String],
  mentions: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    username: String
  }],
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      default: [0, 0]
    },
    name: String,
    address: String
  },
  locationName: String,
  category: String,
  interests: [String],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  likesCount: {
    type: Number,
    default: 0
  },
  comments: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    text: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  commentsCount: {
    type: Number,
    default: 0
  },
  sharedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  sharesCount: {
    type: Number,
    default: 0
  },
  views: {
    type: Number,
    default: 0
  },
  producerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Producer'
  },
  producerType: {
    type: String,
    enum: ['restaurant', 'leisure', 'wellness']
  },
  rating: {
    overall: Number,
    service: Number,
    quality: Number,
    ambiance: Number,
    value: Number
  },
  status: {
    type: String,
    enum: ['active', 'hidden', 'deleted', 'reported'],
    default: 'active'
  },
  visibility: {
    type: String,
    enum: ['public', 'followers', 'private'],
    default: 'public'
  }
});

// Ajouter un index pour la recherche géospatiale
postSchema.index({ location: '2dsphere' });

// Middleware pre-save pour mettre à jour les compteurs
postSchema.pre('save', function(next) {
  if (this.isModified('likes')) {
    this.likesCount = this.likes.length;
  }
  if (this.isModified('comments')) {
    this.commentsCount = this.comments.length;
  }
  if (this.isModified('sharedBy')) {
    this.sharesCount = this.sharedBy.length;
  }
  this.updatedAt = new Date();
  next();
});

// Créer le modèle Post
const Post = choiceAppDb.model('Post', postSchema, 'posts');

module.exports = Post;
