const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { beautyWellnessDb } = require('../index');
const crypto = require('crypto');

// Modèle pour les producteurs wellness
const WellnessProducer = beautyWellnessDb.model(
  'WellnessProducer',
  new mongoose.Schema({}, { strict: false }),
  'WellnessProducers'
);

/**
 * @route POST /api/wellness/auth/register
 * @desc Inscription d'un producteur wellness
 * @access Public
 */
router.post('/register', async (req, res) => {
  try {
    const { 
      name, 
      email, 
      password, 
      phone, 
      address, 
      city, 
      postalCode, 
      category, 
      sousCategory 
    } = req.body;
    
    // Vérification des champs requis
    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Les champs nom, email et mot de passe sont requis'
      });
    }
    
    // Vérifier si l'email existe déjà
    const emailExists = await WellnessProducer.findOne({ email });
    if (emailExists) {
      return res.status(400).json({ 
        success: false,
        message: 'Un compte avec cet email existe déjà'
      });
    }
    
    // Hachage du mot de passe
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Créer un nouvel ID spécifique pour les producteurs wellness
    const producerId = `67b${crypto.randomBytes(10).toString('hex')}`;
    
    // Créer le nouveau producteur
    const newProducer = new WellnessProducer({
      _id: producerId,
      name,
      email,
      password: hashedPassword,
      phone,
      address,
      city,
      postalCode,
      category,
      sousCategory,
      profilePhoto: 'https://via.placeholder.com/150',
      rating: 0,
      services: [],
      created_at: new Date(),
      isVerified: false,
      type: 'wellnessProducer'
    });
    
    await newProducer.save();
    
    // Générer le token JWT
    const token = jwt.sign(
      { id: producerId, email, type: 'wellnessProducer' },
      process.env.JWT_SECRET || 'your_jwt_secret',
      { expiresIn: '30d' }
    );
    
    res.status(201).json({
      success: true,
      message: 'Compte créé avec succès',
      token,
      producer: {
        id: producerId,
        name,
        email,
        category,
        type: 'wellnessProducer'
      }
    });
  } catch (error) {
    console.error('❌ Erreur lors de l\'inscription du producteur wellness:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de l\'inscription', 
      error: error.message 
    });
  }
});

/**
 * @route POST /api/wellness/auth/login
 * @desc Connexion d'un producteur wellness
 * @access Public
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Email et mot de passe requis' 
      });
    }
    
    // Rechercher le producteur
    const producer = await WellnessProducer.findOne({ email });
    
    if (!producer) {
      return res.status(401).json({ 
        success: false,
        message: 'Email ou mot de passe incorrect' 
      });
    }
    
    // Vérifier le mot de passe
    const isMatch = await bcrypt.compare(password, producer.password);
    
    if (!isMatch) {
      return res.status(401).json({ 
        success: false,
        message: 'Email ou mot de passe incorrect' 
      });
    }
    
    // Créer le token JWT
    const token = jwt.sign(
      { id: producer._id, email: producer.email, type: 'wellnessProducer' },
      process.env.JWT_SECRET || 'your_jwt_secret',
      { expiresIn: '7d' }
    );
    
    // Masquer le mot de passe
    const producerInfo = { ...producer.toObject() };
    delete producerInfo.password;
    
    res.status(200).json({
      success: true,
      message: 'Connexion réussie',
      token,
      producer: producerInfo
    });
  } catch (error) {
    console.error('❌ Erreur lors de la connexion du producteur wellness:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la connexion', 
      error: error.message 
    });
  }
});

/**
 * @route GET /api/wellness/auth/profile
 * @desc Récupération du profil d'un producteur wellness
 * @access Private
 */
router.get('/profile', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'Authentification requise' 
      });
    }
    
    // Vérifier le token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
    const producer = await WellnessProducer.findById(decoded.id);
    
    if (!producer) {
      return res.status(404).json({ 
        success: false,
        message: 'Producteur non trouvé' 
      });
    }
    
    // Masquer le mot de passe
    const producerInfo = { ...producer.toObject() };
    delete producerInfo.password;
    
    res.status(200).json({
      success: true,
      producer: producerInfo
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération du profil:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la récupération du profil', 
      error: error.message 
    });
  }
});

/**
 * @route PUT /api/wellness/auth/profile
 * @desc Mise à jour du profil d'un producteur wellness
 * @access Private
 */
router.put('/profile', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'Authentification requise' 
      });
    }
    
    // Vérifier le token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
    
    // Exclure les champs sensibles de la mise à jour
    const { password, _id, ...updateData } = req.body;
    
    const updatedProducer = await WellnessProducer.findByIdAndUpdate(
      decoded.id,
      { $set: updateData },
      { new: true }
    );
    
    if (!updatedProducer) {
      return res.status(404).json({ 
        success: false,
        message: 'Producteur non trouvé' 
      });
    }
    
    // Masquer le mot de passe
    const producerInfo = { ...updatedProducer.toObject() };
    delete producerInfo.password;
    
    res.status(200).json({
      success: true,
      message: 'Profil mis à jour avec succès',
      producer: producerInfo
    });
  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour du profil:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la mise à jour du profil', 
      error: error.message 
    });
  }
});

/**
 * @route PUT /api/wellness/auth/change-password
 * @desc Changement de mot de passe
 * @access Private
 */
router.put('/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'Authentification requise' 
      });
    }
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false,
        message: 'Mot de passe actuel et nouveau mot de passe requis' 
      });
    }
    
    // Vérifier le token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
    
    const producer = await WellnessProducer.findById(decoded.id);
    
    if (!producer) {
      return res.status(404).json({ 
        success: false,
        message: 'Producteur non trouvé' 
      });
    }
    
    // Vérifier l'ancien mot de passe
    const isMatch = await bcrypt.compare(currentPassword, producer.password);
    
    if (!isMatch) {
      return res.status(400).json({ 
        success: false,
        message: 'Mot de passe actuel incorrect' 
      });
    }
    
    // Hasher le nouveau mot de passe
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    // Mettre à jour le mot de passe
    producer.password = hashedPassword;
    await producer.save();
    
    res.status(200).json({
      success: true,
      message: 'Mot de passe mis à jour avec succès'
    });
  } catch (error) {
    console.error('❌ Erreur lors du changement de mot de passe:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors du changement de mot de passe', 
      error: error.message 
    });
  }
});

/**
 * @route POST /api/wellness/auth/claim-account-by-id/:producerId
 * @desc Récupération d'un compte producteur par ID
 * @access Public
 */
router.post('/claim-account-by-id/:producerId', async (req, res) => {
  try {
    const { producerId } = req.params;
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Email et mot de passe requis' 
      });
    }
    
    // Vérifier si le producteur existe
    const producer = await WellnessProducer.findById(producerId);
    
    if (!producer) {
      return res.status(404).json({ 
        success: false,
        message: 'Producteur non trouvé' 
      });
    }
    
    // Hasher le nouveau mot de passe
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Mettre à jour les informations
    producer.email = email;
    producer.password = hashedPassword;
    producer.isVerified = true;
    producer.lastUpdated = new Date();
    
    await producer.save();
    
    // Générer le token JWT
    const token = jwt.sign(
      { id: producerId, email, type: 'wellnessProducer' },
      process.env.JWT_SECRET || 'your_jwt_secret',
      { expiresIn: '7d' }
    );
    
    res.status(200).json({
      success: true,
      message: 'Compte récupéré avec succès',
      token,
      producer: {
        id: producerId,
        name: producer.name,
        email,
        type: 'wellnessProducer'
      }
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération du compte:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la récupération du compte', 
      error: error.message 
    });
  }
});

/**
 * @route GET /api/wellness/auth/check-account-by-id/:producerId
 * @desc Vérifier si un compte producteur peut être récupéré
 * @access Public
 */
router.get('/check-account-by-id/:producerId', async (req, res) => {
  try {
    const { producerId } = req.params;
    
    // Vérifier si le producteur existe
    const producer = await WellnessProducer.findById(producerId);
    
    if (!producer) {
      return res.status(200).json({ 
        exists: false,
        canBeReclaimed: false,
        message: 'Producteur non trouvé' 
      });
    }
    
    // Vérifier si le compte peut être récupéré (pas déjà vérifié ou email manquant)
    const canBeReclaimed = !producer.isVerified || !producer.email;
    
    res.status(200).json({
      exists: true,
      canBeReclaimed: canBeReclaimed,
      message: canBeReclaimed 
        ? 'Ce compte peut être récupéré' 
        : 'Ce compte est déjà vérifié et possède un email'
    });
  } catch (error) {
    console.error('❌ Erreur lors de la vérification du compte:', error);
    res.status(500).json({ 
      success: false,
      exists: false,
      canBeReclaimed: false,
      message: 'Erreur lors de la vérification du compte', 
      error: error.message 
    });
  }
});

/**
 * @route POST /api/wellness/auth/claim-account-by-email
 * @desc Récupérer un compte producteur avec l'email spécifié
 * @access Public
 */
router.post('/claim-account-by-email', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Valider les données requises
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email et mot de passe requis' 
      });
    }
    
    // Vérifier si un producteur existe avec cet email
    const producer = await WellnessProducer.findOne({ email: email.toLowerCase() });
    
    if (!producer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Aucun compte trouvé avec cet email' 
      });
    }
    
    // Hasher le nouveau mot de passe
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Mettre à jour le producteur avec le nouveau mot de passe et le marquer comme vérifié
    producer.password = hashedPassword;
    producer.isVerified = true;
    producer.verifiedAt = new Date();
    
    await producer.save();
    
    // Générer JWT
    const payload = {
      id: producer._id,
      email: producer.email,
      type: 'producer',
      producerType: 'wellness'
    };
    
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
    
    res.status(200).json({
      success: true,
      token: token,
      producer: {
        id: producer._id,
        email: producer.email,
        businessName: producer.businessName,
        isVerified: producer.isVerified
      },
      message: 'Compte récupéré avec succès'
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération du compte par email:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur lors de la récupération du compte', 
      error: error.message 
    });
  }
});

/**
 * @route GET /api/wellness/auth/check-account-by-email/:email
 * @desc Vérifier si un compte producteur existe avec l'email spécifié
 * @access Public
 */
router.get('/check-account-by-email/:email', async (req, res) => {
  try {
    const { email } = req.params;
    
    // Vérifier si un producteur existe avec cet email
    const producer = await WellnessProducer.findOne({ email: email.toLowerCase() });
    
    if (!producer) {
      return res.status(200).json({ 
        exists: false,
        canBeReclaimed: false,
        message: 'Aucun compte trouvé avec cet email' 
      });
    }
    
    // Vérifier si le compte peut être récupéré
    const canBeReclaimed = !producer.isVerified;
    
    res.status(200).json({
      exists: true,
      producerId: producer._id,
      canBeReclaimed: canBeReclaimed,
      message: canBeReclaimed 
        ? 'Ce compte peut être récupéré' 
        : 'Ce compte est déjà vérifié'
    });
  } catch (error) {
    console.error('❌ Erreur lors de la vérification du compte par email:', error);
    res.status(500).json({ 
      success: false,
      exists: false,
      canBeReclaimed: false,
      message: 'Erreur lors de la vérification du compte', 
      error: error.message 
    });
  }
});

module.exports = router; 