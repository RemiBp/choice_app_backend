const mongoose = require('mongoose');
const { createModel, databases } = require('../utils/modelCreator');
const User = require('../models/User');

// Modèles pour les différents types de producteurs
const Producer = createModel(
  databases.RESTAURATION,
  'Producer',
  'producers'
);

const LeisureProducer = createModel(
  databases.LOISIR,
  'LeisureProducer',
  'producers'
);

const WellnessProducer = createModel(
  databases.BEAUTY_WELLNESS,
  'WellnessProducer',
  'WellnessPlace'
);

// Modèle pour les données de localisation
const LocationHistory = createModel(
  databases.CHOICE_APP,
  'LocationHistory',
  'locationHistories',
  new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }
    },
    accuracy: { type: Number },
    speed: { type: Number },
    activity: { type: String },
    metadata: { type: Object }
  }, {
    timestamps: true
  })
);

// Modèle pour les activités utilisateur
const UserActivity = createModel(
  databases.CHOICE_APP,
  'UserActivity',
  'userActivities',
  new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    producerId: { type: mongoose.Schema.Types.ObjectId },
    producerType: { type: String, enum: ['restaurant', 'leisure', 'wellness'] },
    action: { type: String, enum: ['view', 'search', 'favorite', 'click', 'share', 'call'] },
    timestamp: { type: Date, default: Date.now },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }
    },
    query: { type: String },  // Pour les recherches
    metadata: { type: Object }
  }, {
    timestamps: true
  })
);

// Fonction utilitaire pour trouver un producteur dans n'importe quelle collection
async function findProducerInAnyCollection(producerId) {
  if (!mongoose.Types.ObjectId.isValid(producerId)) {
    return null;
  }
  
  const id = new mongoose.Types.ObjectId(producerId);
  
  // Chercher dans la base de restaurants
  let producer = await Producer.findById(id);
  if (producer) return { producer, type: 'restaurant' };
  
  // Chercher dans la base de loisirs
  producer = await LeisureProducer.findById(id);
  if (producer) return { producer, type: 'leisure' };
  
  // Chercher dans la base de bien-être
  producer = await WellnessProducer.findById(id);
  if (producer) return { producer, type: 'wellness' };
  
  return null;
}

// Function to calculate distributions for a set of timestamps
function calculateDistributions(timestamps) {
  if (!timestamps || timestamps.length === 0) {
    return {
      timeDistribution: { morning: 0, afternoon: 0, evening: 0 },
      dayDistribution: { monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 0, sunday: 0 }
    };
  }

  let morningCount = 0; // 6 AM - 12 PM
  let afternoonCount = 0; // 12 PM - 6 PM
  let eveningCount = 0; // 6 PM - 6 AM (next day) - Simplified
  const dayCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }; // 0 = Sunday, 1 = Monday, ...

  timestamps.forEach(ts => {
    const date = new Date(ts);
    const hour = date.getHours();
    const dayOfWeek = date.getDay(); // 0-6

    // Time of Day (adjust ranges as needed)
    if (hour >= 6 && hour < 12) {
      morningCount++;
    } else if (hour >= 12 && hour < 18) {
      afternoonCount++;
    } else {
      eveningCount++; // Includes late night and early morning
    }

    // Day of Week
    dayCounts[dayOfWeek]++;
  });

  const total = timestamps.length;

  const timeDistribution = {
    morning: total > 0 ? morningCount / total : 0,
    afternoon: total > 0 ? afternoonCount / total : 0,
    evening: total > 0 ? eveningCount / total : 0
  };

  const dayDistribution = {
    sunday: total > 0 ? dayCounts[0] / total : 0,
    monday: total > 0 ? dayCounts[1] / total : 0,
    tuesday: total > 0 ? dayCounts[2] / total : 0,
    wednesday: total > 0 ? dayCounts[3] / total : 0,
    thursday: total > 0 ? dayCounts[4] / total : 0,
    friday: total > 0 ? dayCounts[5] / total : 0,
    saturday: total > 0 ? dayCounts[6] / total : 0
  };

  return { timeDistribution, dayDistribution };
}

// Contrôleur pour les fonctionnalités heatmap
const heatmapController = {
  /**
   * Récupérer les hotspots de localisation autour d'un point
   * @route GET /api/location-history/hotspots
   */
  getHotspots: async (req, res) => {
    try {
      const { latitude, longitude, radius = 2000, limit = 50, timespan = 'all' } = req.query;

      if (!latitude || !longitude) {
        return res.status(400).json({ message: 'Latitude et longitude requises' });
      }

      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      const radiusM = parseInt(radius, 10);
      const resultLimit = parseInt(limit, 10);

      // Define time range for historical data
      let timeFilter = {};
      if (timespan !== 'all') {
          const now = new Date();
          let startDate = new Date(now);
          if (timespan === '7d') startDate.setDate(now.getDate() - 7);
          else if (timespan === '30d') startDate.setDate(now.getDate() - 30);
          else if (timespan === '90d') startDate.setDate(now.getDate() - 90);
          // Add more options if needed
          timeFilter = { timestamp: { $gte: startDate } };
      }

      // Aggregation Pipeline
      const aggregationPipeline = [
        // Stage 1: Match documents within radius and timeframe
        {
          $match: {
            location: {
              $geoWithin: {
                 $centerSphere: [ [lng, lat], radiusM / 6378100 ] // radius in radians
              }
            },
            ...timeFilter // Apply time filter
          }
        },
        // Stage 2: Group by grid cell and collect timestamps/user IDs
        {
          $group: {
            _id: {
              // Adjust grid size as needed (e.g., 0.001 degrees ~ 111m at equator)
              latGrid: { $floor: { $divide: ["$location.coordinates.1", 0.001] } },
              lngGrid: { $floor: { $divide: ["$location.coordinates.0", 0.001] } }
            },
            latitude: { $avg: "$location.coordinates.1" },
            longitude: { $avg: "$location.coordinates.0" },
            count: { $sum: 1 },
            userIds: { $addToSet: "$userId" },
            timestamps: { $push: "$timestamp" } // Collect timestamps for distribution calculation
          }
        },
        // Stage 3: Calculate initial intensity and visitor count
        {
          $project: {
            _id: 0,
            // id: { $toString: "$_id" }, // Generate ID later
            latitude: 1,
            longitude: 1,
            intensity: { $min: [{ $divide: ["$count", 50] }, 1] }, // Normalize intensity (adjust divisor)
            visitorCount: { $size: "$userIds" },
            timestamps: 1 // Pass timestamps to the next stage (or process here)
          }
        },
        // Stage 4: Sort by intensity and limit results
        { $sort: { intensity: -1 } },
        { $limit: resultLimit }
      ];

      const aggregatedHotspots = await LocationHistory.aggregate(aggregationPipeline);

      // Enrich hotspots with calculated distributions and final ID/name
      const hotspots = aggregatedHotspots.map(spot => {
        // Calculate distributions from collected timestamps
        const { timeDistribution, dayDistribution } = calculateDistributions(spot.timestamps);

        // Generate final hotspot object
        return {
          id: new mongoose.Types.ObjectId().toString(), // Generate unique ID
          latitude: spot.latitude,
          longitude: spot.longitude,
          zoneName: `Zone ${spot.latitude.toFixed(3)}, ${spot.longitude.toFixed(3)}`, // Simple zone name
          intensity: spot.intensity,
          visitorCount: spot.visitorCount,
          weight: spot.intensity, // weight might be redundant if same as intensity
          timeDistribution: timeDistribution,
          dayDistribution: dayDistribution
        };
      });

      res.status(200).json(hotspots);
    } catch (error) {
      console.error('❌ Erreur dans getHotspots:', error);
      if (error.code === 51024) { // Specific error code for $geoNear/Within index miss
         console.error('   Hint: Missing 2dsphere index on locationHistories.location.coordinates');
         return res.status(500).json({ message: 'Erreur de base de données: Index géospatial manquant.', code: 'DB_GEO_INDEX_MISSING' });
      }
      res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
  },
  
  /**
   * Récupérer les données de heatmap en temps réel pour un producteur
   * @route GET /api/heatmap/realtime/:producerId
   */
  getRealtimeHeatmap: async (req, res) => {
    try {
      const { producerId } = req.params;
      const { timeframe = '30m' } = req.query;
      
      // Validation
      if (!producerId) {
        return res.status(400).json({ message: 'ID du producteur requis' });
      }
      
      // Trouver le producteur
      const producerResult = await findProducerInAnyCollection(producerId);
      if (!producerResult) {
        return res.status(404).json({ message: 'Producteur non trouvé' });
      }
      
      const { producer, type: producerType } = producerResult;
      
      // Déterminer l'intervalle de temps
      const now = new Date();
      let startTime = new Date(now);
      
      switch (timeframe) {
        case '15m':
          startTime.setMinutes(now.getMinutes() - 15);
          break;
        case '30m':
          startTime.setMinutes(now.getMinutes() - 30);
          break;
        case '1h':
          startTime.setHours(now.getHours() - 1);
          break;
        case '3h':
          startTime.setHours(now.getHours() - 3);
          break;
        case '6h':
          startTime.setHours(now.getHours() - 6);
          break;
        case '12h':
          startTime.setHours(now.getHours() - 12);
          break;
        case '24h':
          startTime.setHours(now.getHours() - 24);
          break;
        default:
          startTime.setMinutes(now.getMinutes() - 30);
      }
      
      // Récupérer les coordonnées du producteur
      let producerLocation;
      
      if (producer.location && producer.location.coordinates) {
        producerLocation = producer.location;
      } else if (producer.coordinates) {
        producerLocation = {
          type: 'Point',
          coordinates: [producer.coordinates.longitude, producer.coordinates.latitude]
        };
      } else if (producer.longitude && producer.latitude) {
        producerLocation = {
          type: 'Point',
          coordinates: [producer.longitude, producer.latitude]
        };
      } else {
        return res.status(400).json({ message: 'Coordonnées du producteur non disponibles' });
      }
      
      // Récupérer les activités des utilisateurs à proximité
      const activityPoints = await UserActivity.find({
        timestamp: { $gte: startTime },
        'location.coordinates': {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: producerLocation.coordinates
            },
            $maxDistance: 2000 // 2km de rayon
          }
        }
      })
      .sort({ timestamp: -1 })
      .limit(50)
      .lean();
      
      // Calculer la distance pour chaque point
      const processedActivityPoints = activityPoints.map(point => {
        const distance = calculateDistance(
          producerLocation.coordinates[1],
          producerLocation.coordinates[0],
          point.location.coordinates[1],
          point.location.coordinates[0]
        );
        
        return {
          ...point,
          distance
        };
      });
      
      // Générer des zones chaudes
      const hotZones = generateHotZones(producerLocation.coordinates, processedActivityPoints);
      
      // Récupérer les recherches récentes
      const searches = await UserActivity.find({
        action: 'search',
        timestamp: { $gte: startTime },
        'location.coordinates': {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: producerLocation.coordinates
            },
            $maxDistance: 5000 // 5km de rayon pour les recherches
          }
        }
      })
      .sort({ timestamp: -1 })
      .limit(20)
      .lean();
      
      // Calculer la distance pour chaque recherche
      const processedSearches = searches.map(search => {
        const distance = calculateDistance(
          producerLocation.coordinates[1],
          producerLocation.coordinates[0],
          search.location.coordinates[1],
          search.location.coordinates[0]
        );
        
        return {
          ...search,
          distance
        };
      });
      
      // Construire la réponse
      const heatmapData = {
        producer: {
          id: producerId,
          name: producer.name || producer.lieu,
          type: producerType,
          location: producerLocation
        },
        timeframe,
        timestamp: now,
        activityPoints: processedActivityPoints,
        hotZones,
        searches: processedSearches,
        stats: {
          totalActivities: processedActivityPoints.length,
          uniqueUsers: new Set(processedActivityPoints.map(p => p.userId.toString())).size,
          totalSearches: processedSearches.length
        }
      };
      
      res.status(200).json(heatmapData);
    } catch (error) {
      console.error('❌ Erreur dans getRealtimeHeatmap:', error);
      res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
  },
  
  /**
   * Récupérer les utilisateurs actifs autour d'un producteur
   * @route GET /api/heatmap/active-users/:producerId
   */
  getActiveUsers: async (req, res) => {
    try {
      const { producerId } = req.params;
      
      // Validation
      if (!producerId) {
        return res.status(400).json({ message: 'ID du producteur requis' });
      }
      
      // Trouver le producteur
      const producerResult = await findProducerInAnyCollection(producerId);
      if (!producerResult) {
        return res.status(404).json({ message: 'Producteur non trouvé' });
      }
      
      const { producer } = producerResult;
      
      // Récupérer les coordonnées du producteur
      let producerLocation;
      
      if (producer.location && producer.location.coordinates) {
        producerLocation = producer.location;
      } else if (producer.coordinates) {
        producerLocation = {
          type: 'Point',
          coordinates: [producer.coordinates.longitude, producer.coordinates.latitude]
        };
      } else if (producer.longitude && producer.latitude) {
        producerLocation = {
          type: 'Point',
          coordinates: [producer.longitude, producer.latitude]
        };
      } else {
        return res.status(400).json({ message: 'Coordonnées du producteur non disponibles' });
      }
      
      // Définir la période de temps pour "actif" (30 minutes)
      const activeTime = new Date();
      activeTime.setMinutes(activeTime.getMinutes() - 30);
      
      // Agréger les utilisateurs actifs à proximité
      const activeUsers = await LocationHistory.aggregate([
        {
          $match: {
            timestamp: { $gte: activeTime },
            'location.coordinates': {
              $near: {
                $geometry: {
                  type: 'Point',
                  coordinates: producerLocation.coordinates
                },
                $maxDistance: 2000 // 2km de rayon
              }
            }
          }
        },
        {
          $group: {
            _id: "$userId",
            lastSeen: { $max: "$timestamp" },
            location: { $last: "$location" },
            count: { $sum: 1 }
          }
        },
        {
          $lookup: {
            from: "Users",
            localField: "_id",
            foreignField: "_id",
            as: "userInfo"
          }
        },
        {
          $unwind: {
            path: "$userInfo",
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $project: {
            _id: 0,
            userId: "$_id",
            name: { $ifNull: ["$userInfo.name", "Utilisateur"] },
            profilePicture: { $ifNull: ["$userInfo.profilePicture", null] },
            lastSeen: 1,
            location: 1,
            activityCount: "$count"
          }
        },
        { $sort: { lastSeen: -1 } },
        { $limit: 20 }
      ]);
      
      // Calculer la distance pour chaque utilisateur
      const users = activeUsers.map(user => {
        if (!user.location || !user.location.coordinates) return user;
        
        const distance = calculateDistance(
          producerLocation.coordinates[1],
          producerLocation.coordinates[0],
          user.location.coordinates[1],
          user.location.coordinates[0]
        );
        
        return {
          ...user,
          distance
        };
      });
      
      res.status(200).json({ activeUsers: users });
    } catch (error) {
      console.error('❌ Erreur dans getActiveUsers:', error);
      res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
  },
  
  /**
   * Récupérer les opportunités d'action pour un producteur
   * @route GET /api/heatmap/action-opportunities/:producerId
   */
  getActionOpportunities: async (req, res) => {
    try {
      const { producerId } = req.params;
      const radiusM = 2000; // Radius for nearby traffic analysis (e.g., 2km)
      const timespan = '30d'; // Default timespan for analysis (e.g., 30 days)

      // --- Validation & Producer Info --- 
      if (!producerId || !mongoose.Types.ObjectId.isValid(producerId)) {
        return res.status(400).json({ message: 'ID du producteur valide requis' });
      }
      const producerResult = await findProducerInAnyCollection(producerId);
      if (!producerResult) {
        return res.status(404).json({ message: 'Producteur non trouvé' });
      }
      const { producer, type: producerType } = producerResult;

      // Get producer location (essential for nearby analysis)
      let producerLocationCoords;
      if (producer.location?.coordinates?.length === 2) {
        producerLocationCoords = producer.location.coordinates; // GeoJSON [lng, lat]
      } else if (producer.coordinates?.longitude && producer.coordinates?.latitude) {
        producerLocationCoords = [producer.coordinates.longitude, producer.coordinates.latitude];
      } else if (producer.longitude && producer.latitude) {
        producerLocationCoords = [producer.longitude, producer.latitude];
      } else {
         console.warn(`⚠️ Coordonnées non trouvées pour le producteur ${producerId}`);
         // Proceed without location-based insights if coordinates are missing
      }

      let opportunities = [];
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const startDate = thirtyDaysAgo;

      // --- 1. Analyze Producer-Specific Activities --- 
      const activities = await UserActivity.find({
        producerId,
        timestamp: { $gte: startDate }
      }).lean();

      // 1a. Peak Hours (Producer Interactions)
      const activityHourCounts = Array(24).fill(0);
      activities.forEach(activity => { activityHourCounts[new Date(activity.timestamp).getHours()]++; });
      const activityPeakHours = activityHourCounts.map((count, hour) => ({ hour, count })).sort((a, b) => b.count - a.count).slice(0, 3).map(item => item.hour);
      if (activityPeakHours.length > 0 && activityHourCounts[activityPeakHours[0]] > 0) {
          opportunities.push({
            type: 'producer_peak_hours',
            title: 'Vos Heures de Pointe (Interactions)',
            description: `Votre profil/offres génèrent le plus d'engagement vers ${activityPeakHours.map(h => `${h}h`).join(', ')}`,
            actionable: true,
            action: 'Adaptez vos publications ou offres spéciales pendant ces heures.'
          });
      }

      // 1b. Peak Days (Producer Interactions)
      const activityDayCounts = Array(7).fill(0);
      activities.forEach(activity => { activityDayCounts[new Date(activity.timestamp).getDay()]++; });
      const daysOfWeek = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']; // Consistent naming
      const activityPeakDays = activityDayCounts.map((count, day) => ({ day: daysOfWeek[day], count })).sort((a, b) => b.count - a.count).slice(0, 2).filter(item => item.count > 0).map(item => item.day);
       if (activityPeakDays.length > 0) {
           opportunities.push({
             type: 'producer_peak_days',
             title: 'Vos Jours les Plus Actifs (Interactions)',
             description: `Votre profil/offres reçoivent le plus d'attention le ${activityPeakDays.join(' et le ')}`,
             actionable: true,
             action: 'Planifiez vos communications ou événements majeurs ces jours-là.'
           });
       }

      // 1c. Popular Searches Leading to Producer (if tracked)
      // This requires UserActivity to sometimes store the search query *when* a user clicks on this producer from search results.
      // For now, we'll adapt the previous logic which looked at *all* searches near the producer.
       const searchQueries = activities.filter(a => a.action === 'search' && a.query).map(a => a.query);
       if (searchQueries.length > 0) {
          const queryCounts = {};
          searchQueries.forEach(query => { queryCounts[query] = (queryCounts[query] || 0) + 1; });
          const popularQueries = Object.entries(queryCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([query]) => query);
          if (popularQueries.length > 0) {
            opportunities.push({
              type: 'popular_searches',
              title: 'Recherches Populaires Associées',
              description: `Certains utilisateurs vous trouvent via: ${popularQueries.join(', ')}`,
              actionable: true,
              action: 'Vérifiez que votre profil met bien en avant ces termes.'
            });
          }
       }

      // --- 2. Analyze General Nearby Location Data (If coordinates exist) ---
      if (producerLocationCoords) {
          try {
              const nearbyTrafficAggregation = [
                  { $match: { 
                      location: { $geoWithin: { $centerSphere: [ producerLocationCoords, radiusM / 6378100 ] }}, 
                      timestamp: { $gte: startDate } 
                  } },
                  { $project: { 
                      hour: { $hour: "$timestamp" }, 
                      dayOfWeek: { $dayOfWeek: "$timestamp" } // 1=Sun, 7=Sat
                  } },
                  { $facet: {
                      "hourly": [ { $group: { _id: "$hour", count: { $sum: 1 } } }, { $sort: { count: -1 } } ],
                      "daily": [ { $group: { _id: "$dayOfWeek", count: { $sum: 1 } } }, { $sort: { count: -1 } } ]
                  }}
              ];
              const [nearbyTrafficResults] = await LocationHistory.aggregate(nearbyTrafficAggregation);

              // 2a. Peak Hours (General Traffic Nearby)
              if (nearbyTrafficResults?.hourly?.length > 0) {
                  const trafficPeakHours = nearbyTrafficResults.hourly.slice(0, 3).map(item => item._id);
                  if (trafficPeakHours.length > 0 && nearbyTrafficResults.hourly[0].count > 0) {
                     opportunities.push({
                         type: 'nearby_peak_hours',
                         title: 'Heures de Pointe (Passage à Proximité)',
                         description: `Le plus de passage près de chez vous est observé vers ${trafficPeakHours.map(h => `${h}h`).join(', ')}`,
                         actionable: true,
                         action: 'Profitez de ces créneaux pour attirer les passants (promotions flash, vitrine attractive...).'
                     });
                  }
              }

              // 2b. Peak Days (General Traffic Nearby)
              if (nearbyTrafficResults?.daily?.length > 0) {
                  const dayMapping = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']; // Map 1-7 to names
                  const trafficPeakDays = nearbyTrafficResults.daily.slice(0, 2).filter(item => item.count > 0).map(item => dayMapping[item._id - 1]);
                  if (trafficPeakDays.length > 0) {
                      opportunities.push({
                          type: 'nearby_peak_days',
                          title: 'Jours de Pointe (Passage à Proximité)',
                          description: `Les jours avec le plus de passage près de chez vous sont ${trafficPeakDays.join(' et ')}`,
                          actionable: true,
                          action: 'Intensifiez vos opérations ou promotions ces jours-là.'
                      });
                  }
              }

          } catch (aggError) {
              console.error(`❌ Erreur lors de l'agrégation du trafic proche pour ${producerId}:`, aggError);
          }
      }

      // --- 3. Generic Producer Type Recommendations --- 
      if (producerType === 'restaurant') {
        opportunities.push({ type: 'menu_suggestion', title: 'Suggestion Menu', description: 'Envisagez une mise à jour saisonnière de votre menu.', actionable: true, action: 'Ajoutez des plats de saison.' });
      } else if (producerType === 'leisure') {
        opportunities.push({ type: 'event_suggestion', title: 'Suggestion Événement', description: 'Les événements en soirée engagent souvent plus.', actionable: true, action: 'Planifiez un événement nocturne.' });
      } else if (producerType === 'wellness') {
        opportunities.push({ type: 'service_suggestion', title: 'Suggestion Service', description: 'Les services de relaxation sont souvent recherchés.', actionable: true, action: 'Mettez en avant vos offres de relaxation.' });
      }

      // --- Generate Dynamic "AI" Insights based on calculated data ---
      let aiInsights = [];

      // Insight about peak interaction times
      if (activityPeakHours.length > 0) {
        aiInsights.push({
           title: "Optimisation des Horaires d'Interaction",
           insights: [
              `Vos pics d'engagement sont vers ${activityPeakHours.map(h => `${h}h`).join(', ')}.`, 
              `Publiez vos contenus ou offres spéciales durant ces créneaux pour maximiser la visibilité.`, 
              `Analysez si ces heures correspondent à vos heures d'ouverture actuelles.`
           ]
        });
      }

      // Insight about peak traffic days
      if (trafficPeakDays.length > 0) {
        aiInsights.push({
          title: "Capitaliser sur les Jours de Fort Passage",
          insights: [
            `Les ${trafficPeakDays.join(' et ')} sont les jours avec le plus de passage détecté à proximité.`, 
            `Assurez-vous d'avoir assez de personnel et de stock ces jours-là.`, 
            `Envisagez des promotions "spécial ${trafficPeakDays[0]}" pour attirer les passants.`
          ]
        });
      }

      // Insight about popular searches
      if (popularQueries.length > 0) {
        aiInsights.push({
          title: "Alignement avec les Recherches Utilisateurs",
          insights: [
             `Les termes "${popularQueries.join('", "')}" apparaissent dans les recherches menant à votre profil.`, 
             `Vérifiez que votre menu/description/services reflètent bien ces mots-clés.`, 
             `Utilisez ces termes dans vos prochaines publications pour améliorer votre SEO local.`
          ]
        });
      }

      // Generic insight based on producer type
      if (producerType === 'restaurant') {
        aiInsights.push({
          title: "Tendances Gastronomiques",
          insights: [
            "Les options végétariennes et locales gagnent en popularité.", 
            "La livraison et la vente à emporter restent des canaux importants.", 
            "Pensez à une offre 'menu du jour' attractive pour le midi."
          ]
        });
      } else if (producerType === 'leisure') {
         aiInsights.push({
           title: "Dynamiser l'Expérience Loisir",
           insights: [
             "Les ateliers thématiques ou événements spéciaux attirent une nouvelle clientèle.", 
             "Proposez des offres combinées ou des tarifs de groupe.", 
             "Mettez en avant les aspects uniques de votre activité sur les réseaux sociaux."
           ]
         });
      } else if (producerType === 'wellness') {
         aiInsights.push({
           title: "Focus Bien-Être",
           insights: [
             "Les offres de relaxation et gestion du stress sont porteuses.", 
             "Proposez des forfaits découvertes pour attirer de nouveaux clients.", 
             "Communiquez sur les bienfaits spécifiques de vos services."
           ]
         });
      }

      // Add a default insight if none were generated
      if (aiInsights.length === 0) {
         aiInsights.push({
           title: "Analyse Générale",
           insights: [
             "Continuez à surveiller vos statistiques pour identifier des tendances.",
             "Engagez votre communauté avec du contenu régulier et pertinent.",
             "Sollicitez les avis de vos clients pour améliorer vos services."
           ]
         });
      }

      // --- Combine Opportunities (Simulated AI + Rule-based) ---
      // For simplicity, we'll just return the aiInsights directly now.
      // In a real scenario, you might merge/prioritize.
      
      // Replace the old opportunities array with the new aiInsights format
      // res.status(200).json({ actionOpportunities: opportunities }); 
      res.status(200).json({ aiInsights: aiInsights }); // Use the new key 'aiInsights'

    } catch (error) {
      console.error('❌ Erreur dans getActionOpportunities:', error);
      res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
  },
  
  /**
   * Récupérer l'emplacement d'un producteur
   * @route GET /api/producers/:producerId/location
   */
  getProducerLocation: async (req, res) => {
    try {
      const { producerId } = req.params;
      
      // Validation
      if (!producerId) {
        return res.status(400).json({ message: 'ID du producteur requis' });
      }
      
      // Trouver le producteur
      const producerResult = await findProducerInAnyCollection(producerId);
      if (!producerResult) {
        return res.status(404).json({ message: 'Producteur non trouvé' });
      }
      
      const { producer } = producerResult;
      
      // Récupérer les coordonnées du producteur
      let locationData = {};
      
      if (producer.location && producer.location.coordinates) {
        locationData = {
          latitude: producer.location.coordinates[1],
          longitude: producer.location.coordinates[0]
        };
      } else if (producer.coordinates) {
        locationData = {
          latitude: producer.coordinates.latitude,
          longitude: producer.coordinates.longitude
        };
      } else if (producer.latitude && producer.longitude) {
        locationData = {
          latitude: producer.latitude,
          longitude: producer.longitude
        };
      } else {
        return res.status(400).json({ message: 'Coordonnées du producteur non disponibles' });
      }
      
      res.status(200).json(locationData);
    } catch (error) {
      console.error('❌ Erreur dans getProducerLocation:', error);
      res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
  },

  /**
   * Récupérer les recherches récentes à proximité d'un producteur
   * @route GET /api/heatmap/nearby-searches/:producerId
   */
  getNearbySearches: async (req, res) => {
    try {
      const { producerId } = req.params;
      const { radius = 5000, limit = 30, timeframe = '60m' } = req.query;

      // Validation
      if (!producerId || !mongoose.Types.ObjectId.isValid(producerId)) {
        return res.status(400).json({ message: 'ID du producteur valide requis' });
      }

      // Trouver le producteur pour obtenir ses coordonnées
      const producerResult = await findProducerInAnyCollection(producerId);
      if (!producerResult) {
        return res.status(404).json({ message: 'Producteur non trouvé' });
      }
      const { producer } = producerResult;

      // Récupérer les coordonnées du producteur
      let producerLocationCoords;
      if (producer.location?.coordinates?.length === 2) {
        producerLocationCoords = producer.location.coordinates; // GeoJSON [lng, lat]
      } else if (producer.coordinates?.longitude && producer.coordinates?.latitude) {
        producerLocationCoords = [producer.coordinates.longitude, producer.coordinates.latitude];
      } else if (producer.longitude && producer.latitude) {
        producerLocationCoords = [producer.longitude, producer.latitude];
      } else {
        console.warn(`⚠️ Coordonnées non trouvées pour le producteur ${producerId} dans getNearbySearches`);
        return res.status(400).json({ message: 'Coordonnées du producteur non disponibles pour la recherche de proximité' });
      }

      // Définir la période de temps pour "récent"
      const now = new Date();
      let startTime = new Date(now);
      const timeValue = parseInt(timeframe.slice(0, -1), 10);
      const timeUnit = timeframe.slice(-1);
      if (timeUnit === 'm') {
        startTime.setMinutes(now.getMinutes() - timeValue);
      } else if (timeUnit === 'h') {
        startTime.setHours(now.getHours() - timeValue);
      } else {
        startTime.setMinutes(now.getMinutes() - 60); // Default to 60 minutes
      }
      
      const radiusM = parseInt(radius, 10);
      const resultLimit = parseInt(limit, 10);

      // Récupérer les activités de recherche récentes à proximité
      const recentSearches = await UserActivity.find({
        action: 'search',
        timestamp: { $gte: startTime },
        location: {
          $nearSphere: {
            $geometry: {
              type: 'Point',
              coordinates: producerLocationCoords
            },
            $maxDistance: radiusM 
          }
        }
      })
      .sort({ timestamp: -1 })
      .limit(resultLimit)
      .select('userId query location timestamp') // Sélectionner les champs nécessaires
      .lean(); // Utiliser lean pour de meilleures performances

      // Formatter pour correspondre à NearbySearchEvent du frontend si nécessaire
      // Actuellement, les noms de champs semblent correspondre
      const formattedSearches = recentSearches.map(search => ({
        userId: search.userId?.toString(), // S'assurer que l'ID est une chaîne
        query: search.query,
        // Renvoyer la structure de localisation telle quelle ou extraire lat/lng
        location: search.location, // Ou: { latitude: search.location.coordinates[1], longitude: search.location.coordinates[0] },
        timestamp: search.timestamp
      }));

      res.status(200).json({ nearbySearches: formattedSearches });

    } catch (error) {
      console.error('❌ Erreur dans getNearbySearches:', error);
      if (error.name === 'MongoServerError' && error.code === 13038) { // Error code for $nearSphere needing 2dsphere index
         console.error('   Hint: Missing 2dsphere index on userActivities.location');
         return res.status(500).json({ message: 'Erreur de base de données: Index géospatial manquant sur UserActivity.', code: 'DB_GEO_INDEX_MISSING' });
      }
      res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
  }
};

// Fonction utilitaire pour calculer la distance en mètres entre deux points de coordonnées
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Rayon de la Terre en mètres
  const φ1 = lat1 * Math.PI/180; // φ, λ en radians
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  const d = R * c; // en mètres
  return d;
}

// Fonction pour générer des zones chaudes à partir de points d'activité
function generateHotZones(producerCoordinates, activityPoints) {
  // Si pas assez de points, retourner une liste vide
  if (!activityPoints || activityPoints.length < 5) {
    return [];
  }
  
  // Regrouper les points par grille
  const grid = {};
  const gridSize = 0.001; // Approximativement 100m
  
  activityPoints.forEach(point => {
    if (!point.location || !point.location.coordinates) return;
    
    const coords = point.location.coordinates;
    const latGrid = Math.floor(coords[1] / gridSize);
    const lngGrid = Math.floor(coords[0] / gridSize);
    const gridKey = `${latGrid},${lngGrid}`;
    
    if (!grid[gridKey]) {
      grid[gridKey] = {
        points: [],
        center: {
          type: 'Point',
          coordinates: [0, 0]
        }
      };
    }
    
    grid[gridKey].points.push(point);
  });
  
  // Calculer le centre et l'intensité de chaque zone
  const hotZones = [];
  
  Object.keys(grid).forEach(gridKey => {
    const zone = grid[gridKey];
    const points = zone.points;
    
    // Calculer le centre moyen
    let sumLat = 0, sumLng = 0;
    points.forEach(point => {
      sumLat += point.location.coordinates[1];
      sumLng += point.location.coordinates[0];
    });
    
    const centerLat = sumLat / points.length;
    const centerLng = sumLng / points.length;
    
    // Mettre à jour le centre
    zone.center.coordinates = [centerLng, centerLat];
    
    // Calculer l'intensité basée sur le nombre de points
    const intensity = Math.min(points.length / 10, 1.0);
    
    // Calculer le rayon en fonction de la dispersion des points
    let maxDistance = 0;
    points.forEach(point => {
      const distance = calculateDistance(
        centerLat, centerLng,
        point.location.coordinates[1], point.location.coordinates[0]
      );
      maxDistance = Math.max(maxDistance, distance);
    });
    
    // Rayon minimum de 50m, maximum de 300m
    const radius = Math.max(50, Math.min(maxDistance * 1.2, 300));
    
    // Ajouter la zone à la liste
    hotZones.push({
      center: zone.center,
      intensity,
      radius,
      points: points.length
    });
  });
  
  // Trier par intensité décroissante et limiter le nombre de zones
  return hotZones
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, 10);
}

module.exports = heatmapController; 