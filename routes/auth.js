const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const { sendPasswordResetEmail } = require('../services/emailService');
const crypto = require('crypto');
const authMiddleware = require('../middleware/auth'); // Import the authentication middleware

// Import database connections (adjust paths if necessary)
const { choiceAppDb, restaurationDb, loisirsDb, beautyWellnessDb } = require('../index');

// Import the model definition FUNCTIONS
const createProducerModel = require('../models/Producer'); 
const createLeisureProducerModel = require('../models/leisureProducer');
const createWellnessPlaceModel = require('../models/WellnessPlace'); 

// Compile models using the respective connections (if available)
const Producer = restaurationDb ? createProducerModel(restaurationDb) : null;
const LeisureProducer = loisirsDb ? createLeisureProducerModel(loisirsDb) : null;
const WellnessPlace = beautyWellnessDb ? createWellnessPlaceModel(beautyWellnessDb) : null;

// Modèles User/ResetToken (initialisés via la fonction initialize)
let UserModel;
let ResetToken;

// Schémas pour les modèles
const resetTokenSchema = new mongoose.Schema({
  userId: String,
  token: String,
  expires: Date,
});

// Initialisation des modèles
const initializeModels = (db) => {
  if (!db || !db.choiceAppDb) return;
  
  UserModel = db.choiceAppDb.model(
    'User',
    new mongoose.Schema({}, { strict: false }),
    'Users'
  );
  
  ResetToken = db.choiceAppDb.model(
    'ResetToken',
    resetTokenSchema,
    'reset_tokens'
  );
};

// Essayer d'initialiser immédiatement si global.db existe
try {
  if (global.db && global.db.choiceAppDb) {
    initializeModels(global.db);
  }
} catch (error) {
  console.warn('⚠️ Auth models initialization deferred: ' + error.message);
}

// Middleware d'authentification
// const auth = async (req, res, next) => { ... };

/**
 * @route POST /api/auth/login
 * @desc Connexion utilisateur
 * @access Public
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: 'Email et mot de passe requis.' });
    }
    
    const user = await UserModel.findOne({ email });
    
    if (!user) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect.' });
    }
    
    // Vérification du mot de passe
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect.' });
    }
    
    // Créer le token JWT
    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET || 'default_jwt_secret',
      { expiresIn: '7d' }
    );
    
    // Masquer le mot de passe dans la réponse
    const userResponse = { ...user.toObject() };
    delete userResponse.password;
    
    res.status(200).json({
      message: 'Connexion réussie.',
      token,
      user: userResponse,
      userId: user._id.toString(),
      accountType: user.accountType || 'user'
    });
  } catch (error) {
    console.error('❌ Erreur de connexion :', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route POST /api/auth/register
 * @desc Inscription utilisateur
 * @access Public
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, username, password } = req.body;
    
    // Vérification des champs requis
    if (!name || !email || !username || !password) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }
    
    // Vérifier si l'email existe déjà
    const emailExists = await UserModel.findOne({ email });
    if (emailExists) {
      return res.status(400).json({ error: 'Email déjà utilisé' });
    }
    
    // Vérifier si le nom d'utilisateur existe déjà
    const usernameExists = await UserModel.findOne({ username });
    if (usernameExists) {
      return res.status(400).json({ error: 'Nom d\'utilisateur déjà utilisé' });
    }
    
    // Hashage du mot de passe
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Création de l'utilisateur
    const newUser = new UserModel({
      name,
      email,
      username,
      password: hashedPassword,
      created_at: new Date(),
      last_login: new Date(),
      isOnline: true
    });
    
    const savedUser = await newUser.save();
    
    // Génération du token JWT
    const token = jwt.sign(
      { id: savedUser._id },
      process.env.JWT_SECRET || 'your_jwt_secret',
      { expiresIn: '30d' }
    );
    
    // Ne pas envoyer le mot de passe dans la réponse
    const userResponse = {
      _id: savedUser._id,
      name: savedUser.name,
      email: savedUser.email,
      username: savedUser.username,
      profilePicture: savedUser.profilePicture,
      created_at: savedUser.created_at
    };
    
    res.status(201).json({
      user: userResponse,
      token
    });
  } catch (error) {
    console.error('Erreur d\'inscription:', error);
    res.status(500).json({ error: 'Erreur lors de l\'inscription' });
  }
});

/**
 * @route POST /api/auth/reset-password
 * @desc Demande de réinitialisation de mot de passe
 * @access Public
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email requis.' });
    }
    
    const user = await UserModel.findOne({ email });
    
    if (!user) {
      // Pour des raisons de sécurité, ne pas indiquer que l'email n'existe pas
      return res.status(200).json({ message: 'Si cet email existe, vous recevrez un lien de réinitialisation.' });
    }
    
    // Générer un token unique
    const token = crypto.randomBytes(32).toString('hex');
    
    // Enregistrer le token avec une durée de validité de 1 heure
    await ResetToken.findOneAndDelete({ userId: user._id });
    await new ResetToken({
      userId: user._id,
      token,
      expires: Date.now() + 3600000 // 1 heure
    }).save();
    
    // URL du frontend pour réinitialisation
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
    
    // Envoyer l'email
    await sendPasswordResetEmail(user.email, resetUrl, user.name);
    
    res.status(200).json({ message: 'Si cet email existe, vous recevrez un lien de réinitialisation.' });
  } catch (error) {
    console.error('❌ Erreur de demande de réinitialisation :', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route POST /api/auth/verify-reset-token
 * @desc Vérifier le token de réinitialisation de mot de passe
 * @access Public
 */
router.post('/verify-reset-token', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ message: 'Token requis.' });
    }
    
    const resetToken = await ResetToken.findOne({
      token,
      expires: { $gt: Date.now() }
    });
    
    if (!resetToken) {
      return res.status(400).json({ message: 'Token invalide ou expiré.' });
    }
    
    res.status(200).json({ message: 'Token valide.', userId: resetToken.userId });
  } catch (error) {
    console.error('❌ Erreur de vérification de token :', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route POST /api/auth/set-new-password
 * @desc Définir un nouveau mot de passe après réinitialisation
 * @access Public
 */
router.post('/set-new-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    
    if (!token || !password) {
      return res.status(400).json({ message: 'Token et mot de passe requis.' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 6 caractères.' });
    }
    
    const resetToken = await ResetToken.findOne({
      token,
      expires: { $gt: Date.now() }
    });
    
    if (!resetToken) {
      return res.status(400).json({ message: 'Token invalide ou expiré.' });
    }
    
    const user = await UserModel.findById(resetToken.userId);
    
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    }
    
    // Hachage du nouveau mot de passe
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Mise à jour du mot de passe
    user.password = hashedPassword;
    user.lastPasswordChange = new Date();
    
    // Suppression de tous les tokens de réinitialisation pour cet utilisateur
    await ResetToken.deleteMany({ userId: user._id });
    
    // Enregistrement des modifications
    await user.save();
    
    res.status(200).json({ message: 'Mot de passe mis à jour avec succès.' });
  } catch (error) {
    console.error('❌ Erreur de changement de mot de passe :', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route GET /api/auth/verify-email/:token
 * @desc Vérifier l'email d'un utilisateur
 * @access Public
 */
router.get('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    // Logique pour vérifier le token de l'email
    // ...
    
    // Rediriger vers le frontend avec un message de succès
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/email-verified`);
  } catch (error) {
    console.error('❌ Erreur de vérification d\'email :', error);
    res.status(500).send('Erreur lors de la vérification de l\'email.');
  }
});

// POST /api/auth/logout - Déconnexion
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    // Mettre à jour le statut en ligne de l'utilisateur
    await UserModel.findByIdAndUpdate(req.user.id, { isOnline: false });
    
    res.status(200).json({ message: 'Déconnexion réussie' });
  } catch (error) {
    console.error('Erreur de déconnexion:', error);
    res.status(500).json({ error: 'Erreur lors de la déconnexion' });
  }
});

// GET /api/auth/me - Obtenir l'utilisateur actuel
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await UserModel.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    res.status(200).json({ user });
  } catch (error) {
    console.error('Erreur de récupération du profil:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du profil' });
  }
});

// POST /api/auth/check-token - Vérifier la validité du token
router.post('/check-token', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ valid: false, error: 'Token non fourni' });
    }
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
      const user = await UserModel.findById(decoded.id).select('-password');
      
      if (!user) {
        return res.status(200).json({ valid: false, error: 'Utilisateur non trouvé' });
      }
      
      res.status(200).json({ valid: true, user });
    } catch (err) {
      res.status(200).json({ valid: false, error: 'Token invalide ou expiré' });
    }
  } catch (error) {
    console.error('Erreur de vérification du token:', error);
    res.status(500).json({ valid: false, error: 'Erreur serveur' });
  }
});

// POST /api/auth/reset-password-request - Demande de réinitialisation de mot de passe
router.post('/reset-password-request', async (req, res) => {
  try {
    const { email } = req.body;
    
    const user = await UserModel.findOne({ email });
    
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    // Génération d'un token pour la réinitialisation
    const resetToken = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET || 'your_jwt_secret',
      { expiresIn: '1h' }
    );
    
    // Stockage du token et de son expiration
    user.reset_password_token = resetToken;
    user.reset_password_expires = Date.now() + 3600000; // 1 heure
    await user.save();
    
    // Envoi d'un email (à implémenter selon vos besoins)
    // sendPasswordResetEmail(user.email, resetToken);
    
    res.status(200).json({ message: 'Instructions de réinitialisation envoyées par email' });
  } catch (error) {
    console.error('Erreur de demande de réinitialisation:', error);
    res.status(500).json({ error: 'Erreur lors de la demande de réinitialisation' });
  }
});

/**
 * @route POST /api/auth/reset-password - Réinitialisation du mot de passe
 * @desc Réinitialise le mot de passe en utilisant un token
 * @access Public
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    
    // Vérifier si le token existe et n'a pas expiré
    const user = await UserModel.findOne({
      reset_password_token: token,
      reset_password_expires: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({ error: 'Token invalide ou expiré' });
    }
    
    // Hashage du nouveau mot de passe
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Mise à jour du mot de passe et réinitialisation du token
    user.password = hashedPassword;
    user.reset_password_token = undefined;
    user.reset_password_expires = undefined;
    await user.save();
    
    res.status(200).json({ message: 'Mot de passe réinitialisé avec succès' });
  } catch (error) {
    console.error('Erreur de réinitialisation du mot de passe:', error);
    res.status(500).json({ error: 'Erreur lors de la réinitialisation du mot de passe' });
  }
});

/**
 * @route GET /api/auth/validate
 * @desc Valide le token d'authentification actuel
 * @access Private (requires valid token)
 */
router.get('/validate', authMiddleware, (req, res) => {
  // If the middleware passes, the token is valid.
  // req.user is populated by the authMiddleware and contains payload (id, accountType etc)
  res.status(200).json({ message: 'Token is valid', user: req.user }); // Return the whole user payload
});

/**
 * @route POST /api/auth/login-with-id
 * @desc Connexion pour un producteur via son ID
 * @access Public
 */
router.post('/login-with-id', async (req, res) => {
  try {
    const { producerId } = req.body;

    if (!producerId) {
      return res.status(400).json({ message: 'Producer ID requis.' });
    }

    // Find the producer and determine their standardized type
    // Uses the helper function defined earlier in this file
    const result = await findProducerById(producerId);

    if (!result || !result.producer) {
      return res.status(404).json({ message: 'Producteur non trouvé.' });
    }

    const producer = result.producer; // Mongoose document
    const accountType = result.producerType; // Standardized type ('RestaurantProducer', etc.)

    // Create JWT token including the standardized account type
    const token = jwt.sign(
      { 
        id: producer._id, 
        accountType: accountType // Include the correct type in the token payload
      },
      process.env.JWT_SECRET || 'default_jwt_secret', // Use the same secret as user login
      { expiresIn: '7d' } // Adjust expiration as needed
    );

    // Prepare response
    const responsePayload = {
      message: 'Connexion producteur réussie.',
      token,
      userId: producer._id.toString(),
      accountType: accountType,
      user: { 
          _id: producer._id.toString(),
          accountType: accountType,
          name: producer.name || producer.lieu || 'Producer'
      }
    };

    res.status(200).json(responsePayload);

  } catch (error) {
    console.error('❌ Erreur de connexion producteur par ID :', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// Exporter le router
module.exports = router;
module.exports.initialize = function(db) {
  if (db && db.choiceAppDb) {
    initializeModels(db);
    console.log('✅ Auth models initialized');
  }
  return router;
};

// --- Helper Function uses the compiled models ---
async function findProducerById(producerId) {
  if (!mongoose.Types.ObjectId.isValid(producerId)) {
    return null;
  }
  
  let producer = null;
  let producerType = null; 

  try {
      // Use the compiled models obtained above
      if (Producer) { // Check if model was compiled successfully
        const found = await Producer.findById(producerId).select('_id name'); 
        if (found) {
            producer = found;
            producerType = 'RestaurantProducer'; 
        } 
      }
      if (!producer && LeisureProducer) {
        const found = await LeisureProducer.findById(producerId).select('_id name');
        if (found) {
            producer = found;
            producerType = 'LeisureProducer';
        } 
      }
      if (!producer && WellnessPlace) {
        const found = await WellnessPlace.findById(producerId).select('_id name'); 
        if (found) {
            producer = found;
            producerType = 'WellnessProducer';
        } 
      }
  } catch (dbError) {
      console.error(`Database error finding producer ${producerId}:`, dbError);
      return null; 
  }
  
  if (!producer) return null;

  return { producer, producerType }; 
}
// --- End Helper Function --- 