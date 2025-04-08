const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const { choiceAppDb } = require('../index');
const { sendPasswordResetEmail } = require('../services/emailService');
const crypto = require('crypto');
const User = require('../models/User');

// Modèle pour la collection users
const UserModel = choiceAppDb.model(
  'User',
  new mongoose.Schema({}, { strict: false }),
  'Users'
);

// Collection pour stockage des tokens de réinitialisation
const ResetToken = choiceAppDb.model(
  'ResetToken',
  new mongoose.Schema({
    userId: String,
    token: String,
    expires: Date,
  }),
  'reset_tokens'
);

// Middleware d'authentification
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Authentification requise' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
    req.user = { id: decoded.id };
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token invalide' });
  }
};

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
 * @route POST /api/auth/confirm-reset
 * @desc Confirmer la réinitialisation du mot de passe
 * @access Public
 */
router.post('/confirm-reset', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Token et nouveau mot de passe requis.' });
    }
    
    // Vérifier si le token existe et n'est pas expiré
    const resetToken = await ResetToken.findOne({
      token,
      expires: { $gt: Date.now() }
    });
    
    if (!resetToken) {
      return res.status(400).json({ message: 'Token invalide ou expiré.' });
    }
    
    // Trouver l'utilisateur
    const user = await UserModel.findById(resetToken.userId);
    
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    }
    
    // Hash du nouveau mot de passe
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    // Mettre à jour le mot de passe
    user.password = hashedPassword;
    await user.save();
    
    // Supprimer le token
    await ResetToken.findByIdAndDelete(resetToken._id);
    
    res.status(200).json({ message: 'Mot de passe réinitialisé avec succès.' });
  } catch (error) {
    console.error('❌ Erreur de réinitialisation :', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route POST /api/auth/validate-token
 * @desc Valider un token JWT
 * @access Public
 */
router.post('/validate-token', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ valid: false, message: 'Token requis.' });
    }
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_jwt_secret');
      
      // Vérifier si l'utilisateur existe toujours
      const user = await UserModel.findById(decoded.id);
      
      if (!user) {
        return res.status(404).json({ valid: false, message: 'Utilisateur non trouvé.' });
      }
      
      res.status(200).json({
        valid: true,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          accountType: user.accountType || 'user'
        }
      });
    } catch (error) {
      return res.status(401).json({ valid: false, message: 'Token invalide ou expiré.' });
    }
  } catch (error) {
    console.error('❌ Erreur de validation de token :', error);
    res.status(500).json({ valid: false, message: 'Erreur interne du serveur.' });
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
router.post('/logout', auth, async (req, res) => {
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
router.get('/me', auth, async (req, res) => {
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

// POST /api/auth/reset-password - Réinitialisation du mot de passe
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
 * @route POST /api/auth/google/token
 * @desc Authentification avec token Google
 * @access Public
 */
router.post('/google/token', async (req, res) => {
  try {
    const { idToken, email, name, photoUrl } = req.body;
    
    if (!idToken || !email) {
      return res.status(400).json({ 
        success: false,
        message: 'Token ID Google et email requis' 
      });
    }
    
    // Vérifier si un utilisateur avec cet email existe déjà
    let user = await User.findOne({ email });
    
    // Si l'utilisateur n'existe pas, le créer
    if (!user) {
      user = new User({
        email,
        username: name || email.split('@')[0],
        profilePicture: photoUrl || '',
        googleId: idToken.sub || 'google-user',
        authProvider: 'google',
        accountVerified: true,  // Les comptes Google sont pré-vérifiés
        lastLogin: new Date(),
        registeredAt: new Date(),
      });
      
      await user.save();
      console.log(`✅ Nouvel utilisateur Google créé: ${email}`);
    } else {
      // Mettre à jour les infos utilisateur avec les dernières données Google
      user.profilePicture = photoUrl || user.profilePicture;
      user.username = user.username || name || email.split('@')[0];
      user.googleId = idToken.sub || 'google-user';
      user.authProvider = 'google';
      user.accountVerified = true;
      user.lastLogin = new Date();
      
      await user.save();
      console.log(`✅ Utilisateur Google existant mis à jour: ${email}`);
    }
    
    // Générer le token JWT
    const token = jwt.sign(
      { id: user._id, email: user.email, type: 'user' },
      process.env.JWT_SECRET || 'your_jwt_secret',
      { expiresIn: '30d' }
    );
    
    // Déterminer si l'onboarding est nécessaire
    const needsOnboarding = !user.onboardingCompleted;
    
    res.status(200).json({
      success: true,
      message: 'Connexion Google réussie',
      token,
      userId: user._id,
      accountType: 'user',
      needsOnboarding,
    });
  } catch (error) {
    console.error('❌ Erreur lors de l\'authentification Google:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de l\'authentification Google', 
      error: error.message 
    });
  }
});

module.exports = router; 