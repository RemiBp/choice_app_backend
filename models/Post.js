const mongoose = require('mongoose');

module.exports = (connection) => {
  const postSchema = new mongoose.Schema({
    // Champs de base
    title: {
      type: String,
      required: true
    },
    content: {
      type: String,
      required: true
    },
    
    // Relations avec d'autres collections
    event_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event'
    },
    producer_id: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'producerType'
    },
    producerType: {
      type: String,
      enum: ['Producer', 'LeisureProducer', 'BeautyProducer'],
      required: function() {
        return this.producer_id != null;
      }
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    // Localisation
    location: {
      name: String,
      type: { 
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        default: [0, 0]
      },
      address: String
    },

    // Médias
    media: [{
      type: { 
        type: String,
        enum: ['image', 'video', 'audio'],
        default: 'image'
      },
      url: String,
      thumbnail_url: String,
      duration: Number,
      width: Number,
      height: Number,
      mime_type: String
    }],

    // Métadonnées
    posted_at: {
      type: Date,
      default: Date.now
    },
    updated_at: {
      type: Date
    },
    content_type: {
      type: String,
      enum: ['post', 'event', 'restaurant', 'leisure', 'beauty', 'wellness'],
      default: 'post'
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'published'
    },

    // Tags et catégories
    tags: [{
      type: String
    }],
    categories: [{
      type: String
    }],

    // Interactions
    likes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    comments: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      content: String,
      created_at: {
        type: Date,
        default: Date.now
      },
      likes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }]
    }],
    choices: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    // Flag for Choice posts and their ratings
    isChoice: {
      type: Boolean,
      default: false
    },
    rating: {
      type: Number,
      default: 0
    },
    aspectRatings: {
      type: Map,
      of: Number,
      default: {}
    },
    views: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      viewed_at: {
        type: Date,
        default: Date.now
      },
      duration: Number
    }],
    shares: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      shared_at: {
        type: Date,
        default: Date.now
      },
      platform: String
    }],

    // Statistiques
    stats: {
      likes_count: {
        type: Number,
        default: 0
      },
      comments_count: {
        type: Number,
        default: 0
      },
      shares_count: {
        type: Number,
        default: 0
      },
      views_count: {
        type: Number,
        default: 0
      },
      choices_count: {
        type: Number,
        default: 0
      }
    },

    // Paramètres de visibilité
    visibility: {
      type: String,
      enum: ['public', 'private', 'followers'],
      default: 'public'
    },

    // Champs pour le SEO et le partage
    meta: {
      description: String,
      keywords: [String],
      og_image: String
    }
  }, {
    timestamps: true,
    collection: 'Posts',
    strict: false
  });

  // Indexes
  postSchema.index({ location: '2dsphere' });
  postSchema.index({ posted_at: -1 });
  postSchema.index({ tags: 1 });
  postSchema.index({ content_type: 1 });
  postSchema.index({ 'stats.likes_count': -1 });
  postSchema.index({ 'stats.views_count': -1 });

  // Middleware pour mettre à jour les compteurs
  postSchema.pre('save', function(next) {
    if (this.isModified('likes')) {
      this.stats.likes_count = this.likes.length;
    }
    if (this.isModified('comments')) {
      this.stats.comments_count = this.comments.length;
    }
    if (this.isModified('shares')) {
      this.stats.shares_count = this.shares.length;
    }
    if (this.isModified('views')) {
      this.stats.views_count = this.views.length;
    }
    if (this.isModified('choices')) {
      this.stats.choices_count = this.choices.length;
    }
    next();
  });

  // Méthodes d'instance
  postSchema.methods.toClientFormat = function() {
    const obj = this.toObject();
    return {
      id: obj._id,
      title: obj.title,
      content: obj.content,
      media: obj.media?.map(m => ({
        type: m.type,
        url: m.url,
        thumbnail_url: m.thumbnail_url,
        width: m.width,
        height: m.height
      })) || [],
      location: obj.location,
      posted_at: obj.posted_at,
      tags: obj.tags || [],
      stats: obj.stats,
      producer: obj.producer_id,
      event: obj.event_id,
      user: obj.userId
    };
  };

  // Méthodes statiques
  postSchema.statics.findByLocation = function(coordinates, maxDistance) {
    return this.find({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: coordinates
          },
          $maxDistance: maxDistance
        }
      }
    });
  };

  return connection.model('Post', postSchema);
};
