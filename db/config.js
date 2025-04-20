require('dotenv').config();

const mongoose = require('mongoose');
const modelRegistry = require('../models/index');

// Configuration des connexions à la base de données
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'Restauration_Officielle';

console.log('🔌 Connexion à MongoDB avec URI:', MONGO_URI);
console.log('📊 Base de données principale:', DB_NAME);

// Configurer mongoose globalement
mongoose.set('strictQuery', false);

// Fonction pour établir la connexion principale
const connectToMongoDB = async () => {
  try {
    console.log('🔄 Tentative de connexion à MongoDB...');
    
    // Connexion directe via mongoose par défaut
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000,
      maxPoolSize: 10,
      maxIdleTimeMS: 10000,
      family: 4, 
      autoIndex: false,
      bufferCommands: false,
    });
    
    console.log('✅ Connexion à MongoDB établie avec succès');
    
    mongoose.connection.removeAllListeners('error');
    mongoose.connection.removeAllListeners('disconnected');

    mongoose.connection.on('error', (err) => {
      console.error('❌ Erreur MongoDB après connexion établie:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('😢 Déconnecté de MongoDB');
      setTimeout(connectToMongoDB, 5000);
    });
    
    return mongoose.connection;
  } catch (error) {
    console.error('❌ Erreur initiale lors de la connexion à MongoDB:', error.message);
    if (error.reason) {
        console.error('   Reason:', error.reason);
    }
    console.error('   Tentative de reconnexion dans 5 secondes...');
    setTimeout(connectToMongoDB, 5000);
    return null; 
  }
};

// Accès aux connexions spécifiques des bases de données
const getChoiceAppConnection = () => mongoose.connection.useDb('choice_app');
const getRestoConnection = () => mongoose.connection.useDb('Restauration_Officielle');
const getLoisirsConnection = () => mongoose.connection.useDb('Loisir&Culture');
const getBeautyConnection = () => mongoose.connection.useDb('Beauty_Wellness');

// Fonction d'initialisation des modèles - à appeler au démarrage de l'application
const initializeModels = async () => {
  console.log('🚀 Initialisation des modèles MongoDB...');
  
  try {
    if (mongoose.connection.readyState !== 1) {
      console.log('⚠️ Mongoose n est pas connecté, tentative de connexion...');
      const connection = await connectToMongoDB();
      if (!connection || connection.readyState !== 1) {
          console.error('❌ Échec de la connexion initiale à MongoDB. L initialisation des modèles ne peut pas continuer.');
          return false;
      }
    }
    
    const connections = {
      choiceAppDb: getChoiceAppConnection(),
      restaurationDb: getRestoConnection(),
      loisirDb: getLoisirsConnection(),
      beautyWellnessDb: getBeautyConnection(),
    };
    
    const { models } = modelRegistry.initialize(connections);
    
    global.models = models;
    
    console.log('✅ Tous les modèles ont été initialisés');
    return true;
  } catch (error) {
    console.error('❌ Erreur lors de l initialisation des modèles:', error);
    return false;
  }
};

// Exporter les connexions et les fonctions
module.exports = {
  connectToMongoDB,
  getChoiceAppConnection,
  getRestoConnection,
  getLoisirsConnection,
  getBeautyConnection,
  initializeModels,
  choiceAppConnection: getChoiceAppConnection,
  restaurationConnection: getRestoConnection,
  loisirsConnection: getLoisirsConnection,
  beautyWellnessConnection: getBeautyConnection,
}; 