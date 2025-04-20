const express = require('express');
const router = express.Router();
const beautyPlacesController = require('../controllers/beautyPlacesController');

/**
 * Routes pour les établissements de beauté
 */

// GET /api/beauty_places - Obtenir tous les établissements de beauté
router.get('/', beautyPlacesController.getAllBeautyPlaces);

// GET /api/beauty_places/search - Rechercher des établissements de beauté
router.get('/search', beautyPlacesController.searchBeautyPlaces);

// GET /api/beauty_places/nearby - Obtenir les établissements de beauté à proximité
router.get('/nearby', beautyPlacesController.getNearbyBeautyPlaces);

// GET /api/beauty_places/categories - Obtenir toutes les catégories
router.get('/categories', beautyPlacesController.getBeautyCategories);

// GET /api/beauty_places/specialties - Obtenir toutes les spécialités
router.get('/specialties', beautyPlacesController.getBeautySpecialties);

// GET /api/beauty_places/criteria - Obtenir les critères d'évaluation par catégorie
router.get('/criteria', beautyPlacesController.getEvaluationCriteria);

// GET /api/beauty_places/available-hours - Obtenir les horaires disponibles
router.get('/available-hours', beautyPlacesController.getAvailableHours);

// GET /api/beauty_places/place/:placeId - Obtenir un établissement par son place_id Google
router.get('/place/:placeId', beautyPlacesController.getBeautyPlaceByPlaceId);

// POST /api/beauty_places/user/:userId/favorites - Ajouter un établissement aux favoris
router.post('/user/:userId/favorites', beautyPlacesController.addToFavorites);

// DELETE /api/beauty_places/user/:userId/favorites - Retirer un établissement des favoris
router.delete('/user/:userId/favorites', beautyPlacesController.removeFromFavorites);

// GET /api/beauty_places/:id - Obtenir un établissement par ID
router.get('/:id', beautyPlacesController.getBeautyPlaceById);

module.exports = router; 