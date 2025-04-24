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
    author: {
      id: { 
        type: mongoose.Schema.Types.ObjectId, 
        required: true, 
        refPath: 'authorModel' 
      },
      authorModel: { 
        type: String, 
        required: true, 
        enum: ['User', 'Producer', 'LeisureProducer', 'WellnessPlace']
      },
      name: String,
      avatar: String
    },
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
      enum: ['Producer', 'LeisureProducer', 'WellnessPlace'],
      required: function() {
        return this.producer_id != null;
      },
      index: true
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
    time_posted: {
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
    is_automated: { type: Boolean, default: false },

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

    // Target Specific Fields (Mostly for User posts)
    target_id: String,
    target_type: { type: String, enum: ['Event', 'Producer', 'LeisureProducer', 'WellnessPlace'] },
    post_type: { type: String, enum: ['event', 'restaurant', 'beauty', 'leisure', 'wellness'] },
    referenced_event_id: String,
    
    // Boolean flags for easier filtering/identification
    isProducerPost: { type: Boolean, default: false, index: true },
    isLeisureProducer: { type: Boolean, default: false },
    isWellnessProducer: { type: Boolean, default: false },
    isRestaurationProducer: { type: Boolean, default: false },
    is_event_post: { type: Boolean, default: false },
    isBeautyPlace: { type: Boolean, default: false },
    isEvent: { type: Boolean, default: false },
    isRestaurant: { type: Boolean, default: false },
    
    // Specific fields when user posts about Beauty/Wellness
    beauty_id: String,
    beauty_name: String,
    beauty_category: String,
    beauty_subcategory: String,

    // Specific fields when user posts about Events
    event_title: String,

    // Specific fields when user posts about Restaurants
    restaurant_id: String,
    restaurant_name: String,

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
  postSchema.index({ time_posted: -1 });
  postSchema.index({ tags: 1 });
  postSchema.index({ content_type: 1 });
  postSchema.index({ 'stats.likes_count': -1 });
  postSchema.index({ 'stats.views_count': -1 });
  postSchema.index({ isProducerPost: 1 });
  postSchema.index({ producerType: 1 });

  // Middleware pour mettre à jour les compteurs
  postSchema.pre('save', function(next) {
    if (this.isModified('likes')) {
      this.stats.likes_count = this.likes?.length ?? 0;
    }
    if (this.isModified('comments')) {
      this.stats.comments_count = this.comments?.length ?? 0;
    }
    if (this.isModified('shares')) {
      this.stats.shares_count = this.shares?.length ?? 0;
    }
    if (this.isModified('views')) {
      this.stats.views_count = this.views?.length ?? 0;
    }
    if (this.isModified('choices')) {
      this.stats.choices_count = this.choices?.length ?? 0;
    }

    if (this.author?.authorModel && ['Producer', 'LeisureProducer', 'WellnessPlace'].includes(this.author.authorModel)) {
      this.isProducerPost = true;
      const type = this.author.authorModel;
      this.isRestaurationProducer = type === 'Producer';
      this.isLeisureProducer = type === 'LeisureProducer';
      this.isWellnessProducer = type === 'WellnessPlace';
      if (!this.producerType && this.producer_id) {
        this.producerType = type;
      }
    } else {
      this.isProducerPost = false;
      this.isRestaurationProducer = false;
      this.isLeisureProducer = false;
      this.isWellnessProducer = false;
    }
    
    if (this.producer_id && this.producerType) {
        this.isProducerPost = true;
        this.isRestaurationProducer = this.producerType === 'Producer';
        this.isLeisureProducer = this.producerType === 'LeisureProducer';
        this.isWellnessProducer = this.producerType === 'WellnessPlace';
        if (this.author && !this.author.authorModel && this.author.id === this.producer_id) {
            this.author.authorModel = this.producerType;
        }
    }

    this.isEvent = !!this.event_id || this.post_type === 'event';
    this.isRestaurant = (this.producerType === 'Producer' || this.post_type === 'restaurant');

    if (this.isModified()) {
      this.updated_at = new Date();
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
      time_posted: obj.time_posted,
      tags: obj.tags || [],
      stats: obj.stats,
      producer: obj.producer_id,
      event: obj.event_id,
      author: obj.author
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
