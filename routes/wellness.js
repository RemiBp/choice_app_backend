const express = require('express');
const router = express.Router();
const wellnessController = require('../controllers/wellnessController');

/**
 * Routes pour les producteurs de bien-être
 */

// GET /api/wellness - Obtenir tous les producteurs de bien-être
router.get('/', wellnessController.getAllWellnessProducers);

// GET /api/wellness/search - Rechercher des producteurs de bien-être
router.get('/search', wellnessController.searchWellnessProducers);

// GET /api/wellness/nearby - Obtenir les producteurs de bien-être à proximité
router.get('/nearby', wellnessController.getNearbyWellnessProducers);

// GET /api/wellness/categories - Obtenir toutes les catégories de bien-être
router.get('/categories', wellnessController.getWellnessCategories);

// GET /api/wellness/user/:userId/favorites - Obtenir les producteurs favoris d'un utilisateur
router.get('/user/:userId/favorites', wellnessController.getUserFavoriteWellnessProducers);

// GET /api/wellness/:id - Obtenir un producteur de bien-être par ID
router.get('/:id', wellnessController.getWellnessProducerById);

// GET /api/wellness/:id/services - Obtenir les services d'un producteur
router.get('/:id/services', wellnessController.getWellnessServices);

// PUT /api/wellness/:id/photos - Mettre à jour les photos d'un producteur
router.put('/:id/photos', wellnessController.updateWellnessProducerPhotos);

// POST /api/wellness/:id/photos - Ajouter des photos à un producteur
router.post('/:id/photos', wellnessController.addWellnessProducerPhotos);

// DELETE /api/wellness/:id/photos/:photoUrl - Supprimer une photo d'un producteur
router.delete('/:id/photos/:photoUrl', wellnessController.deleteWellnessProducerPhoto);

// PUT /api/wellness/:id/services - Mettre à jour les services d'un producteur
router.put('/:id/services', wellnessController.updateWellnessProducerServices);

// PUT /api/wellness/:id/notes - Mettre à jour les notes d'un producteur
router.put('/:id/notes', wellnessController.updateWellnessProducerNotes);

module.exports = router; 