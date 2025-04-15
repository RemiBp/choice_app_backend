const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const { choiceAppDb } = require('../index');

// Schéma pour les badges
const badgeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  category: { type: String, required: true },
  image: { type: String },
  criteria: { type: Map, of: mongoose.Schema.Types.Mixed },
  points: { type: Number, default: 10 },
  rarity: { 
    type: String, 
    enum: ['common', 'uncommon', 'rare', 'epic', 'legendary'],
    default: 'common'
  },
  createdAt: { type: Date, default: Date.now }
});

// Schéma pour les badges des utilisateurs
const userBadgeSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  badges: [{
    badgeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Badge' },
    earnedAt: { type: Date, default: Date.now },
    progress: { type: Number, default: 100 },
    isCompleted: { type: Boolean, default: true },
    isNew: { type: Boolean, default: true }
  }],
  actions: [{
    type: { type: String, required: true },
    count: { type: Number, default: 1 },
    lastPerformed: { type: Date, default: Date.now }
  }]
});

// Création ou récupération des modèles
let Badge, UserBadge;
try {
  Badge = choiceAppDb.model('Badge');
  UserBadge = choiceAppDb.model('UserBadge');
} catch (error) {
  Badge = choiceAppDb.model('Badge', badgeSchema);
  UserBadge = choiceAppDb.model('UserBadge', userBadgeSchema);
}

/**
 * @route GET /api/users/:userId/badges
 * @desc Récupérer tous les badges d'un utilisateur
 * @access Private
 */
router.get('/users/:userId/badges', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Vérifier que l'utilisateur peut accéder à ces badges
    if (req.user.id !== userId && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }
    
    // Trouver les badges de l'utilisateur
    let userBadges = await UserBadge.findOne({ userId }).lean();
    
    if (!userBadges) {
      // Si l'utilisateur n'a pas encore de badges, créer un document vide
      userBadges = { userId, badges: [], actions: [] };
      await UserBadge.create(userBadges);
    }
    
    // Récupérer les détails complets des badges
    const badgeIds = userBadges.badges.map(badge => badge.badgeId);
    const badgeDetails = await Badge.find({ _id: { $in: badgeIds } }).lean();
    
    // Fusionner les informations
    const badgesWithDetails = userBadges.badges.map(userBadge => {
      const details = badgeDetails.find(b => b._id.toString() === userBadge.badgeId.toString());
      return {
        ...details,
        earnedAt: userBadge.earnedAt,
        progress: userBadge.progress,
        isCompleted: userBadge.isCompleted,
        isNew: userBadge.isNew
      };
    });
    
    res.status(200).json(badgesWithDetails);
  } catch (error) {
    console.error('Erreur lors de la récupération des badges:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route GET /api/users/:userId/actions
 * @desc Récupérer toutes les actions d'un utilisateur
 * @access Private
 */
router.get('/users/:userId/actions', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Vérifier que l'utilisateur peut accéder à ces actions
    if (req.user.id !== userId && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }
    
    // Trouver les actions de l'utilisateur
    const userBadges = await UserBadge.findOne({ userId }).lean();
    
    if (!userBadges) {
      return res.status(200).json([]);
    }
    
    res.status(200).json(userBadges.actions || []);
  } catch (error) {
    console.error('Erreur lors de la récupération des actions:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route POST /api/users/:userId/badges/check
 * @desc Vérifier si l'utilisateur a débloqué de nouveaux badges
 * @access Private
 */
router.post('/users/:userId/badges/check', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { actionType } = req.body;
    
    // Vérifier que l'utilisateur peut effectuer cette action
    if (req.user.id !== userId && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }
    
    if (!actionType) {
      return res.status(400).json({ message: 'Type d\'action requis' });
    }
    
    // Trouver ou créer le document de badges de l'utilisateur
    let userBadges = await UserBadge.findOne({ userId });
    
    if (!userBadges) {
      userBadges = new UserBadge({
        userId,
        badges: [],
        actions: []
      });
    }
    
    // Mettre à jour le compteur d'actions
    const actionIndex = userBadges.actions.findIndex(a => a.type === actionType);
    
    if (actionIndex >= 0) {
      userBadges.actions[actionIndex].count += 1;
      userBadges.actions[actionIndex].lastPerformed = new Date();
    } else {
      userBadges.actions.push({
        type: actionType,
        count: 1,
        lastPerformed: new Date()
      });
    }
    
    await userBadges.save();
    
    // Trouver les badges que l'utilisateur pourrait débloquer avec cette action
    const eligibleBadges = await Badge.find({
      [`criteria.${actionType}`]: { $exists: true }
    }).lean();
    
    // Vérifier chaque badge éligible
    const newBadges = [];
    
    for (const badge of eligibleBadges) {
      // Vérifier si l'utilisateur a déjà ce badge
      const hasBadge = userBadges.badges.some(b => 
        b.badgeId.toString() === badge._id.toString() && b.isCompleted
      );
      
      if (!hasBadge) {
        // Vérifier si l'utilisateur a atteint les critères
        const actionCount = userBadges.actions.find(a => a.type === actionType)?.count || 0;
        const requiredCount = badge.criteria.get(actionType);
        
        if (actionCount >= requiredCount) {
          // L'utilisateur a débloqué ce badge
          userBadges.badges.push({
            badgeId: badge._id,
            earnedAt: new Date(),
            progress: 100,
            isCompleted: true,
            isNew: true
          });
          
          newBadges.push({
            ...badge,
            earnedAt: new Date(),
            isNew: true
          });
        }
      }
    }
    
    await userBadges.save();
    
    res.status(200).json({
      newBadges,
      actionsUpdated: [actionType]
    });
  } catch (error) {
    console.error('Erreur lors de la vérification des badges:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route PUT /api/users/:userId/badges/:badgeId
 * @desc Mettre à jour le statut d'un badge (marquer comme vu)
 * @access Private
 */
router.put('/users/:userId/badges/:badgeId', auth, async (req, res) => {
  try {
    const { userId, badgeId } = req.params;
    const { isNew } = req.body;
    
    // Vérifier que l'utilisateur peut modifier ce badge
    if (req.user.id !== userId && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }
    
    // Trouver le document de badges de l'utilisateur
    const userBadges = await UserBadge.findOne({ userId });
    
    if (!userBadges) {
      return res.status(404).json({ message: 'Aucun badge trouvé pour cet utilisateur' });
    }
    
    // Trouver le badge spécifique
    const badgeIndex = userBadges.badges.findIndex(b => b.badgeId.toString() === badgeId);
    
    if (badgeIndex === -1) {
      return res.status(404).json({ message: 'Badge non trouvé' });
    }
    
    // Mettre à jour le statut
    if (isNew !== undefined) {
      userBadges.badges[badgeIndex].isNew = isNew;
    }
    
    await userBadges.save();
    
    res.status(200).json({
      message: 'Badge mis à jour avec succès',
      badge: userBadges.badges[badgeIndex]
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du badge:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

module.exports = router; 