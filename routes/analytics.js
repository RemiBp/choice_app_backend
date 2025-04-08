const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');

/**
 * Routes pour les analytiques
 */

// POST /api/analytics/events - Enregistrer un lot d'événements
router.post('/events', analyticsController.logEvents);

// POST /api/analytics/event - Enregistrer un seul événement
router.post('/event', analyticsController.logEvent);

// GET /api/analytics/producer/:producerId - Obtenir les analytiques d'un producteur
router.get('/producer/:producerId', analyticsController.getProducerAnalytics);

// GET /api/analytics/growth-analytics/:producerId/overview - Obtenir l'aperçu des analytiques de croissance
router.get('/growth-analytics/:producerId/overview', analyticsController.getGrowthAnalyticsOverview);

// GET /api/analytics/growth-analytics/:producerId/trends - Obtenir les tendances des analytiques de croissance
router.get('/growth-analytics/:producerId/trends', analyticsController.getGrowthAnalyticsTrends);

// GET /api/analytics/growth-analytics/:producerId/recommendations - Obtenir les recommandations des analytiques de croissance
router.get('/growth-analytics/:producerId/recommendations', analyticsController.getGrowthAnalyticsRecommendations);

module.exports = router; 