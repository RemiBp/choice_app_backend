const jwt = require('jsonwebtoken');
// Correctly import models needed for producer lookup
const { getUserModel, getModel } = require('../models/index'); 
const { ObjectId } = require('mongodb');
const User = require('../models/User'); // Adjust path as needed

// Helper function to get producer model (moved logic here)
const getProducerModelForType = (accountType) => {
  switch (accountType) {
    case 'RestaurantProducer':
      return getModel('Producer'); // Assumes 'Producer' model is for restaurants
    case 'LeisureProducer':
      return getModel('LeisureProducer');
    case 'WellnessProducer': // Assuming 'WellnessPlace' or 'BeautyPlace' model might be used here
      // You might need to adjust this based on your exact model structure
      // Let's try WellnessPlace first
      return getModel('WellnessPlace') || getModel('BeautyPlace') || getModel('beautyProducer'); 
    default:
      console.warn(`Unknown producer account type: ${accountType}, falling back to Producer`);
      return getModel('Producer');
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
    const { _id, accountType } = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user/producer info to request for later use
    if (accountType === 'user') {
      const User = getUserModel();
      if (!User) throw new Error('User model not available');
      req.user = await User.findOne({ _id }).select('_id email'); // Fetch necessary user fields
      if (!req.user) throw new Error('User not found');
    } else if (['RestaurantProducer', 'LeisureProducer', 'WellnessProducer'].includes(accountType)) {
      const ProducerModel = getProducerModelForType(accountType); // Use the helper logic
      if (!ProducerModel) throw new Error(`Producer model not available for type: ${accountType}`);
      req.producer = await ProducerModel.findOne({ _id }).select('_id name lieu businessName type photo'); // Fetch necessary producer fields
      if (!req.producer) throw new Error('Producer not found');
      // Add producer type to request for easier checks
      req.accountType = accountType;
    } else {
      throw new Error('Invalid account type in token');
    }

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
    const { producerId } = req.params || req.body;
    
    if (!producerId) {
      return res.status(400).json({ message: 'Producer ID is required' });
    }
    
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    // Allow access if the user is the producer
    if (req.user._id.toString() === producerId.toString()) {
      return next();
    }
    
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