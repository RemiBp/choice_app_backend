const jwt = require('jsonwebtoken');
// Correctly import models needed for producer lookup
const { getUserModel, getModel } = require('../models/index'); 
const { ObjectId } = require('mongodb');
const User = require('../models/User'); // Adjust path as needed
const db = require('../config/db'); // Import db config to get connections

// Helper function to get the correct database connection and model
const getProducerModelForType = (accountType) => {
  let connection;
  let modelName;
  let collectionName;

  console.log(`[getProducerModelForType] Attempting to get model for accountType: ${accountType}`); // Added Log

  switch (accountType) {
    case 'RestaurantProducer':
      connection = db.getRestoConnection(); 
      modelName = 'Producer'; 
      collectionName = 'producers'; 
      break;
    case 'LeisureProducer':
      connection = db.getLoisirsConnection();
      modelName = 'LeisureProducer';
      collectionName = 'Loisir_Paris_Producers';
      break;
    case 'WellnessProducer':
      connection = db.getBeautyConnection();
      modelName = 'WellnessPlace'; 
      collectionName = 'BeautyPlaces';
      break;
    default:
      console.warn(`[getProducerModelForType] Unknown producer account type: ${accountType}`);
      return null; 
  }

  // --- ADDED: Explicit Connection Check --- 
  if (!connection) {
    console.error(`❌ [getProducerModelForType] Failed to get connection for ${accountType}. Connection object is undefined.`);
    return null;
  } else {
    // Check readyState (1 = connected, 2 = connecting, 3 = disconnecting, 0 = disconnected)
    const readyState = connection.readyState;
    console.log(`[getProducerModelForType] Connection obtained for ${accountType}. Name: ${connection.name}, ReadyState: ${readyState}`);
    if (readyState !== 1) {
        console.error(`❌ [getProducerModelForType] Connection for ${accountType} is not ready (State: ${readyState}).`);
        // Optionally return null here, or let the model lookup fail below
        // return null; 
    }
  }
  // --- END ADDED CHECK --- 
  
  // Attempt to get the model from the specific connection
  try {
      // Check if model already exists on the connection's model registry
      if (connection.models && connection.models[modelName]) {
          console.log(`[getProducerModelForType] ✅ Found existing model '${modelName}' in connection cache.`);
          return connection.models[modelName];
      }
      
      console.warn(`[getProducerModelForType] Model '${modelName}' not in cache for ${connection.name}. Attempting dynamic registration...`);
      
      // Dynamically require the model factory function based on modelName
      // Ensure the path and filename convention matches (`../models/Producer.js`, `../models/LeisureProducer.js`, etc.)
      let SchemaFactory;
      try {
          SchemaFactory = require(`../models/${modelName}`);
      } catch (requireError) {
           console.error(`❌ [getProducerModelForType] Failed to require schema factory '../models/${modelName}.js':`, requireError);
           throw new Error(`Schema factory not found for ${modelName}`); // Re-throw to be caught below
      }

      if (typeof SchemaFactory !== 'function') {
           console.error(`❌ [getProducerModelForType] Required file '../models/${modelName}.js' does not export a function.`);
           throw new Error(`Schema factory is not a function for ${modelName}`);
      }
      
      // Register model on the fly using the factory
      const RegisteredModel = SchemaFactory(connection);
      console.log(`[getProducerModelForType] ✅ Dynamically registered model '${RegisteredModel.modelName}'.`);
      return RegisteredModel; 

  } catch (error) {
      console.error(`❌ [getProducerModelForType] Error getting/registering model '${modelName}' for ${accountType}:`, error.message);
      
       // Fallback: Create a minimal schema if dynamic load fails
       // This is less ideal as it loses schema validation but prevents crashes
       try {
           console.warn(`[getProducerModelForType] Attempting fallback minimal model creation for '${modelName}'.`);
           const mongoose = require('mongoose');
           const Schema = mongoose.Schema;
           const minimalSchema = new Schema({}, { collection: collectionName, strict: false });
           
           // Use connection.model, handle potential overwrite error
           try {
               // Check if already defined (e.g., by another request concurrently)
               return connection.model(modelName);
           } catch (modelError) {
               // If not defined or different error, try defining it
               if (modelError.name === 'MissingSchemaError') {
                   return connection.model(modelName, minimalSchema);
               }
               // If it IS already defined (OverwriteModelError), just return it
               if (modelError.name === 'OverwriteModelError') {
                  console.warn(`[getProducerModelForType] Fallback: Model '${modelName}' was already defined.`);
                  return connection.model(modelName);
               }
               // Re-throw other errors during model creation
               throw modelError; 
           }
       } catch (fallbackError) {
            console.error(`❌ [getProducerModelForType] Critical: Fallback model creation failed for '${modelName}':`, fallbackError);
            return null;
       }
  }
};

// Récupérer la clé secrète pour JWT depuis les variables d'environnement
const JWT_SECRET = process.env.JWT_SECRET || 'your-default-secret-key';

/**
 * Middleware pour authentifier les requêtes avec un token JWT
 * @param {Object} req - Requête Express
 * @param {Object} res - Réponse Express
 * @param {Function} next - Fonction pour passer au middleware suivant
 */
const requireAuth = async (req, res, next) => {
  const { authorization } = req.headers;

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token required' });
  }

  const token = authorization.split(' ')[1];

  try {
    // Verify token and extract payload 
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Extract id and accountType from decoded token
    // If accountType is missing, default to 'user'
    const id = decoded.id;
    const accountType = decoded.accountType || 'user';

    console.log(`[requireAuth] RAW Decoded Payload:`, JSON.stringify(decoded));
    console.log(`[requireAuth] Token verified: id=${id}, accountType=${accountType} (${accountType === decoded.accountType ? 'from token' : 'defaulted'})`);

    let userOrProducerData = null;
    if (accountType === 'user') {
      const User = getUserModel(); // getUserModel seems okay as it uses models/index.js which uses choiceAppDb
      if (!User) {
          console.error("Auth.js: User model not available via getUserModel");
          throw new Error('User model not available');
      }
      userOrProducerData = await User.findOne({ _id: new ObjectId(id) }).select('_id email'); 
      if (!userOrProducerData) throw new Error('User not found');
      req.user = { id: id, accountType: 'user' }; 
      req.userData = userOrProducerData; 
    } else if (['RestaurantProducer', 'LeisureProducer', 'WellnessProducer'].includes(accountType)) { 
      const ProducerModel = getProducerModelForType(accountType); // Use the updated helper
      if (!ProducerModel) {
          console.error(`Auth.js: Producer model not available for type: ${accountType}`);
          throw new Error(`Producer model not available for type: ${accountType}`);
      }
      userOrProducerData = await ProducerModel.findOne({ _id: new ObjectId(id) }).select('_id name lieu businessName type photo'); 
      if (!userOrProducerData) {
          // Log the specific model and ID that failed
          console.error(`Auth.js: Producer ${id} not found using model ${ProducerModel.modelName} for type ${accountType}`);
          throw new Error('Producer not found');
      }
      req.user = { id: id, accountType: accountType }; 
      req.producerData = userOrProducerData; 
      req.accountType = accountType;
    } else {
      throw new Error(`Invalid account type in token: ${accountType}`);
    }
    
    console.log(`[requireAuth] Attaching req.user:`, JSON.stringify(req.user));

    next();
  } catch (error) {
    console.error('Auth Error:', error.message);
    res.status(401).json({ error: 'Request is not authorized' });
  }
};

/**
 * Middleware pour vérifier si l'utilisateur a un rôle spécifique
 * @param {string|string[]} roles - Rôle(s) requis pour accéder à la ressource
 * @returns {Function} Middleware Express
 */
const authorizeRoles = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentification requise' });
    }
    
    const userRole = req.user.role || 'user';
    const requiredRoles = Array.isArray(roles) ? roles : [roles];
    
    if (!requiredRoles.includes(userRole)) {
      return res.status(403).json({ 
        message: 'Accès non autorisé - Rôle insuffisant' 
      });
    }
    
    next();
  };
};

/**
 * Middleware d'authentification optionnelle
 * Décode le token si présent mais ne bloque pas si absent
 */
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    // Si aucun token n'est fourni, continuer sans authentification
    if (!token) {
      req.user = null;
      return next();
    }
    
    // Vérifier et décoder le token
    jwt.verify(token, JWT_SECRET, (err, decodedUser) => {
      if (err) {
        req.user = null;
        return next();
      }
      
      req.user = decodedUser;
      next();
    });
  } catch (error) {
    console.error('❌ Erreur d\'authentification optionnelle:', error);
    req.user = null;
    next();
  }
};

/**
 * Middleware to check if the authenticated user has access to the specified producer
 */
const checkProducerAccess = async (req, res, next) => {
  try {
    // Vérifier si l'utilisateur est authentifié
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Si l'utilisateur est un utilisateur normal (pas un producteur), lui donner accès
    if (req.user.accountType === 'user') {
      console.log('[checkProducerAccess] User account type detected - granting access without producerId check');
      return next();
    }
    
    // Pour les producteurs, vérifier le producerId
    // Le producerId peut être dans req.params, req.body, ou dans req.query
    const producerId = req.params.producerId || req.body.producerId || req.query.producerId;
    
    if (!producerId) {
      console.log('[checkProducerAccess] Producer request without producerId, using authenticated user ID');
      // Si aucun producerId n'est fourni, on assume que l'utilisateur veut accéder à son propre profil
      req.body.producerId = req.user.id; // Ajouter l'ID au body pour les routes qui en ont besoin
      return next();
    }
    
    // Allow access if the user is the producer
    // Compare les IDs en tant que strings pour éviter les problèmes de type
    if (req.user.id.toString() === producerId.toString()) {
      return next();
    }
    
    // Log l'accès refusé
    console.warn(`⚠️ [checkProducerAccess] Access denied: User ${req.user.id} (${req.user.accountType}) tried to access producer ${producerId}`);
    
    // This could be expanded to check for admin roles, team members, etc.
    return res.status(403).json({ message: 'Access denied: You do not have permission to access this producer' });
  } catch (error) {
    console.error('❌ Error in checkProducerAccess middleware:', error);
    return res.status(500).json({ message: 'Server error during access check' });
  }
};

module.exports = {
  requireAuth,
  authorizeRoles,
  optionalAuth,
  checkProducerAccess
}; 