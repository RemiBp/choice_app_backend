const mongoose = require('mongoose');

module.exports = (connection) => {
  // Schéma flexible pour les utilisateurs
  const UserSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    username: { type: String, unique: true },
    password: String,
    bio: String,
    profilePicture: String,
    avatar: String,
    photo_url: String,
    followers: [{ type: String }],
    following: [{ type: String }],
    interests: [{ type: mongoose.Schema.Types.Mixed }],
    liked_tags: [{ type: String }],
    choices: [{ type: mongoose.Schema.Types.Mixed }],
    choiceCount: { type: Number, default: 0 },
    verified: { type: Boolean, default: false },
    posts: [{ type: String }],
    conversations: [{ type: String }],
    phone: String,
    address: String,
    location: {
      type: { type: String, enum: ['Point'] },
      coordinates: [Number]
    },
    account_type: { type: String, default: 'user' },
    preferences: { type: mongoose.Schema.Types.Mixed },
    notifications: [{ type: mongoose.Schema.Types.Mixed }],
    created_at: { type: Date, default: Date.now },
    last_login: { type: Date },
    fcm_token: String,
    isOnline: { type: Boolean, default: false },
    favorites: [{ type: String }],
    friends: [{ type: String }],
    activity: [{ type: mongoose.Schema.Types.Mixed }],
    posts_count: { type: Number, default: 0 },
    choices_count: { type: Number, default: 0 },
    reset_password_token: String,
    reset_password_expires: Date,
  }, { 
    timestamps: true,
    strict: false
  });

  // Ajouter un index pour le géocodage
  UserSchema.index({ location: '2dsphere' });

  // Créer le modèle User de façon sécurisée
  let User, UserChoice, UserRest;
  
  try {
    // Essayer d'utiliser les modèles existants d'abord
    User = connection.model('User');
  } catch (e) {
    // Si le modèle n'existe pas, le créer
    User = connection.model('User', UserSchema, 'Users');
  }
  
  try {
    // Essayer d'utiliser le modèle UserChoice existant
    UserChoice = connection.model('UserChoice');
  } catch (e) {
    // Si le modèle n'existe pas, réutiliser le modèle User
    UserChoice = User;
  }
  
  try {
    // Essayer d'utiliser le modèle UserRest existant
    UserRest = connection.model('UserRest');
  } catch (e) {
    // Si le modèle n'existe pas, réutiliser le modèle User
    UserRest = User;
  }

  return {
    User,
    UserChoice,
    UserRest
  };
}; 