const mongoose = require('mongoose');
const modelRegistry = require('../models/index');
require('dotenv').config();

// Configuration des connexions à la base de données
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
console.log('🔌 Connexion à MongoDB avec URI:', MONGO_URI);

// Configurer mongoose globalement
mongoose.set('strictQuery', false);

// Fonction pour établir la connexion principale
const connectToMongoDB = async () => {
  try {
    console.log('🔄 Tentative de connexion à MongoDB...');
    
    // Connexion directe via mongoose par défaut
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 60000,
      socketTimeoutMS: 90000,
      connectTimeoutMS: 60000,
      maxPoolSize: 50,
      maxIdleTimeMS: 30000,
      family: 4,
      autoIndex: true,
      bufferCommands: false,
    });
    
    // Maintenant mongoose.connection est disponible pour tout le monde
    console.log('✅ Connexion à MongoDB établie avec succès');
    
    // Détecter la déconnexion et la reconnexion
    mongoose.connection.on('error', (err) => {
      console.error('❌ Erreur MongoDB:', err);
      setTimeout(connectToMongoDB, 5000);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('😢 Déconnecté de MongoDB');
      setTimeout(connectToMongoDB, 5000);
    });
    
    return mongoose.connection;
  } catch (error) {
    console.error('❌ Erreur lors de la connexion à MongoDB:', error);
    // Réessayer après un délai
    setTimeout(connectToMongoDB, 5000);
    throw error;
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
    // Vérifier que mongoose est connecté
    if (mongoose.connection.readyState !== 1) {
      console.log('⚠️ Mongoose n\'est pas connecté, tentative de connexion...');
      await connectToMongoDB();
    }
    
    // Obtenir les connexions aux différentes bases de données
    const connections = {
      choiceAppDb: getChoiceAppConnection(),
      restaurationDb: getRestoConnection(),
      loisirDb: getLoisirsConnection(),
      beautyWellnessDb: getBeautyConnection(),
    };
    
    // Initialiser les modèles à partir du registry
    const { models } = modelRegistry.initialize(connections);
    
    // Rendre les modèles disponibles globalement (si nécessaire)
    global.models = models;
    
    console.log('✅ Tous les modèles ont été initialisés');
    return true;
  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation des modèles:', error);
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
  // Pour la compatibilité avec le code existant
  choiceAppConnection: getChoiceAppConnection,
  restaurationConnection: getRestoConnection,
  loisirsConnection: getLoisirsConnection,
  beautyWellnessConnection: getBeautyConnection,
}; 