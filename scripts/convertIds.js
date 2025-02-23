const mongoose = require('mongoose');

// URI de connexion MongoDB
const MONGO_URI = 'mongodb+srv://remibarbier:Calvi8Pierc2@lieuxrestauration.szq31.mongodb.net/?retryWrites=true&w=majority&appName=lieuxrestauration';

// Connexion à MongoDB
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ Connexion à MongoDB réussie'))
  .catch(err => {
    console.error('❌ Erreur de connexion MongoDB :', err.message);
    process.exit(1);
  });

// Modèles
const oldUsersDb = mongoose.connection.useDb('Restauration_Officielle'); // Base actuelle
const newUsersDb = mongoose.connection.useDb('choice_app'); // Nouvelle base

const OldUser = oldUsersDb.model('User', new mongoose.Schema({}, { strict: false }), 'Users');
const NewUser = newUsersDb.model('User', new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, required: true },
  age: { type: Number, required: false },
  gender: { type: String, required: false },
  photo_url: { type: String, required: false },
  bio: { type: String, required: false },
  location: { type: Object, default: {} },
  preferred_content_format: { type: Object, default: {} },
  liked_tags: { type: [String], default: [] },
  trusted_circle: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  sector_preferences: { type: Object, default: {} },
  interaction_metrics: { type: Object, default: {} },
  consumption_behavior: { type: Object, default: {} },
  activity_times: { type: Object, default: {} },
  frequent_locations: { type: [Object], default: [] },
  affinity_producers: { type: [Object], default: [] },
  search_keywords: { type: [String], default: [] },
  is_star: { type: Boolean, default: false },
  followers_count: { type: Number, default: 0 },
  influence_score: { type: Number, default: 0 },
  posts: { type: [mongoose.Schema.Types.ObjectId], default: [] }
}));

// Script pour migrer les utilisateurs
async function migrateUsers() {
  try {
    const oldUsers = await OldUser.find(); // Récupérer tous les utilisateurs existants
    console.log(`✅ ${oldUsers.length} utilisateurs récupérés.`);

    const newUsers = oldUsers.map((user) => {
      return {
        _id: new mongoose.Types.ObjectId(), // Générer un nouvel ObjectId
        name: user.name || 'Utilisateur inconnu',
        age: user.age || null,
        gender: user.gender || 'Non spécifié',
        photo_url: user.photo_url || '',
        bio: user.bio || '',
        location: user.location || {},
        preferred_content_format: user.preferred_content_format || {},
        liked_tags: user.liked_tags || [],
        trusted_circle: Array.isArray(user.trusted_circle)
          ? user.trusted_circle.map((id) => new mongoose.Types.ObjectId(id)) // Convertir en ObjectId
          : [],
        sector_preferences: user.sector_preferences || {},
        interaction_metrics: user.interaction_metrics || {},
        consumption_behavior: user.consumption_behavior || {},
        activity_times: user.activity_times || {},
        frequent_locations: user.frequent_locations || [],
        affinity_producers: user.affinity_producers || [],
        search_keywords: user.search_keywords || [],
        is_star: user.is_star || false,
        followers_count: user.followers_count || 0,
        influence_score: user.influence_score || 0,
        posts: Array.isArray(user.posts)
          ? user.posts.map((post) => new mongoose.Types.ObjectId(post)) // Convertir en ObjectId
          : [],
      };
    });

    await NewUser.insertMany(newUsers); // Insérer les nouveaux utilisateurs dans la collection `Users` de `choice_app`
    console.log(`✅ ${newUsers.length} utilisateurs migrés avec succès dans la base 'choice_app'.`);
  } catch (error) {
    console.error('❌ Erreur lors de la migration des utilisateurs :', error.message);
  } finally {
    mongoose.connection.close();
  }
}

// Lancer la migration
migrateUsers();
