const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventController');
const { authenticateToken } = require('../middleware/authMiddleware');

/**
 * Routes pour la gestion des événements
 */

// Routes publiques
router.get('/', eventController.getAllEvents);
router.get('/search', eventController.searchEvents);
router.get('/nearby', eventController.getNearbyEvents);
router.get('/popular', eventController.getPopularEvents);
router.get('/:id', eventController.getEventById);

// Routes protégées (nécessitant authentification)
router.post('/', authenticateToken, eventController.createEvent);
router.put('/:id', authenticateToken, eventController.updateEvent);
router.delete('/:id', authenticateToken, eventController.deleteEvent);

// Routes liées aux favoris
router.post('/favorites/:userId', authenticateToken, eventController.addToFavorites);
router.delete('/favorites/:userId', authenticateToken, eventController.removeFromFavorites);

module.exports = router; 