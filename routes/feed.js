const express = require('express');
const router = express.Router();
const feedController = require('../controllers/feedController');

/**
 * Routes pour le flux d'activité
 */

// GET /api/feed - Obtenir le flux d'activité principal
router.get('/', feedController.getFeed);

// GET /api/feed/discovery - Obtenir le flux de découverte
router.get('/discovery', feedController.getDiscoveryFeed);

// GET /api/feed/following - Obtenir le flux des utilisateurs suivis
router.get('/following', feedController.getFollowingFeed);

// GET /api/feed/trending - Obtenir les contenus tendance
router.get('/trending', feedController.getTrendingContent);

// GET /api/feed/nearby - Obtenir les activités à proximité
router.get('/nearby', feedController.getNearbyActivities);

// GET /api/feed/categories - Obtenir le flux par catégorie
router.get('/categories/:category', feedController.getFeedByCategory);

// GET /api/feed/user/:userId - Obtenir le flux d'un utilisateur
router.get('/user/:userId', feedController.getUserFeed);

module.exports = router; // Exportation du routeur
