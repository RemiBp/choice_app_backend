const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Schéma optimisé pour les utilisateurs de Choice App
const UserSchema = new mongoose.Schema({
  // Informations de base
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  username: { type: String, sparse: true },
  password: { type: String, required: true },
  photo_url: { type: String, default: 'https://api.dicebear.com/6.x/adventurer/png' },
  profilePicture: String, // Alias pour photo_url
  bio: { type: String, default: '' },
  gender: { type: String, default: 'Non spécifié' },
  age: Number,
  
  // Localisation
  location: {
    latitude: Number,
    longitude: Number
  },
  
  // Relations sociales
  followers: [{ type: String }], // IDs en format string
  following: [{ type: String }], // IDs en format string
  followingProducers: [{ type: String }], // IDs en format string
  followers_count: { type: Number, default: 0 },
  
  // Préférences et intérêts
  liked_tags: [{ type: String }],
  interests: [{ type: mongoose.Schema.Types.Mixed }], // Accepte string ou objet
  
  // Métriques et statistiques
  influence_score: { type: Number, default: 0 },
  interaction_metrics: {
    total_interactions: { type: Number, default: 0 },
    comments_given: { type: Number, default: 0 },
    choices_given: { type: Number, default: 0 },
    shares_given: { type: Number, default: 0 }
  },
  
  // Activité
  choices: [{ type: String }],
  posts: [{ type: String }],
  liked_posts: [{ type: String }],
  comments: [{ 
    post_id: String,
    content: String,
    created_at: { type: Date, default: Date.now }
  }],
  
  // Préférences sectorielles
  sector_preferences: {
    food: {
      avg_spending: Number,
      vegan: Boolean,
      carbon_aware: Boolean
    },
    culture: {
      preferred_styles: [String],
      event_types: [String]
    }
  },
  
  // Format préféré de contenu
  preferred_content_format: {
    text: Number,
    image: Number,
    video: Number
  },
  
  // Lieux fréquentés et affinités
  frequent_locations: [mongoose.Schema.Types.Mixed],
  affinity_producers: [String],
  trusted_circle: [String],
  
  // Recherche
  search_keywords: [String],
  
  // Statut
  is_star: { type: Boolean, default: false },
  
  // Données d'onboarding
  onboarding_completed: { type: Boolean, default: false },
  onboarding_date: Date,
  
  // Comportement de consommation
  consumption_behavior: {
    varies_preferences: Boolean,
    tries_new_content: Boolean
  },
  
  // Messagerie
  conversations: [String],
  
  // Authentification et sécurité
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  
  // Autres
  contacts_permission: { type: Boolean, default: false },
  
  // Assurons-nous que la structure bookmarks existe et est correcte
  bookmarks: {
    restaurants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Restaurant'
      }
    ],
    leisure: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LeisureVenue'
      }
    ],
    wellness: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WellnessPlace'
      }
    ],
    posts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post'
      }
    ]
  },
  
  // Stripe customer ID
  stripeCustomerId: String,
  
  // Timestamps
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  },
  last_active: {
    type: Date,
    default: Date.now
  },
  active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  strict: false, // Permet des champs supplémentaires pour la compatibilité
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      // Assurer que tous les ID sont convertis en strings
      if (ret._id) ret._id = ret._id.toString();
      return ret;
    }
  }
});

// Index pour améliorer les performances des requêtes
UserSchema.index({ email: 1 });
UserSchema.index({ username: 1 });
UserSchema.index({ location: '2dsphere' });

// Middleware pour convertir les ObjectId en strings avant sauvegarde
UserSchema.pre('save', function(next) {
  // Convertir les tableaux d'IDs en strings
  const convertIdsToString = (arr) => {
    if (Array.isArray(arr)) {
      return arr.map(id => id && typeof id === 'object' && id._id ? id._id.toString() : 
                         typeof id === 'object' && id.toString ? id.toString() : id);
    }
    return arr;
  };
  
  if (this.followers) this.followers = convertIdsToString(this.followers);
  if (this.following) this.following = convertIdsToString(this.following);
  if (this.followingProducers) this.followingProducers = convertIdsToString(this.followingProducers);
  if (this.posts) this.posts = convertIdsToString(this.posts);
  if (this.choices) this.choices = convertIdsToString(this.choices);
  if (this.liked_posts) this.liked_posts = convertIdsToString(this.liked_posts);
  if (this.interests) this.interests = convertIdsToString(this.interests);
  if (this.conversations) this.conversations = convertIdsToString(this.conversations);
  
  next();
});

// Middleware pré-sauvegarde pour hacher les mots de passe
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    next();
    return;
  }
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Méthode pour comparer les mots de passe
UserSchema.methods.comparePassword = async function(enteredPassword) {
  if (!enteredPassword) return false;
  try {
    return await bcrypt.compare(enteredPassword, this.password);
  } catch (e) {
    console.error('Erreur lors de la comparaison de mot de passe:', e);
    return false;
  }
};

// Méthode pour générer un token JWT
UserSchema.methods.getSignedJwtToken = function() {
  try {
    return jwt.sign(
      { id: this._id, role: this.role, isAdmin: this.isAdmin },
      process.env.JWT_SECRET || 'default_secret_please_change_in_production',
      { expiresIn: process.env.JWT_EXPIRE || '24h' }
    );
  } catch (e) {
    console.error('Erreur lors de la génération du token JWT:', e);
    return null;
  }
};

// Méthode pour ajouter un signet
UserSchema.methods.addBookmark = async function(type, targetId) {
  if (!this.bookmarks) {
    this.bookmarks = {
      restaurants: [],
      leisure: [],
      wellness: [],
      posts: []
    };
  }
  
  if (!this.bookmarks[type]) {
    this.bookmarks[type] = [];
  }
  
  // Vérifier si le signet existe déjà
  if (!this.bookmarks[type].includes(targetId)) {
    this.bookmarks[type].push(targetId);
    await this.save();
    return true;
  }
  
  return false;
};

// Méthode pour supprimer un signet
UserSchema.methods.removeBookmark = async function(type, targetId) {
  if (!this.bookmarks || !this.bookmarks[type]) {
    return false;
  }
  
  const initialLength = this.bookmarks[type].length;
  this.bookmarks[type] = this.bookmarks[type].filter(
    id => id.toString() !== targetId.toString()
  );
  
  if (initialLength !== this.bookmarks[type].length) {
    await this.save();
    return true;
  }
  
  return false;
};

// Méthode pour vérifier si un utilisateur suit un autre utilisateur ou producteur
UserSchema.methods.isFollowing = function(targetId) {
  const followingIds = this.following || [];
  const producerIds = this.followingProducers || [];
  
  return followingIds.includes(targetId.toString()) || producerIds.includes(targetId.toString());
};

// Méthode pour obtenir un format unifié de l'utilisateur pour l'API
UserSchema.methods.getPublicProfile = function() {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.emailVerificationToken;
  delete userObject.emailVerificationExpires;
  delete userObject.resetPasswordToken;
  delete userObject.resetPasswordExpires;
  
  // S'assurer que photo_url est défini
  if (!userObject.photo_url && userObject.profilePicture) {
    userObject.photo_url = userObject.profilePicture;
  }
  
  return userObject;
};

// Vérifier si le modèle existe déjà avant de le créer
let User;
try {
  // Essayer d'accéder au modèle existant
  User = mongoose.model('User');
} catch (e) {
  // Le modèle n'existe pas encore, on le crée
  User = mongoose.model('User', UserSchema, 'Users');
}

// Créer un alias UserChoice pour la compatibilité
const UserChoice = User;

module.exports = User;
module.exports.UserChoice = UserChoice; 