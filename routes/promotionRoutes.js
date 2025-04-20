const express = require('express');
const router = express.Router();
const promotionController = require('../controllers/promotionController');

/**
 * Routes pour la gestion des promotions
 */

// GET /api/promotions/nearby - Obtenir les promotions actives à proximité
router.get('/nearby', promotionController.getNearbyPromotions);

// GET /api/promotions/producers/:producerId - Obtenir les informations de promotion d'un producteur
router.get('/producers/:producerId', promotionController.getPromotion);

// POST /api/promotions/producers/:producerId - Définir une promotion pour un producteur
router.post('/producers/:producerId', promotionController.setPromotion);

module.exports = router; 