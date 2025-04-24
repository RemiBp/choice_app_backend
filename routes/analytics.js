const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const mongoose = require('mongoose');
const { createModel, databases } = require('../utils/modelCreator');
const { requireAuth } = require('../middleware/authMiddleware');
const requirePremiumFeature = require('../middleware/premiumFeatureMiddleware');

// --- Require Schemas for direct use in this router if needed ---
const ProfileViewSchema = require('../models/ProfileView');

// --- Model Initialization --- 
// Models needed directly in this router file (others are used in the controller)
let ProfileView;
let AnalyticsEvent; // Keep the generic event model too

function initializeRouterModels() {
    const { choiceAppDb } = require('../index'); // Get connections
    if (choiceAppDb) {
        ProfileView = createModel(choiceAppDb, 'ProfileView', 'profile_views', ProfileViewSchema);
        // Initialize the generic AnalyticsEvent model too if needed by this router
        AnalyticsEvent = createModel(choiceAppDb, 'AnalyticsEvent', 'analytics_events'); 
        console.log("✅ Analytics Router Models Initialized (ProfileView, AnalyticsEvent)");
    } else {
        console.error("❌ choiceAppDb connection not available for Analytics Router Models");
        ProfileView = AnalyticsEvent = null;
    }
}

// Call initialization
initializeRouterModels();

/**
 * Routes pour les analytiques
 */

// POST /api/analytics/events - Enregistrer un événement d'analytics (Générique + ProfileView)
router.post('/events', async (req, res) => {
  try {
    // Check model initialization
    if (!AnalyticsEvent || !ProfileView) {
      initializeRouterModels(); // Attempt re-init
      if (!AnalyticsEvent || !ProfileView) {
         return res.status(500).json({ success: false, message: 'Router models not initialized' });
      }
    }

    // Handle single event or batch from frontend queue
    if (req.body.events && Array.isArray(req.body.events)) {
        // --- Batch Processing --- (From AnalyticsService queue)
        const eventsToInsert = [];
        const profileViewsToInsert = [];
        const receivedEvents = req.body.events;

        for (const event of receivedEvents) {
            if (!event.name || !event.parameters) {
                console.warn('Skipping invalid event in batch:', event);
                continue;
            }

            // Specific handling for profile_view
            if (event.name === 'profile_view' && event.parameters.profile_id && event.parameters.producer_type) {
                profileViewsToInsert.push({
                    producerId: new mongoose.Types.ObjectId(event.parameters.profile_id),
                    onModel: event.parameters.producer_type, // Assuming frontend sends 'producer_type'
                    userId: event.parameters.userId ? new mongoose.Types.ObjectId(event.parameters.userId) : null,
                    timestamp: new Date(event.timestamp || Date.now()),
                    // Add other fields like sessionId, deviceInfo if available in event.parameters
                });
            } else {
                // Generic event handling
                eventsToInsert.push({
                    name: event.name, 
                    userId: event.parameters.userId,
                    parameters: event.parameters,
                    timestamp: new Date(event.timestamp || Date.now()),
                });
            }
        }

        let genericResult, profileViewResult;
        if (eventsToInsert.length > 0) {
            genericResult = await AnalyticsEvent.insertMany(eventsToInsert);
        }
        if (profileViewsToInsert.length > 0) {
            profileViewResult = await ProfileView.insertMany(profileViewsToInsert);
        }

         res.status(200).json({ 
            success: true, 
            message: `${eventsToInsert.length} generic events and ${profileViewsToInsert.length} profile views processed.`
         });

    } else if (req.body.type && req.body.data) {
        // --- Single Event Processing --- (From _sendEventToServer, e.g., content interactions)
        const { type, data } = req.body;
        let savedEvent;

        // Specific handling for profile_view if sent individually
        if (type === 'profile_view' && data.profile_id && data.producer_type) {
            const newProfileView = new ProfileView({
                producerId: new mongoose.Types.ObjectId(data.profile_id),
                onModel: data.producer_type, // Ensure this matches the enum in ProfileView schema
                userId: data.userId ? new mongoose.Types.ObjectId(data.userId) : null,
                timestamp: new Date(data.timestamp || Date.now()),
            });
            savedEvent = await newProfileView.save();
             res.status(201).json({ 
                success: true,
                message: 'Profile View event enregistré avec succès',
                eventId: savedEvent._id 
            });
        } else {
            // Generic event saving
            const newEvent = new AnalyticsEvent({
                name: type,
                userId: data.userId || 'anonymous',
                parameters: data,
                timestamp: new Date(data.timestamp || Date.now()),
            });
            savedEvent = await newEvent.save();
             res.status(201).json({ 
                success: true,
                message: 'Événement générique enregistré avec succès',
                eventId: savedEvent._id 
            });
        }
    } else {
        // --- Invalid Format --- 
         return res.status(400).json({ success: false, message: 'Format de requête invalide. Envoyez { events: [...] } ou { type: ..., data: ... }' });
    }

  } catch (error) {
    console.error('❌ Erreur dans POST /api/analytics/events:', error);
    // Handle potential CastError if ObjectId parsing fails
    if (error.name === 'CastError') {
        return res.status(400).json({ success: false, message: 'ID invalide fourni', error: error.message });
    }
    res.status(500).json({ 
      success: false, 
      message: 'Erreur serveur lors de l\'enregistrement de l\'événement(s)', 
      error: error.message 
    });
  }
});

// GET /api/analytics/events - Récupérer les événements analytics (Generic only for now)
router.get('/events', async (req, res) => {
   // This route currently only queries the generic AnalyticsEvent collection.
   // Modify if needed to query ProfileViews or combine results.
   try {
     if (!AnalyticsEvent) {
       initializeRouterModels();
       if (!AnalyticsEvent) return res.status(500).json({ message: 'Model not initialized' });
     }

     const { userId, eventType, startDate, endDate, limit = 100, page = 1 } = req.query;
     const skip = (parseInt(page) - 1) * parseInt(limit);
     
     let query = {};
     if (userId) query.userId = userId;
     if (eventType) query.name = eventType; // Filter by name field now
     
     if (startDate || endDate) {
       query.timestamp = {};
       if (startDate) query.timestamp.$gte = new Date(startDate);
       if (endDate) query.timestamp.$lte = new Date(endDate);
     }
     
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

// POST /api/analytics/event - Enregistrer un seul événement (Legacy? Prefer /events)
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
    requirePremiumFeature('pro'), // Or the appropriate level
    analyticsController.getDemographics
);

// GET /api/analytics/:producerId/predictions - Obtenir les prédictions (Premium)
router.get(
    '/:producerId/predictions',
    requireAuth,
    requirePremiumFeature('pro'), // Or the appropriate level
    analyticsController.getPredictions
);

// GET /api/analytics/:producerId/competitor-analysis - Obtenir l'analyse concurrentielle (Premium)
router.get(
    '/:producerId/competitor-analysis',
    requireAuth,
    requirePremiumFeature('starter'), // Or the appropriate level
    analyticsController.getCompetitorAnalysis
);

module.exports = router; 