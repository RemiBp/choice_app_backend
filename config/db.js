const mongoose = require('mongoose');
require('dotenv').config();

// Utiliser des variables module-level pour les connexions
let choiceAppDb, testDb, loisirsDb, restaurationDb, beautyWellnessDb;
let isConnected = false;

/**
 * Établit la connexion à MongoDB et initialise les bases de données
 */
const connectDB = async () => {
  try {
    if (isConnected) {
      console.log('✅ MongoDB déjà connecté, réutilisation de la connexion');
      return;
    }

    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ Connexion MongoDB réussie');

    // Définir les bases secondaires uniquement après la connexion
    choiceAppDb = conn.connection.useDb('choice_app');
    testDb = conn.connection.useDb('test');
    loisirsDb = conn.connection.useDb('Loisir&Culture');
    restaurationDb = conn.connection.useDb('Restauration_Officielle');
    beautyWellnessDb = conn.connection.useDb('Beauty_Wellness');
    isConnected = true;

    console.log('✅ Bases de données initialisées :');
    console.log(`  - choice_app (principale)`);
    console.log(`  - Loisir&Culture (loisirs)`);
    console.log(`  - Restauration_Officielle (restauration)`);
    console.log(`  - Beauty_Wellness (beauté & bien-être)`);

  } catch (error) {
    console.error('❌ Erreur connexion MongoDB:', error);
    isConnected = false;
    // Ne pas quitter le processus pour permettre de réessayer
    // process.exit(1);
  }
};

/**
 * Vérifie si les connexions sont établies, sinon tente de se reconnecter
 */
const ensureConnected = async () => {
  if (!isConnected || !choiceAppDb || !restaurationDb || !loisirsDb || !beautyWellnessDb) {
    console.log('⚠️ Connexions MongoDB manquantes ou non initialisées, tentative de reconnexion...');
    await connectDB();
    return isConnected;
  }
  return true;
};

// Fonctions principales pour obtenir les connexions
const getChoiceAppDb = async () => {
  await ensureConnected();
  return choiceAppDb;
};

const getTestDb = async () => {
  await ensureConnected();
  return testDb;
};

const getLoisirsDb = async () => {
  await ensureConnected();
  return loisirsDb;
};

const getRestoDb = async () => {
  await ensureConnected();
  return restaurationDb;
};

const getBeautyDb = async () => {
  await ensureConnected();
  return beautyWellnessDb;
};

// Versions synchrones pour la compatibilité avec le code existant
const getChoiceAppDbSync = () => choiceAppDb;
const getTestDbSync = () => testDb;
const getLoisirsDbSync = () => loisirsDb;
const getRestoDbSync = () => restaurationDb;
const getBeautyDbSync = () => beautyWellnessDb;

module.exports = {
  connectDB,
  ensureConnected,
  
  // Méthodes principales (asynchrones)
  getChoiceAppDb,
  getTestDb,
  getLoisirsDb,
  getRestoDb,
  getBeautyDb,
  
  // Versions synchrones
  getChoiceAppDbSync,
  getTestDbSync,
  getLoisirsDbSync,
  getRestoDbSync,
  getBeautyDbSync,
  
  // Alias pour compatibilité
  getChoiceAppConnection: getChoiceAppDbSync, 
  getRestoConnection: getRestoDbSync,
  getLoisirsConnection: getLoisirsDbSync,
  getBeautyConnection: getBeautyDbSync,
  
  // Anciens noms pour rétrocompatibilité
  getRestaurationDb: getRestoDbSync,
  getBeautyWellnessDb: getBeautyDbSync
};
