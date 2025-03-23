const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

// Connexion à la base de données choice_app
const choiceDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: 'choice_app',
});

// Connexion à la base de données Restauration_Officielle
const restaurationDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: 'Restauration_Officielle',
});

// Connexion à la base de données Loisir&Culture
const loisirDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: 'Loisir&Culture',
});

// Modèle pour l'utilisateur
const User = choiceDb.model(
  'User',
  new mongoose.Schema({}, { strict: false }),
  'Users'
);

// Modèle pour les restaurants
const Restaurant = restaurationDb.model(
  'Restaurant',
  new mongoose.Schema({}, { strict: false }),
  'producers'
);

// Modèle pour les événements
const Event = loisirDb.model(
  'Event',
  new mongoose.Schema({}, { strict: false }),
  'Loisir_Paris_Evenements'
);

// Modèle pour les lieux culturels
const LeisureVenue = loisirDb.model(
  'LeisureVenue',
  new mongoose.Schema({}, { strict: false }),
  'Loisir_Paris_Producers'
);

/**
 * Constantes pour la vérification des visites
 */
const MAX_DAYS_AGO = 7; // Maximum 7 jours dans le passé
const MIN_DURATION_MINUTES = 30; // Minimum 30 minutes sur place

/**
 * Vérification de l'historique des visites
 * 
 * @route GET /api/location-history/verify
 * @query {string} userId - ID de l'utilisateur
 * @query {string} locationId - ID du lieu
 * @query {string} locationType - Type de lieu ('restaurant', 'event', 'leisure')
 * @query {number} [minDurationMinutes=30] - Durée minimale en minutes
 * @query {number} [maxDaysAgo=7] - Nombre maximum de jours dans le passé
 * @returns {Object} Résultat de la vérification avec détails
 */
router.get('/verify', async (req, res) => {
  const { userId, locationId, locationType } = req.query;
  const minDurationMinutes = Number(req.query.minDurationMinutes) || MIN_DURATION_MINUTES;
  const maxDaysAgo = Number(req.query.maxDaysAgo) || MAX_DAYS_AGO;

  // Vérification des paramètres requis
  if (!userId || !locationId || !locationType) {
    return res.status(400).json({
      verified: false,
      message: 'Les paramètres userId, locationId et locationType sont requis.'
    });
  }

  try {
    // Récupération de l'utilisateur avec ses localisations fréquentes
    const user = await User.findById(userId).select('frequent_locations');
    
    if (!user) {
      return res.status(404).json({
        verified: false,
        message: 'Utilisateur non trouvé.'
      });
    }

    // Vérification de l'existence des localisations fréquentes
    if (!user.frequent_locations || !Array.isArray(user.frequent_locations) || user.frequent_locations.length === 0) {
      return res.status(200).json({
        verified: false,
        message: 'Aucun historique de localisation trouvé pour cet utilisateur.',
        visits: []
      });
    }

    // Recherche du lieu spécifique dans les localisations fréquentes
    const locationHistory = user.frequent_locations.find(loc => loc.id === locationId);
    
    if (!locationHistory) {
      return res.status(200).json({
        verified: false,
        message: 'Aucune visite trouvée pour ce lieu spécifique.',
        visits: []
      });
    }

    // Vérification que le lieu a des visites enregistrées
    if (!locationHistory.visits || !Array.isArray(locationHistory.visits) || locationHistory.visits.length === 0) {
      return res.status(200).json({
        verified: false,
        message: 'Aucune visite enregistrée pour ce lieu.',
        locationFound: true,
        visits: []
      });
    }

    // Calcul de la date limite pour considérer une visite comme récente
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxDaysAgo);
    const cutoffDateISO = cutoffDate.toISOString();

    // Filtrage des visites récentes et préparation des détails pour la réponse
    const recentVisits = locationHistory.visits
      .filter(visit => {
        // Convertir la date de visite en objet Date pour la comparaison
        const visitDate = new Date(visit.date);
        return visitDate >= cutoffDate;
      })
      .map(visit => {
        return {
          date: visit.date,
          duration_minutes: visit.duration_minutes || 0,
          is_valid: (visit.duration_minutes || 0) >= minDurationMinutes
        };
      });

    // Vérification si au moins une visite est valide
    const hasValidVisit = recentVisits.some(visit => visit.is_valid);

    // Récupération du nom du lieu
    let locationName = locationHistory.name || 'Lieu sans nom';
    let locationDetails = null;

    // Enrichir avec des détails du lieu si nécessaire
    try {
      if (locationType === 'restaurant') {
        locationDetails = await Restaurant.findById(locationId).select('name address');
        if (locationDetails) {
          locationName = locationDetails.name;
        }
      } else if (locationType === 'event') {
        locationDetails = await Event.findById(locationId).select('intitulé lieu');
        if (locationDetails) {
          locationName = locationDetails.intitulé || locationDetails.titre || locationDetails.name;
        }
      } else if (locationType === 'leisure') {
        locationDetails = await LeisureVenue.findById(locationId).select('lieu nom');
        if (locationDetails) {
          locationName = locationDetails.lieu || locationDetails.nom || locationDetails.name;
        }
      }
    } catch (error) {
      console.error(`Erreur lors de la récupération des détails du lieu: ${error.message}`);
      // On continue avec le nom par défaut
    }

    // Préparation de la réponse
    return res.status(200).json({
      verified: hasValidVisit,
      message: hasValidVisit 
        ? `Visite valide trouvée: vous avez passé assez de temps à ${locationName} récemment.`
        : recentVisits.length > 0 
          ? `Visites récentes trouvées, mais aucune n'a duré assez longtemps (min: ${minDurationMinutes} minutes).`
          : `Aucune visite récente trouvée pour ${locationName} (max: ${maxDaysAgo} jours).`,
      location_name: locationName,
      location_id: locationId,
      location_type: locationType,
      recent_visits: recentVisits,
      min_duration_required: minDurationMinutes,
      max_days_ago: maxDaysAgo
    });

  } catch (error) {
    console.error(`Erreur lors de la vérification de l'historique des visites: ${error.message}`);
    return res.status(500).json({
      verified: false,
      message: 'Erreur serveur lors de la vérification de l\'historique des visites.',
      error: error.message
    });
  }
});

/**
 * Récupération de l'historique des visites
 * 
 * @route GET /api/location-history
 * @query {string} userId - ID de l'utilisateur
 * @query {string} [locationId] - ID du lieu (optionnel)
 * @query {string} [locationType] - Type de lieu (optionnel)
 * @query {number} [maxDaysAgo=7] - Nombre maximum de jours dans le passé
 * @returns {Object} Historique des visites
 */
router.get('/', async (req, res) => {
  const { userId, locationId, locationType } = req.query;
  const maxDaysAgo = Number(req.query.maxDaysAgo) || MAX_DAYS_AGO;

  // Vérification du paramètre userId requis
  if (!userId) {
    return res.status(400).json({
      success: false,
      message: 'Le paramètre userId est requis.'
    });
  }

  try {
    // Récupération de l'utilisateur avec ses localisations fréquentes
    const user = await User.findById(userId).select('frequent_locations');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé.'
      });
    }

    // Vérification de l'existence des localisations fréquentes
    if (!user.frequent_locations || !Array.isArray(user.frequent_locations) || user.frequent_locations.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Aucun historique de localisation trouvé pour cet utilisateur.',
        visits: []
      });
    }

    // Calcul de la date limite pour considérer une visite comme récente
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxDaysAgo);
    const cutoffDateISO = cutoffDate.toISOString();

    // Si un locationId est spécifié, récupérer uniquement les visites pour ce lieu
    if (locationId) {
      const locationHistory = user.frequent_locations.find(loc => loc.id === locationId);
      
      if (!locationHistory) {
        return res.status(200).json({
          success: true,
          message: 'Aucune visite trouvée pour ce lieu spécifique.',
          visits: []
        });
      }

      // Filtrage des visites récentes pour ce lieu spécifique
      const recentVisits = locationHistory.visits
        ? locationHistory.visits
            .filter(visit => new Date(visit.date) >= cutoffDate)
            .map(visit => ({
              location_id: locationId,
              location_name: locationHistory.name,
              location_type: locationType || locationHistory.type,
              visit_date: visit.date,
              duration_minutes: visit.duration_minutes || 0
            }))
        : [];

      return res.status(200).json({
        success: true,
        location_name: locationHistory.name,
        location_id: locationId,
        location_type: locationType || locationHistory.type,
        visits: recentVisits
      });
    }

    // Si aucun locationId n'est spécifié, récupérer toutes les visites récentes
    const allRecentVisits = [];
    
    for (const location of user.frequent_locations) {
      if (location.visits && Array.isArray(location.visits)) {
        // Filtrer par type de lieu si spécifié
        if (locationType && location.type !== locationType) {
          continue;
        }
        
        // Filtrer les visites récentes
        const recentVisitsForLocation = location.visits
          .filter(visit => new Date(visit.date) >= cutoffDate)
          .map(visit => ({
            location_id: location.id,
            location_name: location.name,
            location_type: location.type,
            visit_date: visit.date,
            duration_minutes: visit.duration_minutes || 0
          }));
        
        allRecentVisits.push(...recentVisitsForLocation);
      }
    }

    // Tri par date (la plus récente en premier)
    allRecentVisits.sort((a, b) => new Date(b.visit_date) - new Date(a.visit_date));

    return res.status(200).json({
      success: true,
      visits: allRecentVisits
    });

  } catch (error) {
    console.error(`Erreur lors de la récupération de l'historique des visites: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération de l\'historique des visites.',
      error: error.message
    });
  }
});

/**
 * Récupération des lieux fréquemment visités
 * 
 * @route GET /api/location-history/frequent-places
 * @query {string} userId - ID de l'utilisateur
 * @query {number} [maxDaysAgo=30] - Nombre maximum de jours dans le passé (par défaut 30)
 * @query {number} [minVisits=2] - Nombre minimum de visites pour être considéré comme fréquent
 * @returns {Object} Liste des lieux fréquemment visités
 */
router.get('/frequent-places', async (req, res) => {
  const { userId } = req.query;
  const maxDaysAgo = Number(req.query.maxDaysAgo) || 30; // 30 jours par défaut
  const minVisits = Number(req.query.minVisits) || 2; // 2 visites minimum par défaut

  // Vérification du paramètre userId requis
  if (!userId) {
    return res.status(400).json({
      success: false,
      message: 'Le paramètre userId est requis.'
    });
  }

  try {
    // Récupération de l'utilisateur avec ses localisations fréquentes
    const user = await User.findById(userId).select('frequent_locations');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé.'
      });
    }

    // Vérification de l'existence des localisations fréquentes
    if (!user.frequent_locations || !Array.isArray(user.frequent_locations) || user.frequent_locations.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Aucun historique de localisation trouvé pour cet utilisateur.',
        frequent_places: []
      });
    }

    // Calcul de la date limite pour considérer une visite comme récente
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxDaysAgo);

    // Calcul des statistiques de visite pour chaque lieu
    const frequentPlaces = user.frequent_locations
      .map(location => {
        // Filtrer les visites récentes
        const recentVisits = location.visits
          ? location.visits.filter(visit => new Date(visit.date) >= cutoffDate)
          : [];
        
        // Calculer la durée totale
        const totalDuration = recentVisits.reduce((sum, visit) => sum + (visit.duration_minutes || 0), 0);
        
        // Calculer la durée moyenne
        const averageDuration = recentVisits.length > 0 
          ? Math.round(totalDuration / recentVisits.length) 
          : 0;
        
        return {
          location_id: location.id,
          location_name: location.name,
          location_type: location.type,
          address: location.address,
          coordinates: location.coordinates,
          recent_visits_count: recentVisits.length,
          total_duration_minutes: totalDuration,
          average_duration_minutes: averageDuration,
          last_visited: recentVisits.length > 0 
            ? recentVisits.sort((a, b) => new Date(b.date) - new Date(a.date))[0].date 
            : null
        };
      })
      // Filtrer les lieux avec au moins minVisits visites
      .filter(place => place.recent_visits_count >= minVisits)
      // Trier par nombre de visites (décroissant)
      .sort((a, b) => b.recent_visits_count - a.recent_visits_count);

    return res.status(200).json({
      success: true,
      frequent_places: frequentPlaces
    });

  } catch (error) {
    console.error(`Erreur lors de la récupération des lieux fréquemment visités: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des lieux fréquemment visités.',
      error: error.message
    });
  }
});

module.exports = router;