const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // Stocké hashé
  photo_url: { type: String, default: null },
  conversations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' }], // Références aux conversations
  liked_tags: { type: [String], default: [] },
  trusted_circle: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
  posts: { type: [mongoose.Schema.Types.ObjectId], ref: 'Post', default: [] },
  followers_count: { type: Number, default: 0 },
  saved_posts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post'
  }],
});

// Ajouter une méthode pour récupérer les posts sauvegardés
UserSchema.methods.getSavedPosts = async function() {
  return await mongoose.model('Post').find({
    '_id': { $in: this.saved_posts }
  }).sort({ posted_at: -1 });
};

// Connexion dynamique à plusieurs bases
const choiceAppDb = mongoose.connection.useDb('choice_app');
const restDb = mongoose.connection.useDb('Restauration_Officielle');

// Export directly for case-sensitivity compatibility
module.exports = {
  UserChoice: choiceAppDb.model('User', UserSchema),
  UserRest: restDb.model('User', UserSchema),
};