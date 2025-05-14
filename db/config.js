require('dotenv').config();

const mongoose = require('mongoose');
const modelRegistry = require('../models/index');

// Stockage des connexions spécifiques une fois créées
let choiceAppConnectionInstance = null;
let restoConnectionInstance = null;
let loisirsConnectionInstance = null;
let beautyConnectionInstance = null;

// Configuration des connexions à la base de données
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
// DB_NAME is not directly used for connect(), useDb() specifies the DB
// const DB_NAME = process.env.DB_NAME || 'Restauration_Officielle';

console.log('🔌 Connexion à MongoDB avec URI:', MONGO_URI);
// console.log('📊 Base de données principale (via useDb):', DB_NAME); // Commented out as useDb handles it

// Configurer mongoose globalement
mongoose.set('strictQuery', false);

// --- Fonction interne pour établir et stocker les connexions ---
const _establishAndStoreConnections = () => {
    try {
        console.log('🔗 Établissement des connexions DB spécifiques (choice_app, Restauration_Officielle, ...)')
        choiceAppConnectionInstance = mongoose.connection.useDb('choice_app', { useCache: true });
        restoConnectionInstance = mongoose.connection.useDb('Restauration_Officielle', { useCache: true });
        loisirsConnectionInstance = mongoose.connection.useDb('Loisir&Culture', { useCache: true });
        beautyConnectionInstance = mongoose.connection.useDb('Beauty_Wellness', { useCache: true });
        console.log('✅ Connexions DB spécifiques stockées.');

        // Optionally add event listeners to these specific connections if needed
        // choiceAppConnectionInstance.on('error', ...);

    } catch (error) {
        console.error("❌ Erreur lors de l'établissement des connexions DB spécifiques via useDb:", error);
        // Set instances to null so getters don't return potentially broken objects
        choiceAppConnectionInstance = null;
        restoConnectionInstance = null;
        loisirsConnectionInstance = null;
        beautyConnectionInstance = null;
    }
}

// Fonction pour établir la connexion principale
const connectToMongoDB = async () => {
  try {
    console.log('🔄 Tentative de connexion principale à MongoDB...');

    // Vérifier si déjà connecté ou en cours de connexion
    if (mongoose.connection.readyState === 1) {
      console.log('✅ Connexion MongoDB principale déjà établie.');
      // Ensure specific connections are also established if main connection existed
       if (!choiceAppConnectionInstance || !restoConnectionInstance || !loisirsConnectionInstance || !beautyConnectionInstance) {
           _establishAndStoreConnections();
       }
      return mongoose.connection;
    }
     if (mongoose.connection.readyState === 2) {
      console.log('⏳ Connexion MongoDB principale déjà en cours...');
      // Wait for the existing connection attempt to finish
      await new Promise(resolve => mongoose.connection.once('open', resolve));
       console.log('✅ Connexion MongoDB principale (en cours) établie.');
       // Ensure specific connections are also established
       if (!choiceAppConnectionInstance || !restoConnectionInstance || !loisirsConnectionInstance || !beautyConnectionInstance) {
           _establishAndStoreConnections();
       }
      return mongoose.connection;
    }

    // Connexion directe via mongoose par défaut
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 30000, // Temps d'attente pour la sélection du serveur
      socketTimeoutMS: 45000,        // Temps d'attente pour les opérations sur socket
      connectTimeoutMS: 30000,       // Temps d'attente pour la connexion initiale
      maxPoolSize: 15,               // Taille max du pool de connexions
      // minPoolSize: 5,             // Taille min du pool (optionnel, peut aider à garder des connexions actives)
      maxIdleTimeMS: 60000,          // Temps max d'inactivité d'une connexion dans le pool
      family: 4,                     // Utiliser IPv4
      autoIndex: false,              // Désactiver l'indexation auto (recommandé pour prod)
      bufferCommands: false,         // Désactiver la mise en mémoire tampon des commandes si non connecté
      // useUnifiedTopology: true,    // N'est plus nécessaire dans Mongoose 6+
      // useNewUrlParser: true,       // N'est plus nécessaire dans Mongoose 6+
    });

    console.log('✅ Connexion principale à MongoDB établie avec succès');

     // --- Établir et stocker les connexions spécifiques APRÈS la connexion principale ---
    _establishAndStoreConnections();

    // Configurer les listeners après la connexion initiale réussie
    mongoose.connection.removeAllListeners('error'); // Nettoyer les anciens listeners
    mongoose.connection.removeAllListeners('disconnected');
    mongoose.connection.removeAllListeners('close'); // Ajouter listener pour close

    mongoose.connection.on('error', (err) => {
      console.error('❌ Erreur MongoDB (principale) après connexion établie:', err);
      // Ici, on ne relance pas connectToMongoDB car Mongoose gère les reconnexions
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('🔌 Connexion MongoDB principale PERDUE. Mongoose tentera de se reconnecter.');
       // Invalider les instances stockées car elles dépendent de la connexion principale
       choiceAppConnectionInstance = null;
       restoConnectionInstance = null;
       loisirsConnectionInstance = null;
       beautyConnectionInstance = null;
       // Ne pas appeler connectToMongoDB ici, laisser Mongoose gérer la reconnexion
    });

     mongoose.connection.on('close', () => {
      console.log('🚪 Connexion MongoDB principale FERMÉE.');
       choiceAppConnectionInstance = null;
       restoConnectionInstance = null;
       loisirsConnectionInstance = null;
       beautyConnectionInstance = null;
    });

     mongoose.connection.on('reconnected', () => {
        console.log('✅ Connexion MongoDB principale RECONNECTÉE.');
        // Rétablir les connexions spécifiques
        _establishAndStoreConnections();
    });


    return mongoose.connection;

  } catch (error) {
    console.error('❌ Erreur initiale lors de la connexion principale à MongoDB:', error.message);
    if (error.reason) {
        console.error('   Reason:', error.reason.message || error.reason);
    }
    // Pas de reconnexion manuelle ici, Mongoose devrait gérer
    // console.error('   Tentative de reconnexion dans 5 secondes...');
    // setTimeout(connectToMongoDB, 5000);
    // Throw error to prevent server start if initial connection fails critically
    throw new Error(`Échec critique de la connexion initiale à MongoDB: ${error.message}`);
    // return null; // Previous logic
  }
};

// Accès aux connexions spécifiques des bases de données (SIMPLIFIÉ)
const getChoiceAppConnection = () => {
    if (!choiceAppConnectionInstance && mongoose.connection.readyState === 1) {
         console.warn("⚠️ Tentative d'accès à choiceAppConnection alors qu'elle n'est pas encore initialisée (mais connexion principale OK). Tentative d'initialisation...");
        _establishAndStoreConnections(); // Essayer de les établir si la connexion principale est OK
    }
  // Retourne l'instance (peut être null si l'établissement a échoué ou si la connexion principale n'est pas prête)
  return choiceAppConnectionInstance;
};
const getRestoConnection = () => {
    if (!restoConnectionInstance && mongoose.connection.readyState === 1) {
        console.warn("⚠️ Tentative d'accès à restoConnection alors qu'elle n'est pas encore initialisée (mais connexion principale OK). Tentative d'initialisation...");
        _establishAndStoreConnections();
    }
  return restoConnectionInstance;
};
const getLoisirsConnection = () => {
    if (!loisirsConnectionInstance && mongoose.connection.readyState === 1) {
       console.warn("⚠️ Tentative d'accès à loisirsConnection alors qu'elle n'est pas encore initialisée (mais connexion principale OK). Tentative d'initialisation...");
        _establishAndStoreConnections();
    }
  return loisirsConnectionInstance;
};
const getBeautyConnection = () => {
    if (!beautyConnectionInstance && mongoose.connection.readyState === 1) {
        console.warn("⚠️ Tentative d'accès à beautyConnection alors qu'elle n'est pas encore initialisée (mais connexion principale OK). Tentative d'initialisation...");
        _establishAndStoreConnections();
    }
  return beautyConnectionInstance;
};

// Fonction d'initialisation des modèles (utilise les getters simplifiés)
const initializeModels = async () => {
  console.log('🚀 Initialisation des modèles MongoDB...');

  try {
    // Vérifier si la connexion principale est prête (attendre si nécessaire?)
    // Bien que connectToMongoDB soit attendu dans index.js, ajoutons une sécurité.
     if (mongoose.connection.readyState !== 1) {
        console.warn('⏳ Connexion principale Mongoose non prête lors de initializeModels. Attente...');
        // Attendre l'événement 'open' ou 'reconnected'
        await new Promise(resolve => mongoose.connection.once('open', resolve).once('reconnected', resolve));
         console.log('✅ Connexion principale Mongoose prête pour initializeModels.');
         // S'assurer que les connexions spécifiques sont établies après l'attente
         if (!choiceAppConnectionInstance || !restoConnectionInstance || !loisirsConnectionInstance || !beautyConnectionInstance) {
             _establishAndStoreConnections();
         }
    }

    const connections = {
      choiceAppDb: getChoiceAppConnection(),
      restaurationDb: getRestoConnection(),
      loisirDb: getLoisirsConnection(), // Note: key name mismatch 'loisirDb' vs 'loisirsConnectionInstance'? Correcting key.
      beautyWellnessDb: getBeautyConnection(),
    };

    // Vérifier si toutes les connexions requises sont valides AVANT d'initialiser les modèles
     if (!connections.choiceAppDb || !connections.restaurationDb || !connections.loisirDb || !connections.beautyWellnessDb) {
        console.error("❌ Échec de l'obtention d'une ou plusieurs connexions DB spécifiques. Modèles non initialisés.", connections);
         return false; // Ne pas continuer si une connexion manque
     }

    const { models } = modelRegistry.initialize(connections);

    global.models = models; // Est-ce vraiment nécessaire/souhaitable d'utiliser global ?

    console.log('✅ Tous les modèles ont été initialisés');
    return true;
  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation des modèles:', error);
    return false;
  }
};

// Exporter les connexions et les fonctions
module.exports = {
  connectToMongoDB: connectToMongoDB,
  getChoiceAppConnection: getChoiceAppConnection,
  getRestoConnection: getRestoConnection,
  getLoisirsConnection: getLoisirsConnection,
  getBeautyConnection: getBeautyConnection,
  initializeModels: initializeModels,
  // Compatibility aliases (optional)
  getChoiceAppDb: getChoiceAppConnection,
  getRestaurationDb: getRestoConnection,
  getLoisirsDb: getLoisirsConnection,
  getBeautyWellnessDb: getBeautyConnection
}; 