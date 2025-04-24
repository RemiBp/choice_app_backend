const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const { sendPasswordResetEmail } = require('../services/emailService');
const crypto = require('crypto');
const authMiddleware = require('../middleware/auth'); // Import the authentication middleware
const { OAuth2Client } = require('google-auth-library'); // Added for Google Sign-In

// Added: Google Client ID (should match the one used in frontend for backend verification - usually Web client ID)
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '429425452401-dibk2q2t0tlgpa2gpj2n2o8439qosdal.apps.googleusercontent.com';
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

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
      process.env.JWT_SECRET || 'default_jwt_secret',
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
 * @route POST /api/auth/google/token
 * @desc Authentification ou Inscription via Google Token ID
 * @access Public
 */
router.post('/google/token', async (req, res) => {
  const { idToken, email: googleEmail, name: googleName, photoUrl: googlePhotoUrl } = req.body;

  if (!idToken) {
    return res.status(400).json({ message: 'Google ID token manquant.' });
  }

  try {
    // 1. Verify the ID token using google-auth-library
    const ticket = await client.verifyIdToken({
        idToken: idToken,
        audience: GOOGLE_CLIENT_ID, 
    });
    const payload = ticket.getPayload();
    const googleId = payload['sub']; // Google's unique user ID
    const email = payload['email'];
    const name = payload['name'];
    const picture = payload['picture']; // Google profile picture URL

    if (!googleId || !email) {
      return res.status(400).json({ message: 'Impossible de vérifier le token Google ou informations manquantes.' });
    }

    // 2. Find user by Google ID
    let user = await UserModel.findOne({ googleId: googleId });

    if (!user) {
      // 3. If not found by Google ID, find by email
      user = await UserModel.findOne({ email: email });

      if (user) {
        // 3a. User exists with this email but not linked to Google -> Link account
        console.log(`Linking Google ID ${googleId} to existing user ${user._id} with email ${email}`);
        user.googleId = googleId;
        // Optionnel: Mettre à jour le nom ou la photo si l'utilisateur n'en a pas déjà
        if (!user.name) user.name = name;
        if (!user.profilePicture) user.profilePicture = picture;
        await user.save();
      } else {
        // 3b. User does not exist -> Create new user
        console.log(`Creating new user with Google ID ${googleId} and email ${email}`);
        
        // Générer un nom d'utilisateur unique basé sur l'email ou le nom
        let baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
        let potentialUsername = baseUsername;
        let counter = 1;
        while (await UserModel.findOne({ username: potentialUsername })) {
          potentialUsername = `${baseUsername}${counter}`;
          counter++;
        }
        
        user = new UserModel({
          googleId: googleId,
          email: email,
          username: potentialUsername, // Use the generated unique username
          name: name || googleName || email.split('@')[0], // Use Google name, fallback to provided name or email part
          profilePicture: picture || googlePhotoUrl, // Use Google picture, fallback to provided URL
          // Pas de mot de passe nécessaire pour l'authentification Google
          password: null, // Explicitly set to null or handle schema requirement
          created_at: new Date(),
          last_login: new Date(),
          accountType: 'user', // Default account type
          isOnline: true,
          needsOnboarding: true // Assume new users need onboarding
        });
        await user.save();
      }
    }

    // 4. User found or created - Generate JWT
    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET || 'default_jwt_secret',
      { expiresIn: '7d' } // Use same expiration as regular login
    );

    // 5. Determine if onboarding is needed
    const needsOnboarding = !user.onboardingCompleted; // Ou une logique plus complexe si nécessaire

    // Masquer le mot de passe dans la réponse (même s'il est null)
    const userResponse = { ...user.toObject() };
    delete userResponse.password;
    
    console.log(`✅ Google Sign-In successful for user: ${user.email} (ID: ${user._id})`);

    res.status(200).json({
      message: 'Connexion Google réussie.',
      token,
      userId: user._id.toString(),
      accountType: user.accountType || 'user',
      needsOnboarding: needsOnboarding,
      user: userResponse // Optional: include user details if needed by frontend immediately
    });

  } catch (error) {
    console.error('❌ Google Auth Error:', error);
    // Distinguish token verification errors from server errors
    if (error.message && (error.message.includes('Invalid token signature') || error.message.includes('Token used too late') || error.message.includes('Wrong recipient'))) {
        // Specific error for invalid token
        return res.status(401).json({ message: 'Invalid or expired Google token.' });
    }
    // Generic server error for other issues
    res.status(500).json({ message: 'Internal server error during Google authentication.' });
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
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_jwt_secret');
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
      process.env.JWT_SECRET || 'default_jwt_secret',
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

// Refactored Helper function to find producer by checking collections sequentially
async function findProducerById(producerId) {
  if (!producerId || !mongoose.Types.ObjectId.isValid(producerId)) {
      console.warn(`⚠️ Invalid or missing Producer ID format: ${producerId}`);
      return null;
  }

  let producer = null;
  let accountType = null;
  let dbName = null;
  const objectId = new mongoose.Types.ObjectId(producerId);

  try {
    // 1. Check Restaurant Producers
    if (Producer) {
      producer = await Producer.findById(objectId).lean();
      if (producer) {
        dbName = 'restaurationDb';
        accountType = 'RestaurantProducer';
      }
    }

    // 2. Check Leisure Producers (only if not found above)
    if (!producer && LeisureProducer) {
      producer = await LeisureProducer.findById(objectId).lean();
      if (producer) {
        dbName = 'loisirsDb';
        accountType = 'LeisureProducer';
      }
    }

    // 3. Check Wellness Places (only if not found above)
    if (!producer && WellnessPlace) {
      producer = await WellnessPlace.findById(objectId).lean();
      if (producer) {
        dbName = 'beautyWellnessDb';
        accountType = 'WellnessProducer';
      }
    }

    // 4. Process result
    if (producer) {
      console.log(`✅ Producer ${producerId} found in ${dbName}`);
      // Standardize common fields for the response
      const producerInfo = {
        _id: producer._id,
        accountType: accountType,
        // Add more robust name finding across potential fields
        name: producer.name || producer.businessName || producer.intitulé || producer.établissement || producer.lieu || 'N/A',
        email: producer.email, // Assuming email exists
        // Add more robust picture finding across potential fields
        profilePicture: producer.image || producer.photo || producer.photo_url || producer.avatar || producer.logoUrl || '', 
        // Add any other essential common fields if needed
      };
      return producerInfo;
    } else {
      console.log(`❌ Producer ${producerId} not found in any producer collection.`);
      return null;
    }

  } catch (error) {
     // Catch any unexpected DB errors during the search
     console.error(`❌ Error finding producer ${producerId} across collections:`, error);
     return null;
  }
}

/**
 * @route POST /api/auth/login-with-id
 * @desc Connexion Producteur via ID (pour récupération de compte)
 * @access Public
 */
router.post('/login-with-id', async (req, res) => {
  const { producerId } = req.body;

  if (!producerId) {
    return res.status(400).json({ message: 'Producer ID manquant.' });
  }

  // Ensure models are initialized
  if (!Producer || !LeisureProducer || !WellnessPlace) {
     console.error('❌ Producer models not initialized for login-with-id');
     return res.status(500).json({ message: 'Erreur serveur: Modèles non initialisés.' });
  }

  try {
    // Use the helper function to find the producer
    const producerInfo = await findProducerById(producerId);

    if (!producerInfo) {
      // Return 404 specifically if the producer ID is not found in any collection
      return res.status(404).json({ message: 'Identifiant producteur introuvable.' });
    }

    // Producer found, generate JWT
    const token = jwt.sign(
      { 
        id: producerInfo._id, // Use the producer's ID
        accountType: producerInfo.accountType // Include account type
        // Add email if available and needed in token: email: producerInfo.email 
      },
      process.env.JWT_SECRET || 'default_jwt_secret', 
      { expiresIn: '7d' } // Adjust expiration as needed
    );

    console.log(`🔑 JWT généré pour ${producerInfo.accountType} ID: ${producerInfo._id}`);

    // Return success response
    res.status(200).json({
      success: true, // Added success flag for frontend check
      message: 'Connexion réussie via ID.',
      token,
      userId: producerInfo._id.toString(), // Consistent naming with user login
      accountType: producerInfo.accountType,
      // Optionally include basic producer info if needed by frontend immediately after login
      producer: {
         _id: producerInfo._id,
         name: producerInfo.name,
         profilePicture: producerInfo.profilePicture
      } 
    });

  } catch (error) {
    console.error(`❌ Erreur lors de la connexion via ID (${producerId}):`, error);
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