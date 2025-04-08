const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { choiceAppDb, loisirDb } = require('../index');
const eventCalendarController = require('../controllers/eventCalendarController');

/**
 * Routes pour le calendrier d'événements
 */

// GET /api/calendar/events - Obtenir les événements pour la période
router.get('/events', eventCalendarController.getEvents);

// GET /api/calendar/events/:eventId - Obtenir un événement spécifique
router.get('/events/:eventId', eventCalendarController.getEventById);

// GET /api/calendar/user/:userId/events - Obtenir les événements d'un utilisateur
router.get('/user/:userId/events', eventCalendarController.getUserEvents);

// GET /api/calendar/producer/:producerId/events - Obtenir les événements d'un producteur
router.get('/producer/:producerId/events', eventCalendarController.getProducerEvents);

// POST /api/calendar/events - Créer un nouvel événement
router.post('/events', eventCalendarController.createEvent);

// PUT /api/calendar/events/:eventId - Mettre à jour un événement
router.put('/events/:eventId', eventCalendarController.updateEvent);

// DELETE /api/calendar/events/:eventId - Supprimer un événement
router.delete('/events/:eventId', eventCalendarController.deleteEvent);

// POST /api/calendar/events/:eventId/register - S'inscrire à un événement
router.post('/events/:eventId/register', eventCalendarController.registerForEvent);

// POST /api/calendar/events/:eventId/unregister - Se désinscrire d'un événement
router.post('/events/:eventId/unregister', eventCalendarController.unregisterFromEvent);

// GET /api/calendar/events/nearby - Obtenir les événements à proximité
router.get('/events/nearby', eventCalendarController.getNearbyEvents);

// GET /api/calendar/categories - Obtenir toutes les catégories d'événements
router.get('/categories', eventCalendarController.getEventCategories);

module.exports = router; 