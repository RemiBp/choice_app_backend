const express = require('express');
const router = express.Router();
const heatmapController = require('../controllers/heatmapController');
const auth = require('../middleware/auth');

/**
 * Routes pour la fonctionnalité heatmap
 */

// GET /api/location-history/hotspots - Récupérer les hotspots de localisation autour d'un point
router.get('/location-history/hotspots', heatmapController.getHotspots);

// GET /api/heatmap/realtime/:producerId - Récupérer les données de heatmap en temps réel pour un producteur
router.get('/realtime/:producerId', auth, heatmapController.getRealtimeHeatmap);

// GET /api/heatmap/active-users/:producerId - Récupérer les utilisateurs actifs autour d'un producteur
router.get('/active-users/:producerId', auth, heatmapController.getActiveUsers);

// GET /api/heatmap/nearby-searches/:producerId - Récupérer les recherches récentes à proximité
router.get('/nearby-searches/:producerId', auth, heatmapController.getNearbySearches);

// GET /api/heatmap/action-opportunities/:producerId - Récupérer les opportunités d'action pour un producteur
router.get('/action-opportunities/:producerId', auth, heatmapController.getActionOpportunities);

module.exports = router; 