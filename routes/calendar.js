const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { choiceAppDb, loisirDb } = require('../index');
const eventCalendarController = require('../controllers/eventCalendarController');

/**
 * Routes pour le calendrier d'événements
 */

// Fonction d'initialisation du router avec les connexions DB
const initialize = (db) => {
  // Initialiser le contrôleur avec les connexions aux bases de données
  if (typeof eventCalendarController.initialize === 'function') {
    eventCalendarController.initialize(db);
  }
  
  return router;
};

// GET /api/calendar/events - Récupérer les événements
router.get('/events', eventCalendarController.getEvents);

// GET /api/calendar/events/:eventId - Récupérer un événement spécifique
router.get('/events/:eventId', eventCalendarController.getEventById);

// GET /api/calendar/users/:userId/events - Récupérer les événements d'un utilisateur
router.get('/users/:userId/events', eventCalendarController.getUserEvents);

// GET /api/calendar/producer/:producerId/events - Obtenir les événements d'un producteur
router.get('/producer/:producerId/events', eventCalendarController.getProducerEvents);

// POST /api/calendar/events - Créer un nouvel événement
router.post('/events', eventCalendarController.createEvent);

// PUT /api/calendar/events/:eventId - Mettre à jour un événement
router.put('/events/:eventId', eventCalendarController.updateEvent);

// DELETE /api/calendar/events/:eventId - Supprimer un événement
router.delete('/events/:eventId', eventCalendarController.deleteEvent);

// POST /api/calendar/events/:eventId/register/:userId - Inscrire un utilisateur à un événement
router.post('/events/:eventId/register/:userId', eventCalendarController.registerForEvent);

// POST /api/calendar/events/:eventId/unregister/:userId - Désinscrire un utilisateur d'un événement
router.post('/events/:eventId/unregister/:userId', eventCalendarController.unregisterFromEvent);

// GET /api/calendar/events/nearby - Obtenir les événements à proximité
router.get('/events/nearby', eventCalendarController.getNearbyEvents);

// GET /api/calendar/categories - Récupérer toutes les catégories d'événements
router.get('/categories', eventCalendarController.getEventCategories);

// Exporter la fonction d'initialisation et le routeur
router.initialize = initialize;
module.exports = router; 