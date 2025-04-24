const jwt = require('jsonwebtoken');

const JWT_SECRET_KEY = process.env.JWT_SECRET || 'default_jwt_secret';

// Log a warning if the default secret is being used
if (JWT_SECRET_KEY === 'default_jwt_secret') {
  console.warn('⚠️ WARNING: Using default JWT secret. Set JWT_SECRET environment variable for production!');
}

/**
 * Middleware d'authentification
 * Vérifie que le token JWT fourni dans l'en-tête 'Authorization' est valide
 */
const authenticateJWT = async (req, res, next) => {
  try {
    // Récupérer le token de l'en-tête Authorization
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Authentification requise' });
    }
    
    // Vérifier le token
    console.log(`🔑 Verifying token using secret starting with: ${JWT_SECRET_KEY.substring(0, 5)}...`);
    const decoded = jwt.verify(token, JWT_SECRET_KEY);
    
    // Ajouter TOUTES les données utilisateur décodées à l'objet req
    req.user = decoded;
    
    next();
  } catch (error) {
    console.error('Erreur d\'authentification:', error.name, error.message);
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: 'Token invalide (signature)' });
    } else if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expiré' });
    } else {
      return res.status(401).json({ error: 'Token invalide ou problème d\'authentification' });
    }
  }
};

// Alias pour maintenir la compatibilité avec le code existant
const auth = authenticateJWT;

/**
 * Middleware pour vérifier si l'utilisateur est administrateur
 */
const adminAuth = (req, res, next) => {
  authenticateJWT(req, res, () => {
    // Vérifier si l'utilisateur est administrateur
    if (req.user && req.user.role === 'admin') {
      next();
    } else {
      res.status(403).json({ message: 'Accès non autorisé: rôle administrateur requis' });
    }
  });
};

/**
 * Middleware pour vérifier si l'utilisateur est un producteur
 */
const producerAuth = (req, res, next) => {
  authenticateJWT(req, res, () => {
    // Vérifier si l'utilisateur est un producteur ou un administrateur
    if (req.user && (req.user.role === 'producer' || req.user.role === 'admin')) {
      next();
    } else {
      res.status(403).json({ message: 'Accès non autorisé: rôle producteur requis' });
    }
  });
};

module.exports = auth;
module.exports.authenticateJWT = authenticateJWT;
module.exports.adminAuth = adminAuth;
module.exports.producerAuth = producerAuth; 