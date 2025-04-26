const mongoose = require('mongoose');

// Modèle d'exportation centralisé pour éviter les dépendances circulaires
let db = {};
let models = {};

// Fonction d'initialisation qui sera appelée une fois que la connexion MongoDB est établie
const initialize = (connections) => {
  // Stockage des connexions
  db = connections;
  
  // DÉPRÉCIÉ: Les modèles ne sont plus exposés globalement
  // Au lieu de global.models, utiliser l'utilitaire createModel
  // Nous gardons global.db pour la compatibilité descendante
  global.db = db;
  
  try {
    // Enregistrement des modèles (pour compatibilité avec le code existant)
    const UserModels = require('./UserModels');
    if (typeof UserModels === 'function') {
      models.User = UserModels(db.choiceAppDb).User;
      models.UserChoice = UserModels(db.choiceAppDb).UserChoice;
      models.UserRest = UserModels(db.choiceAppDb).UserRest;
    } else {
      console.log('⚠️ UserModels n\'est pas une fonction, tentative de structure alternative');
      models.User = UserModels.User || UserModels;
    }
    
    // Importation des modèles avec la nouvelle structure - Appel de la fonction exportée
    try {
      const PostModelFactory = require('./Post'); // Récupère la fonction exportée
      if (typeof PostModelFactory !== 'function') {
        throw new Error('models/Post.js does not export a function.');
      }
      // Appelle la fonction avec la connexion pour obtenir le modèle enregistré
      models.Post = PostModelFactory(db.choiceAppDb); 
      console.log('✅ Modèle Post enregistré via sa fonction factory sur choiceAppDb.');
    } catch (e) {
       console.error('❌ Erreur lors du chargement ou enregistrement du modèle Post:', e);
       // Fallback
       models.Post = db.choiceAppDb.model(
         'Post',
         new mongoose.Schema({}, { strict: false }),
         'posts'
       );
    }
    
    // AJOUT : Enregistrer le modèle ProfileView
    try {
      const ProfileViewSchema = require('./ProfileView'); // Import the schema directly
      // Register the model using the schema
      models.ProfileView = db.choiceAppDb.model('ProfileView', ProfileViewSchema, 'profile_views'); 
      console.log('✅ Modèle ProfileView enregistré.');
    } catch (e) {
      console.error('❌ Erreur lors du chargement ou enregistrement du modèle ProfileView:', e);
      // Create a placeholder if loading fails
      models.ProfileView = db.choiceAppDb.model(
        'ProfileView',
        new mongoose.Schema({}, { strict: false }),
        'profile_views' 
      );
    }
    
    // AJOUT : Enregistrer le modèle Follow
    try {
      const FollowModel = require('./Follow'); // Assurez-vous que le fichier './Follow.js' existe
      models.Follow = typeof FollowModel === 'function' ? FollowModel(db.choiceAppDb) : FollowModel;
      console.log('✅ Modèle Follow enregistré.');
    } catch (e) {
      console.error('❌ Erreur lors du chargement du modèle Follow:', e);
      // Créer un modèle vide pour éviter les crashs, mais signaler le problème
      models.Follow = db.choiceAppDb.model(
        'Follow',
        new mongoose.Schema({}, { strict: false }),
        'follows' // Collection name
      );
    }

    // AJOUT : Enregistrer le modèle Subscription
    try {
      const SubscriptionModel = require('./Subscription'); // Assurez-vous que le fichier './Subscription.js' existe
      models.Subscription = typeof SubscriptionModel === 'function' ? SubscriptionModel(db.choiceAppDb) : SubscriptionModel;
      console.log('✅ Modèle Subscription enregistré.');
    } catch (e) {
      console.error('❌ Erreur lors du chargement du modèle Subscription:', e);
      // Créer un modèle vide pour éviter les crashs, mais signaler le problème
      models.Subscription = db.choiceAppDb.model(
        'Subscription',
        new mongoose.Schema({}, { strict: false }),
        'subscriptions' // Collection name
      );
    }
    
    const ProducerModel = require('./Producer');
    models.Producer = typeof ProducerModel === 'function' ? ProducerModel(db.restaurationDb) : ProducerModel;
    
    const LeisureProducerModel = require('./leisureProducer');
    models.LeisureProducer = typeof LeisureProducerModel === 'function' ? 
      LeisureProducerModel(db.loisirDb) : LeisureProducerModel;
    
    const WellnessPlaceModel = require('./WellnessPlace');
    models.WellnessPlace = typeof WellnessPlaceModel === 'function' ? 
      WellnessPlaceModel(db.beautyWellnessDb) : WellnessPlaceModel;
    
    // Event model - correctement géré pour éviter les conflits de compilation
    const eventModelFunction = require('./event');
    models.Event = typeof eventModelFunction === 'function' ? 
      eventModelFunction(db.choiceAppDb) : eventModelFunction;
    
    // Ajouter le modèle EmailLog - vérifier s'il existe
    try {
      const EmailLogModel = require('./EmailLog');
      models.EmailLog = EmailLogModel;
    } catch (e) {
      console.log('⚠️ Modèle EmailLog non trouvé, création d\'un schéma vide');
      models.EmailLog = db.choiceAppDb.model(
        'EmailLog', 
        new mongoose.Schema({}, { strict: false }),
        'email_logs'
      );
    }
    
    // Ajouter les modèles de tags de contacts
    try {
      const contactTagModels = require('./contactTag');
      if (typeof contactTagModels === 'function') {
        const tagModels = contactTagModels(db.choiceAppDb);
        models.ContactTag = tagModels.ContactTag;
        models.ContactTagAssociation = tagModels.ContactTagAssociation;
      } else {
        models.ContactTag = contactTagModels.ContactTag;
        models.ContactTagAssociation = contactTagModels.ContactTagAssociation;
      }
    } catch (e) {
      console.log('⚠️ Modèles de tags non trouvés, création de schémas vides');
      models.ContactTag = db.choiceAppDb.model(
        'ContactTag', 
        new mongoose.Schema({}, { strict: false }),
        'ContactTags'
      );
      models.ContactTagAssociation = db.choiceAppDb.model(
        'ContactTagAssociation', 
        new mongoose.Schema({}, { strict: false }),
        'ContactTagAssociations'
      );
    }
  } catch (error) {
    console.error('❌ Erreur lors du chargement des modèles:', error);
  }
  
  // Créer un modèle générique AnalyticsEvent
  models.AnalyticsEvent = db.choiceAppDb.model(
    'AnalyticsEvent',
    new mongoose.Schema({
      name: String,
      parameters: Object,
      timestamp: {
        type: Date,
        default: Date.now
      },
      userId: String,
      sessionId: String,
      deviceInfo: Object
    }),
    'analyticsEvents'
  );
  
  // Modèle générique Activity
  models.Activity = db.choiceAppDb.model(
    'Activity', 
    new mongoose.Schema({}, { strict: false }),
    'activities'
  );
  
  // Modèle pour les inscriptions d'événements
  models.EventRegistration = db.choiceAppDb.model(
    'EventRegistration',
    new mongoose.Schema({
      eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      registrationDate: { type: Date, default: Date.now },
      status: { type: String, enum: ['registered', 'cancelled', 'waitlisted'], default: 'registered' },
      notes: { type: String }
    }),
    'event_registrations'
  );
  
  // Ajouter le modèle de conversation (maintenant avec fonction d'initialisation)
  try {
    const ConversationModel = require('./conversation');
    models.Conversation = typeof ConversationModel === 'function' ? 
      ConversationModel(db.choiceAppDb) : ConversationModel;
  } catch (e) {
    console.log('⚠️ Modèle Conversation non trouvé, création d\'un schéma vide');
    models.Conversation = db.choiceAppDb.model(
      'Conversation', 
      new mongoose.Schema({}, { strict: false }),
      'conversations'
    );
  }
  
  console.log('✅ Tous les modèles ont été chargés dans le registry local (index.js)');
  
  return { db, models };
};

// Fonction pour obtenir un modèle particulier par nom
const getModel = (modelName) => {
  if (!models[modelName]) {
    console.error(`❌ Modèle non trouvé: ${modelName}`);
    return null;
  }
  return models[modelName];
};

// Fonction pour obtenir le modèle User
const getUserModel = () => {
  return models.User;
};

module.exports = {
  initialize,
  Event: require('./event'),
  getModel,
  getUserModel
}; 