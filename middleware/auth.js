const jwt = require('jsonwebtoken');

/**
 * Middleware d'authentification
 * Vérifie que le token JWT fourni dans l'en-tête 'Authorization' est valide
 */
const auth = async (req, res, next) => {
  try {
    // Récupérer le token de l'en-tête Authorization
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Authentification requise' });
    }
    
    // Vérifier le token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
    
    // Ajouter les données utilisateur à l'objet req
    req.user = { id: decoded.id };
    
    next();
  } catch (error) {
    console.error('Erreur d\'authentification:', error);
    res.status(401).json({ error: 'Token invalide ou expiré' });
  }
};

/**
 * Middleware pour vérifier si l'utilisateur est administrateur
 */
const adminAuth = (req, res, next) => {
  auth(req, res, () => {
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
  auth(req, res, () => {
    // Vérifier si l'utilisateur est un producteur ou un administrateur
    if (req.user && (req.user.role === 'producer' || req.user.role === 'admin')) {
      next();
    } else {
      res.status(403).json({ message: 'Accès non autorisé: rôle producteur requis' });
    }
  });
};

module.exports = auth;
module.exports.adminAuth = adminAuth;
module.exports.producerAuth = producerAuth; 