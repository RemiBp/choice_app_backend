const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { createModel, databases } = require('../utils/modelCreator');

// Modèles
const Post = createModel(
  databases.CHOICE_APP,
  'Post',
  'Posts'
);

const User = createModel(
  databases.CHOICE_APP,
  'User',
  'Users'
);

// Middleware d'authentification (placeholder - à remplacer par votre middleware réel)
const authenticate = (req, res, next) => {
  // Implémentation de l'authentification
  next();
};

/**
 * Obtenir les stats de croissance générales
 * @route GET /api/growth-analytics
 * @param {string} period - Période (week, month, quarter, year)
 * @returns {object} Statistiques de croissance
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    
    // Déterminer la date de début en fonction de la période
    const startDate = getStartDateFromPeriod(period);
    
    // Nouveaux utilisateurs dans la période
    const newUsers = await User.countDocuments({
      createdAt: { $gte: startDate }
    });
    
    // Nouveaux posts dans la période
    const newPosts = await Post.countDocuments({
      createdAt: { $gte: startDate }
    });
    
    // Calcul de l'engagement total (likes, commentaires, partages)
    const posts = await Post.find({
      createdAt: { $gte: startDate }
    });
    
    const engagement = posts.reduce((total, post) => {
      return total + 
        (post.likes?.length || 0) + 
        (post.comments?.length || 0) + 
        (post.shares || 0);
    }, 0);
    
    // Calculer l'engagement moyen par post
    const avgEngagementPerPost = newPosts > 0 ? 
      Math.round((engagement / newPosts) * 100) / 100 : 0;
    
    res.json({
      period,
      startDate,
      endDate: new Date(),
      metrics: {
        newUsers,
        newPosts,
        totalEngagement: engagement,
        avgEngagementPerPost
      }
    });
  } catch (error) {
    console.error('Erreur lors de l\'obtention des statistiques de croissance:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

/**
 * Obtenir les stats de croissance pour un utilisateur spécifique
 * @route GET /api/growth-analytics/user/:userId
 * @param {string} userId - ID de l'utilisateur
 * @param {string} period - Période (week, month, quarter, year)
 * @returns {object} Statistiques de croissance pour l'utilisateur
 */
router.get('/user/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    const { period = 'month' } = req.query;
    
    // Déterminer la date de début en fonction de la période
    const startDate = getStartDateFromPeriod(period);
    
    // Posts créés par l'utilisateur dans la période
    const postsCreated = await Post.countDocuments({
      authorId: userId,
      createdAt: { $gte: startDate }
    });
    
    // Engagement reçu (likes, commentaires, partages)
    const userPosts = await Post.find({
      authorId: userId,
      createdAt: { $gte: startDate }
    });
    
    const likesReceived = userPosts.reduce((total, post) => total + (post.likes?.length || 0), 0);
    const commentsReceived = userPosts.reduce((total, post) => total + (post.comments?.length || 0), 0);
    const sharesReceived = userPosts.reduce((total, post) => total + (post.shares || 0), 0);
    
    res.json({
      userId,
      period,
      startDate,
      endDate: new Date(),
      metrics: {
        postsCreated,
        likesReceived,
        commentsReceived,
        sharesReceived,
        totalEngagementReceived: likesReceived + commentsReceived + sharesReceived
      }
    });
  } catch (error) {
    console.error('Erreur lors de l\'obtention des statistiques utilisateur:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

/**
 * Obtenir les stats de croissance pour un producteur spécifique
 * @route GET /api/growth-analytics/producer/:producerId
 * @param {string} producerId - ID du producteur
 * @param {string} period - Période (week, month, quarter, year)
 * @returns {object} Statistiques de croissance pour le producteur
 */
router.get('/producer/:producerId', authenticate, async (req, res) => {
  try {
    const { producerId } = req.params;
    const { period = 'month' } = req.query;
    
    // Déterminer la date de début en fonction de la période
    const startDate = getStartDateFromPeriod(period);
    
    // Posts créés par le producteur dans la période
    const postsCreated = await Post.countDocuments({
      authorId: producerId,
      isProducerPost: true,
      createdAt: { $gte: startDate }
    });
    
    // Engagement reçu (likes, commentaires, partages)
    const producerPosts = await Post.find({
      authorId: producerId,
      isProducerPost: true,
      createdAt: { $gte: startDate }
    });
    
    const likesReceived = producerPosts.reduce((total, post) => total + (post.likes?.length || 0), 0);
    const commentsReceived = producerPosts.reduce((total, post) => total + (post.comments?.length || 0), 0);
    const sharesReceived = producerPosts.reduce((total, post) => total + (post.shares || 0), 0);
    
    // Nombre d'intérêts liés au producteur
    const interestsCount = await Post.countDocuments({
      authorId: producerId,
      isProducerPost: true,
      createdAt: { $gte: startDate },
      'interests.count': { $gt: 0 }
    });
    
    res.json({
      producerId,
      period,
      startDate,
      endDate: new Date(),
      metrics: {
        postsCreated,
        likesReceived,
        commentsReceived,
        sharesReceived,
        interestsCount,
        totalEngagementReceived: likesReceived + commentsReceived + sharesReceived
      }
    });
  } catch (error) {
    console.error('Erreur lors de l\'obtention des statistiques producteur:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

/**
 * Fonction utilitaire pour obtenir la date de début en fonction de la période
 * @param {string} period - Période (week, month, quarter, year)
 * @returns {Date} Date de début
 */
function getStartDateFromPeriod(period) {
  const now = new Date();
  switch (period) {
    case 'week':
      return new Date(now.setDate(now.getDate() - 7));
    case 'month':
      return new Date(now.setMonth(now.getMonth() - 1));
    case 'quarter':
      return new Date(now.setMonth(now.getMonth() - 3));
    case 'year':
      return new Date(now.setFullYear(now.getFullYear() - 1));
    default:
      return new Date(now.setMonth(now.getMonth() - 1)); // Par défaut: un mois
  }
}

module.exports = router; 