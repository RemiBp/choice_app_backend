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

// Modèle pour l'historique de localisation
const LocationHistory = choiceDb.model(
  'LocationHistory',
  new mongoose.Schema({
    userId: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true } // [longitude, latitude]
    },
    accuracy: { type: Number },
    source: { type: String, enum: ['gps', 'network', 'manual'], default: 'gps' }
  }),
  'location_history'
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

/**
 * Récupération des hotspots (points chauds) pour la carte de chaleur
 * 
 * @route GET /api/location-history/hotspots
 * @query {number} latitude - Latitude du centre de la recherche
 * @query {number} longitude - Longitude du centre de la recherche
 * @query {number} [radius=2000] - Rayon de recherche en mètres
 * @returns {Object} Points chauds avec leur poids pour la carte de chaleur
 */
router.get('/hotspots', async (req, res) => {
  const { latitude, longitude, radius = 2000 } = req.query;
  
  // Vérification des paramètres requis
  if (!latitude || !longitude) {
    return res.status(400).json({
      message: 'Les paramètres latitude et longitude sont requis.'
    });
  }

  try {
    // Conversion des paramètres en nombres
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const rad = parseInt(radius);
    
    console.log(`🔍 Recherche de hotspots: [${lat}, ${lng}] dans un rayon de ${rad}m`);
    
    // Récupérer les restaurants dans ce rayon
    const restaurants = await Restaurant.find({
      gps_coordinates: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          $maxDistance: rad
        }
      }
    }).select('name address gps_coordinates rating');
    
    // Récupérer les lieux culturels dans ce rayon
    const leisureVenues = await LeisureVenue.find({
      gps_coordinates: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          $maxDistance: rad
        }
      }
    }).select('nom lieu gps_coordinates rating');
    
    // Transformer les résultats en format pour la heatmap
    const hotspots = [];
    
    // Ajouter les restaurants
    restaurants.forEach(restaurant => {
      if (restaurant.gps_coordinates?.coordinates?.length === 2) {
        hotspots.push({
          lat: restaurant.gps_coordinates.coordinates[1],
          lng: restaurant.gps_coordinates.coordinates[0],
          weight: restaurant.rating || Math.random() * 3 + 2, // Poids basé sur la note ou aléatoire
          name: restaurant.name,
          type: 'restaurant'
        });
      }
    });
    
    // Ajouter les lieux culturels
    leisureVenues.forEach(venue => {
      if (venue.gps_coordinates?.coordinates?.length === 2) {
        hotspots.push({
          lat: venue.gps_coordinates.coordinates[1],
          lng: venue.gps_coordinates.coordinates[0],
          weight: venue.rating || Math.random() * 3 + 2, // Poids basé sur la note ou aléatoire
          name: venue.nom || venue.lieu,
          type: 'leisure'
        });
      }
    });
    
    // Ajouter quelques points aléatoires pour enrichir la heatmap
    for (let i = 0; i < 10; i++) {
      // Coordonnées aléatoires dans le rayon
      const angle = Math.random() * 2 * Math.PI;
      const distance = Math.random() * rad;
      const dx = distance * Math.cos(angle) / 111320; // Conversion approximative en degrés (équateur)
      const dy = distance * Math.sin(angle) / (111320 * Math.cos(lat * Math.PI / 180));
      
      hotspots.push({
        lat: lat + dy,
        lng: lng + dx,
        weight: Math.random() * 2 + 1, // Poids plus faible pour les points aléatoires
        type: 'generic'
      });
    }
    
    console.log(`✅ ${hotspots.length} hotspots trouvés`);
    res.status(200).json(hotspots);
  } catch (error) {
    console.error(`❌ Erreur lors de la récupération des hotspots: ${error.message}`);
    res.status(500).json({
      message: 'Erreur serveur lors de la récupération des hotspots.',
      error: error.message
    });
  }
});

// Endpoint : Ajouter une entrée à l'historique de localisation
router.post('/', async (req, res) => {
  try {
    const { userId, latitude, longitude, accuracy, source } = req.body;
    
    if (!userId || !latitude || !longitude) {
      return res.status(400).json({ message: 'UserId, latitude et longitude sont requis.' });
    }
    
    const newLocationEntry = new LocationHistory({
      userId,
      location: {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)]
      },
      accuracy: accuracy ? parseFloat(accuracy) : undefined,
      source: source || 'gps'
    });
    
    await newLocationEntry.save();
    res.status(201).json({ message: 'Localisation enregistrée avec succès.' });
  } catch (err) {
    console.error('❌ Erreur lors de l\'enregistrement de la localisation :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// Endpoint : Récupérer l'historique de localisation d'un utilisateur
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 100, from, to } = req.query;
    
    const query = { userId };
    
    if (from || to) {
      query.timestamp = {};
      if (from) query.timestamp.$gte = new Date(from);
      if (to) query.timestamp.$lte = new Date(to);
    }
    
    const locationHistory = await LocationHistory.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .select('timestamp location accuracy source');
    
    res.status(200).json(locationHistory);
  } catch (err) {
    console.error('❌ Erreur lors de la récupération de l\'historique de localisation :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// Endpoint : Trouver les points chauds (hotspots) dans une zone
router.get('/hotspots', async (req, res) => {
  try {
    const { latitude, longitude, radius = 2000 } = req.query;
    
    if (!latitude || !longitude) {
      return res.status(400).json({ message: 'Latitude et longitude sont requises.' });
    }
    
    console.log(`🔍 Recherche de points chauds: [lat=${latitude}, lng=${longitude}, radius=${radius}m]`);
    
    // Aggrégation pour grouper les localisations proches et compter leur fréquence
    const hotspots = await LocationHistory.aggregate([
      {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          },
          distanceField: 'distance',
          maxDistance: parseInt(radius),
          spherical: true
        }
      },
      {
        $group: {
          _id: {
            // Grouper par coordonnées arrondies pour trouver les zones à forte densité
            longitude: { $round: [{ $arrayElemAt: ['$location.coordinates', 0] }, 4] },
            latitude: { $round: [{ $arrayElemAt: ['$location.coordinates', 1] }, 4] }
          },
          count: { $sum: 1 },
          // Calculer la position moyenne réelle pour chaque groupe
          avgLongitude: { $avg: { $arrayElemAt: ['$location.coordinates', 0] } },
          avgLatitude: { $avg: { $arrayElemAt: ['$location.coordinates', 1] } },
          // Stocker quelques détails supplémentaires
          lastVisited: { $max: '$timestamp' },
          userIds: { $addToSet: '$userId' }
        }
      },
      {
        $match: {
          // Filtrer pour ne garder que les zones avec plusieurs visites
          count: { $gte: 3 }
        }
      },
      {
        $project: {
          _id: 0,
          location: {
            type: 'Point',
            coordinates: ['$avgLongitude', '$avgLatitude']
          },
          count: 1,
          lastVisited: 1,
          uniqueUsers: { $size: '$userIds' },
          intensity: { 
            $cond: { 
              if: { $gte: ['$count', 10] }, 
              then: 'high', 
              else: { 
                $cond: { 
                  if: { $gte: ['$count', 5] }, 
                  then: 'medium', 
                  else: 'low' 
                } 
              } 
            } 
          }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 20
      }
    ]);
    
    console.log(`✅ ${hotspots.length} points chauds trouvés`);
    res.status(200).json(hotspots);
  } catch (err) {
    console.error('❌ Erreur lors de la recherche des points chauds :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// Endpoint : Calculer le score d'activité pour une zone
router.get('/activity-score', async (req, res) => {
  try {
    const { latitude, longitude, radius = 500 } = req.query;
    
    if (!latitude || !longitude) {
      return res.status(400).json({ message: 'Latitude et longitude sont requises.' });
    }
    
    // Calculer le score d'activité basé sur le nombre de visites récentes
    const activityData = await LocationHistory.aggregate([
      {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          },
          distanceField: 'distance',
          maxDistance: parseInt(radius),
          spherical: true
        }
      },
      {
        $facet: {
          // Activité des dernières 24 heures
          last24h: [
            { 
              $match: { 
                timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } 
              } 
            },
            { $count: 'count' }
          ],
          // Activité de la dernière semaine
          lastWeek: [
            { 
              $match: { 
                timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } 
              } 
            },
            { $count: 'count' }
          ],
          // Activité du dernier mois
          lastMonth: [
            { 
              $match: { 
                timestamp: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } 
              } 
            },
            { $count: 'count' }
          ],
          // Nombre d'utilisateurs uniques
          uniqueUsers: [
            { $group: { _id: '$userId' } },
            { $count: 'count' }
          ]
        }
      }
    ]);
    
    // Extraire les valeurs des facets
    const result = activityData[0];
    const last24hCount = result.last24h[0]?.count || 0;
    const lastWeekCount = result.lastWeek[0]?.count || 0;
    const lastMonthCount = result.lastMonth[0]?.count || 0;
    const uniqueUsersCount = result.uniqueUsers[0]?.count || 0;
    
    // Calculer le score (simple exemple)
    // 50% basé sur l'activité récente, 30% sur l'activité hebdomadaire, 20% sur l'activité mensuelle
    const activityScore = Math.min(
      10,
      ((last24hCount * 0.5) + (lastWeekCount * 0.3 / 7) + (lastMonthCount * 0.2 / 30)) * 
      (1 + (uniqueUsersCount / 10)) // Bonus pour la diversité des utilisateurs
    );
    
    // Déterminer les heures de pointe (simple exemple)
    const peakHours = [
      { hour: 12, score: 8 },  // Midi
      { hour: 18, score: 9 },  // 18h
      { hour: 20, score: 7 }   // 20h
    ];
    
    const response = {
      location: {
        coordinates: [parseFloat(longitude), parseFloat(latitude)],
        type: 'Point'
      },
      activityScore: parseFloat(activityScore.toFixed(2)),
      activityLevel: activityScore > 7 ? 'high' : activityScore > 4 ? 'medium' : 'low',
      visitsLast24h: last24hCount,
      visitsLastWeek: lastWeekCount,
      visitsLastMonth: lastMonthCount,
      uniqueVisitors: uniqueUsersCount,
      peakHours: peakHours
    };
    
    res.status(200).json(response);
  } catch (err) {
    console.error('❌ Erreur lors du calcul du score d\'activité :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

module.exports = router;