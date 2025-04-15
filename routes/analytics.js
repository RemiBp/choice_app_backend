const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const mongoose = require('mongoose');
const { createModel, databases } = require('../utils/modelCreator');
const { requireAuth } = require('../middleware/authMiddleware');
const requirePremiumFeature = require('../middleware/premiumFeatureMiddleware');

/**
 * Routes pour les analytiques
 */

// Initialiser les modèles avec l'utilitaire
const AnalyticsEvent = createModel(
  databases.CHOICE_APP,
  'AnalyticsEvent',
  'AnalyticsEvents'
);

// POST /api/analytics/events - Enregistrer un événement d'analytics
router.post('/events', async (req, res) => {
  try {
    const { userId, eventType, eventData, timestamp } = req.body;
    
    // Validation des données minimales
    if (!eventType) {
      return res.status(400).json({ message: 'Le type d\'événement est requis' });
    }
    
    // Créer un nouvel événement d'analytics
    const analyticsEvent = new AnalyticsEvent({
      userId: userId || 'anonymous',
      eventType,
      eventData: eventData || {},
      timestamp: timestamp || new Date(),
    });
    
    await analyticsEvent.save();
    
    res.status(201).json({ 
      success: true,
      message: 'Événement enregistré avec succès',
      eventId: analyticsEvent._id
    });
  } catch (error) {
    console.error('❌ Erreur lors de l\'enregistrement de l\'événement:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de l\'enregistrement de l\'événement', 
      error: error.message 
    });
  }
});

// GET /api/analytics/events - Récupérer les événements analytics
router.get('/events', async (req, res) => {
  try {
    const { userId, eventType, startDate, endDate, limit = 100, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Construire la requête
    let query = {};
    
    if (userId) {
      query.userId = userId;
    }
    
    if (eventType) {
      query.eventType = eventType;
    }
    
    // Filtre par date
    if (startDate || endDate) {
      query.timestamp = {};
      
      if (startDate) {
        query.timestamp.$gte = new Date(startDate);
      }
      
      if (endDate) {
        query.timestamp.$lte = new Date(endDate);
      }
    }
    
    // Récupérer les événements
    const events = await AnalyticsEvent.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await AnalyticsEvent.countDocuments(query);
    
    res.status(200).json({
      events,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des événements:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la récupération des événements', 
      error: error.message 
    });
  }
});

// POST /api/analytics/event - Enregistrer un seul événement
router.post('/event', analyticsController.logGenericEvent);

// GET /api/analytics/:producerId/overview - Obtenir l'aperçu
router.get(
    '/:producerId/overview',
    requireAuth,
    analyticsController.getOverview
);

// GET /api/analytics/:producerId/trends - Obtenir les tendances
router.get(
    '/:producerId/trends',
    requireAuth,
    analyticsController.getTrends
);

// GET /api/analytics/:producerId/recommendations - Obtenir les recommandations
router.get(
    '/:producerId/recommendations',
    requireAuth,
    analyticsController.getRecommendations
);

// GET /api/analytics/:producerId/demographics - Obtenir les données démographiques (Premium)
router.get(
    '/:producerId/demographics',
    requireAuth,
    requirePremiumFeature('pro'),
    analyticsController.getDemographics
);

// GET /api/analytics/:producerId/predictions - Obtenir les prédictions (Premium)
router.get(
    '/:producerId/predictions',
    requireAuth,
    requirePremiumFeature('pro'),
    analyticsController.getPredictions
);

// GET /api/analytics/:producerId/competitor-analysis - Obtenir l'analyse concurrentielle (Premium)
router.get(
    '/:producerId/competitor-analysis',
    requireAuth,
    requirePremiumFeature('starter'),
    analyticsController.getCompetitorAnalysis
);

module.exports = router; 