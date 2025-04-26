const mongoose = require('mongoose');
const { createModel, databases } = require('../utils/modelCreator');
const User = require('../models/User');
// Remove the potentially problematic require if UserActivity is defined below
// const UserActivity = require('../models/UserActivity'); 
const constants = require('../utils/constants');

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
  let producerDoc = await Producer.findById(id).lean(); // Use lean()
  if (producerDoc) return { producer: producerDoc, type: 'restaurant' };
  
  // Chercher dans la base de loisirs
  producerDoc = await LeisureProducer.findById(id).lean(); // Use lean()
  if (producerDoc) return { producer: producerDoc, type: 'leisure' };
  
  // Chercher dans la base de bien-être
  producerDoc = await WellnessProducer.findById(id).lean(); // Use lean()
  if (producerDoc) return { producer: producerDoc, type: 'wellness' };
  
  return null;
}

// +++ ADDED: Helper function to get LatLng from producer doc +++
function getProducerLatLng(producerDoc) {
   let latitude = null;
   let longitude = null;

   if (!producerDoc) return null;

   // 1. Check geometry.location first
   if (producerDoc.geometry?.location?.lat != null && producerDoc.geometry?.location?.lng != null) {
     latitude = producerDoc.geometry.location.lat;
     longitude = producerDoc.geometry.location.lng;
   }
   // 2. If not found, check gps_coordinates (GeoJSON format: [longitude, latitude])
   else if (producerDoc.gps_coordinates?.coordinates?.length === 2) {
     longitude = producerDoc.gps_coordinates.coordinates[0];
     latitude = producerDoc.gps_coordinates.coordinates[1];
   }

   // Convert to numbers just in case
   latitude = typeof latitude === 'string' ? parseFloat(latitude) : latitude;
   longitude = typeof longitude === 'string' ? parseFloat(longitude) : longitude;

   if (typeof latitude === 'number' && !isNaN(latitude) && typeof longitude === 'number' && !isNaN(longitude)) {
     return { latitude, longitude };
   } else {
     return null; // Location not found or invalid
   }
}
// +++ END ADDED +++

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
      const { latitude, longitude, radius = '2000', limit = '50', timespan = '90d' } = req.query; // Default to 90d

      if (!latitude || !longitude) {
        return res.status(400).json({ message: 'Les paramètres latitude et longitude sont requis.' });
      }
      // Validate inputs
      if (isNaN(parseFloat(latitude)) || isNaN(parseFloat(longitude)) || isNaN(parseInt(radius, 10)) || isNaN(parseInt(limit, 10))) {
         return res.status(400).json({ message: 'Paramètres numériques invalides (latitude, longitude, radius, limit).' });
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
                 // Use coordinates directly from request
                 $centerSphere: [ [lng, lat], radiusM / constants.EARTH_RADIUS_METERS ] // radius in radians
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
              // Using constants for grid size
              latGrid: { $floor: { $divide: ["$location.coordinates.1", constants.HEATMAP_GRID_SIZE_DEGREES] } },
              lngGrid: { $floor: { $divide: ["$location.coordinates.0", constants.HEATMAP_GRID_SIZE_DEGREES] } }
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
            // Use a constant for normalization divisor, e.g., MAX_EXPECTED_COUNT_PER_CELL
            intensity: { $min: [{ $divide: ["$count", constants.HEATMAP_INTENSITY_NORMALIZATION] }, 1] },
            visitorCount: { $size: "$userIds" },
            timestamps: 1 // Pass timestamps to the next stage (or process here)
          }
        },
        // Stage 4: Sort by intensity and limit results
        { $sort: { intensity: -1 } },
        { $limit: resultLimit }
      ];

      const aggregatedHotspots = await LocationHistory.aggregate(aggregationPipeline);

      // Enrich hotspots with calculated distributions, recommendations, and final ID/name
      const hotspots = aggregatedHotspots.map(spot => {
        // Calculate distributions from collected timestamps
        const { timeDistribution, dayDistribution } = calculateDistributions(spot.timestamps);

        // Generate recommendations based on distributions and intensity
        const recommendations = [];
        const intensity = spot.intensity;

        // Define helper functions locally or import if reused elsewhere
        const _getBestTimeSlot = (dist) => {
            let maxValue = 0; let bestTime = '';
            // Use descriptive keys for clarity
            const timeMap = { morning: 'en matinée (6h-12h)', afternoon: 'l\'après-midi (12h-18h)', evening: 'en soirée (18h-0h)', night: 'la nuit (0h-6h)' }; // Adjusted evening range
            // Iterate through the expected keys
            for (const key of ['morning', 'afternoon', 'evening', 'night']) {
                const value = dist[key] || 0; // Handle potentially missing keys
                // Use a meaningful threshold, e.g., constants.RECOMMENDATION_TIME_THRESHOLD
                if (value > maxValue && value > constants.RECOMMENDATION_TIME_THRESHOLD) {
                    maxValue = value; bestTime = key;
                }
            }
            return timeMap[bestTime] || '';
        };

        const _getBestDay = (dist) => {
            let maxValue = 0; let bestDayKey = '';
            const dayMap = { sunday: 'Dimanche', monday: 'Lundi', tuesday: 'Mardi', wednesday: 'Mercredi', thursday: 'Jeudi', friday: 'Vendredi', saturday: 'Samedi' };
            // Iterate through the expected keys
            for (const key of ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']) {
                 const value = dist[key] || 0; // Handle potentially missing keys
                 // Use a meaningful threshold, e.g., constants.RECOMMENDATION_DAY_THRESHOLD
                 if (value > maxValue && value > constants.RECOMMENDATION_DAY_THRESHOLD) {
                    maxValue = value; bestDayKey = key;
                 }
            }
            return dayMap[bestDayKey] || '';
        };


        const bestTime = _getBestTimeSlot(timeDistribution);
        if (bestTime) {
          recommendations.push({
            title: 'Optimisez vos Horaires',
            description: `La zone est populaire ${bestTime}. Adaptez vos promotions ou personnel pendant ces pics.`,
            type: 'time_peak' // Consistent type naming
          });
        }

        const bestDay = _getBestDay(dayDistribution);
        if (bestDay) {
          recommendations.push({
            title: 'Jour de Forte Affluence',
            description: `Le ${bestDay} semble être clé. Envisagez des offres spéciales ou événements ce jour-là.`,
            type: 'day_peak' // Consistent type naming
          });
        }

        // Use constants for intensity thresholds
        if (intensity > constants.RECOMMENDATION_INTENSITY_HIGH) {
          recommendations.push({
            title: 'Zone à Fort Potentiel',
            description: 'Cette zone montre une forte activité globale. C\'est un bon endroit pour des actions marketing ciblées.',
            type: 'high_potential' // Consistent type naming
          });
        } else if (intensity < constants.RECOMMENDATION_INTENSITY_LOW) {
          recommendations.push({
            title: 'Zone Calme',
            description: 'L\'activité semble faible ici. Concentrez peut-être vos efforts sur d\'autres zones plus dynamiques.',
            type: 'low_activity' // Consistent type naming
          });
        }

        if (recommendations.length === 0) {
           recommendations.push({ title: 'Données Stables', description: 'L\'activité dans cette zone est stable, sans pic majeur détecté.', type: 'stable' });
        }

        // Generate final hotspot object including recommendations
        return {
          id: new mongoose.Types.ObjectId().toString(), // Generate unique ID
          latitude: spot.latitude,
          longitude: spot.longitude,
          // Generate a more meaningful name if possible, e.g., based on reverse geocoding or nearby landmarks (complex)
          zoneName: `Zone (${spot.latitude.toFixed(3)}, ${spot.longitude.toFixed(3)})`, // Simple zone name for now
          intensity: spot.intensity,
          visitorCount: spot.visitorCount,
          // weight: spot.intensity, // weight might be redundant if same as intensity - REMOVED, use intensity
          timeDistribution: timeDistribution,
          dayDistribution: dayDistribution,
          recommendations: recommendations // <-- Include generated recommendations
        };
      });

      res.status(200).json(hotspots);
    } catch (error) { // Added catch block
      console.error('❌ Erreur dans getHotspots:', error);
      if (error.code === 51024 || error.message.includes('unable to find index for $geoNear query')) { // More robust index error check
         console.error('   Hint: Missing 2dsphere index on locationHistories.location');
         return res.status(500).json({ message: 'Erreur de base de données: Index géospatial manquant sur locationHistories.', code: 'DB_GEO_INDEX_MISSING' });
      }
      res.status(500).json({ message: 'Erreur serveur lors de la récupération des hotspots', error: error.message });
    }
  },

  /**
   * Récupérer les données de heatmap en temps réel pour un producteur
   * @route GET /api/heatmap/realtime/:producerId
   */
  getRealtimeHeatmap: async (req, res) => {
    try {
      const { producerId } = req.params;
      const { radius = 500, timespan = '1h' } = req.query; // Adjust defaults

      // 1. Find the producer and get its location
      const producerData = await findProducerInAnyCollection(producerId);
      if (!producerData || !producerData.producer) {
        return res.status(404).json({ message: 'Producteur non trouvé.' });
      }
      // --- MODIFIED: Use helper function to get location --- 
      const producerLocation = getProducerLatLng(producerData.producer);
      if (!producerLocation) {
        return res.status(404).json({ message: 'Localisation du producteur introuvable.' });
      }
      // --- END MODIFIED ---

      // 2. Define time range (e.g., last hour)
      const now = new Date();
      let startTime = new Date(now);
      if (timespan === '1h') startTime.setHours(now.getHours() - 1);
      else if (timespan === '3h') startTime.setHours(now.getHours() - 3);
      else if (timespan === '6h') startTime.setHours(now.getHours() - 6);
      // Add more options as needed
      const timeFilter = { timestamp: { $gte: startTime } };

      // 3. Query LocationHistory within radius and timeframe
      const recentLocations = await LocationHistory.find({
        location: {
          $nearSphere: {
            $geometry: {
              type: "Point",
              // --- MODIFIED: Use fetched producer location --- 
              coordinates: [producerLocation.longitude, producerLocation.latitude]
              // --- END MODIFIED ---
            },
            $maxDistance: parseInt(radius, 10)
          }
        },
        ...timeFilter
      })
      .select('location userId') // Select necessary fields
      .lean();

      // 4. Process results (e.g., simple count or basic clustering)
      // Example: Return list of unique users and their last known coordinates
      const uniqueUsers = {};
      recentLocations.forEach(loc => {
         if (!loc.userId) return; // Skip entries without user ID
         const userIdStr = loc.userId.toString();
         // Keep the latest location for each user
         if (!uniqueUsers[userIdStr] || loc.timestamp > (uniqueUsers[userIdStr].timestamp || 0)) {
             uniqueUsers[userIdStr] = {
               userId: userIdStr,
               latitude: loc.location?.coordinates?.[1],
               longitude: loc.location?.coordinates?.[0],
               timestamp: loc.timestamp // Keep timestamp if needed
             };
         }
      });

      // Remove invalid points
      const activeUsersList = Object.values(uniqueUsers).filter(u => u.latitude != null && u.longitude != null);

      res.status(200).json({ activeUsers: activeUsersList, count: activeUsersList.length });

    } catch (error) {
      console.error('❌ Error in getRealtimeHeatmap:', error);
      res.status(500).json({ message: 'Erreur serveur lors de la récupération de la heatmap temps réel.', error: error.message });
    }
  },

  /**
   * Récupérer les utilisateurs actifs autour d'un producteur
   * @route GET /api/heatmap/active-users/:producerId
   * @requires auth
   */
  getActiveUsers: async (req, res) => {
    try {
      const { producerId } = req.params;
      const { radius = 1000, minutes = 15 } = req.query; // Default: 1km radius, last 15 minutes

      // 1. Find the producer and get its location
      const producerData = await findProducerInAnyCollection(producerId);
      if (!producerData || !producerData.producer) {
        return res.status(404).json({ message: 'Producteur non trouvé.' });
      }
      // --- MODIFIED: Use helper function to get location --- 
      const producerLocation = getProducerLatLng(producerData.producer);
      if (!producerLocation) {
        return res.status(404).json({ message: 'Localisation du producteur introuvable.' });
      }
      // --- END MODIFIED ---
      
      // 2. Define time range
      const now = new Date();
      const startTime = new Date(now.getTime() - parseInt(minutes, 10) * 60000); // minutes ago
      const timeFilter = { timestamp: { $gte: startTime } };

      // 3. Find recent location history within the radius and time
      const recentLocations = await LocationHistory.find({
        location: {
          $nearSphere: {
            $geometry: {
              type: "Point",
              // --- MODIFIED: Use fetched producer location --- 
              coordinates: [producerLocation.longitude, producerLocation.latitude]
              // --- END MODIFIED ---
            },
            $maxDistance: parseInt(radius, 10)
          }
        },
        ...timeFilter,
        userId: { $exists: true } // Only entries with a user ID
      })
      .sort({ userId: 1, timestamp: -1 }) // Sort to easily pick the latest per user
      .select('location userId timestamp')
      .lean();

      // 4. Get the latest location for each unique user
      const latestUserLocations = {};
      for (const loc of recentLocations) {
          const userIdStr = loc.userId.toString();
          if (!latestUserLocations[userIdStr]) { // Only store the first (latest) record found per user
              latestUserLocations[userIdStr] = {
                  userId: userIdStr,
                  location: loc.location,
                  lastSeen: loc.timestamp
              };
          }
      }
      const userIds = Object.keys(latestUserLocations);

      // 5. Fetch user details (name, profile picture) for these users
      const users = await User.find({ _id: { $in: userIds } })
                            .select('_id name profilePicture')
                            .lean();

      // 6. Combine user details with their latest location
      const activeUsers = users.map(user => {
        const locData = latestUserLocations[user._id.toString()];
        return {
          userId: user._id,
          name: user.name,
          profilePicture: user.profilePicture,
          location: locData.location, // GeoJSON Point
          lastSeen: locData.lastSeen,
          // Optionally calculate distance here if needed
          // distance: calculateDistance(producerLat, producerLng, locData.location?.coordinates?.[1], locData.location?.coordinates?.[0])
        };
      }).filter(u => u.location?.coordinates?.[0] != null && u.location?.coordinates?.[1] != null); // Filter out users with invalid final locations

      res.status(200).json(activeUsers);

    } catch (error) {
      console.error('❌ Error in getActiveUsers:', error);
      res.status(500).json({ message: 'Erreur serveur lors de la récupération des utilisateurs actifs.', error: error.message });
    }
  },

  /**
   * Récupérer les opportunités d'action pour un producteur basées sur l'historique de localisation
   * @route GET /api/heatmap/action-opportunities/:producerId
   * @requires auth
   */
  getActionOpportunities: async (req, res) => {
    try {
      const { producerId } = req.params;
      const { radius = 2000 } = req.query; // Default 2km

      // 1. Find the producer and get its location
      const producerData = await findProducerInAnyCollection(producerId);
      if (!producerData || !producerData.producer) {
        return res.status(404).json({ message: 'Producteur non trouvé.' });
      }
      // --- MODIFIED: Use helper function to get location --- 
      const producerLocation = getProducerLatLng(producerData.producer);
      if (!producerLocation) {
        return res.status(404).json({ message: 'Localisation du producteur introuvable.' });
      }
      // --- END MODIFIED ---

      // --- Logic to fetch data and generate insights --- 
      // This part requires significant domain logic. 
      // Example: Fetch hotspots, active users, recent searches, 
      // competitor data, weather, local events etc.
      // Then apply rules or potentially a simple ML model to generate insights.

      // --- Placeholder Example Insights --- 
      // In a real app, these would be dynamically generated based on data analysis.
       const opportunities = [
        {
          type: 'opportunity',
          title: 'Pic d\'activité le soir en semaine',
          insights: [
            'Augmentation notable des visites entre 18h et 21h du lundi au jeudi.',
            'Envisagez une promotion \"Happy Hour\" pour attirer encore plus de monde.',
            'Ciblez les notifications push pendant ces créneaux.'
          ]
        },
        {
          type: 'trend',
          title: 'Popularité croissante des plats végétariens',
          insights: [
            'Les recherches pour \"végétarien\" à proximité ont augmenté de 25% ce mois-ci.',
            'Ajoutez ou mettez en avant vos options végétariennes sur le menu.'
          ]
        },
        {
          type: 'high_traffic',
          title: 'Zone \"Place Centrale\" très fréquentée le Samedi après-midi',
          insights: [
            'Beaucoup d\'utilisateurs actifs détectés près de la Place Centrale le samedi après-midi.',
            'Une offre ciblée géographiquement sur cette zone pourrait être efficace.'
          ]
        },
         {
           type: 'warning',
           title: 'Baisse d\'activité le Dimanche midi',
           insights: [
             'Le nombre de visites le dimanche midi a diminué par rapport au mois dernier.',
             'Analysez les raisons possibles (concurrence, menu, événement local?).',
             'Testez une offre spéciale \"Brunch du Dimanche\".'
           ]
         }
      ];
      // --- End Placeholder --- 

      res.status(200).json(opportunities);

    } catch (error) {
      console.error('❌ Error in getActionOpportunities:', error);
      res.status(500).json({ message: 'Erreur serveur lors de la récupération des opportunités.', error: error.message });
    }
  },

  /**
   * Récupérer l'emplacement d'un producteur
   * @route GET /api/producers/:producerId/location
   */
  getProducerLocation: async (req, res) => {
    // This implementation looks fine
    try {
      const { producerId } = req.params;
      const producerData = await findProducerInAnyCollection(producerId);

      if (!producerData || !producerData.producer.location || !producerData.producer.location.coordinates) {
        // Fallback to User model only if producerId is a valid ObjectId and might represent a user
        if (mongoose.Types.ObjectId.isValid(producerId)) {
            const user = await User.findById(producerId).select('currentLocation');
            if (user && user.currentLocation && user.currentLocation.coordinates) {
               console.warn(`WARN: Producer location not found for ${producerId}, using user's current location as fallback.`);
                return res.status(200).json({
                  // Return standard lat/lng fields
                  latitude: user.currentLocation.coordinates[1],
                  longitude: user.currentLocation.coordinates[0]
                });
            }
        }
        // If still not found
        return res.status(404).json({ message: 'Localisation du producteur ou de l\'utilisateur introuvable.' });
      }

      res.status(200).json({
        // Return standard lat/lng fields
        latitude: producerData.producer.location.coordinates[1],
        longitude: producerData.producer.location.coordinates[0]
      });
    } catch (error) {
      console.error('❌ Erreur dans getProducerLocation:', error);
      res.status(500).json({ message: 'Erreur serveur lors de la récupération de la localisation', error: error.message });
    }
  },

  /**
   * Récupérer les recherches récentes à proximité d'un producteur
   * @route GET /api/heatmap/nearby-searches/:producerId
   * @requires auth
   */
  getNearbySearches: async (req, res) => {
     try {
      const { producerId } = req.params;
      const { radius = 1000, minutes = 30 } = req.query; // Default: 1km, last 30 minutes

      // 1. Find the producer and get its location
      const producerData = await findProducerInAnyCollection(producerId);
      if (!producerData || !producerData.producer) {
        return res.status(404).json({ message: 'Producteur non trouvé.' });
      }
      // --- MODIFIED: Use helper function to get location --- 
      const producerLocation = getProducerLatLng(producerData.producer);
      if (!producerLocation) {
        return res.status(404).json({ message: 'Localisation du producteur introuvable.' });
      }
      // --- END MODIFIED ---

      // 2. Define time range
      const now = new Date();
      const startTime = new Date(now.getTime() - parseInt(minutes, 10) * 60000);
      const timeFilter = { timestamp: { $gte: startTime } };

      // 3. Find recent 'search' activities within the radius and time
      // Use UserActivity model here
      const recentSearches = await UserActivity.find({
        action: 'search',
        location: {
          $nearSphere: {
            $geometry: {
              type: "Point",
               // --- MODIFIED: Use fetched producer location --- 
              coordinates: [producerLocation.longitude, producerLocation.latitude]
               // --- END MODIFIED ---
            },
            $maxDistance: parseInt(radius, 10)
          }
        },
        ...timeFilter,
        userId: { $exists: true }
      })
      .sort({ timestamp: -1 }) // Latest searches first
      .select('userId query timestamp') // Add other fields if needed
      .limit(50) // Limit the number of recent searches
      .lean();

      // 4. Get unique user IDs from these searches
      const userIds = [...new Set(recentSearches.map(s => s.userId?.toString()).filter(id => id))];

      // 5. Fetch user details
      const users = await User.find({ _id: { $in: userIds } })
                            .select('_id name profilePicture')
                            .lean();
      const userMap = users.reduce((map, user) => {
          map[user._id.toString()] = user;
          return map;
      }, {});

      // 6. Combine search details with user details
      const nearbySearches = recentSearches.map(search => {
        const user = userMap[search.userId?.toString()];
        if (!user) return null; // Skip if user not found (shouldn't happen ideally)
        return {
          searchId: search._id, // Use the activity ID as searchId
          userId: user._id,
          userName: user.name,
          userProfilePicture: user.profilePicture,
          query: search.query,
          timestamp: search.timestamp,
          // location: search.location // Include search location if needed by frontend
        };
      }).filter(s => s !== null); // Remove null entries

      res.status(200).json(nearbySearches);

    } catch (error) {
      console.error('❌ Error in getNearbySearches:', error);
      res.status(500).json({ message: 'Erreur serveur lors de la récupération des recherches proches.', error: error.message });
    }
  }
}; 

// Fonction utilitaire pour calculer la distance en mètres entre deux points de coordonnées
// This seems okay, using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = constants.EARTH_RADIUS_METERS; // Use constant
  const φ1 = lat1 * Math.PI/180; // φ, λ en radians
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  const d = R * c; // en mètres
  return Math.round(d); // Return rounded meters
}

// Fonction pour générer des zones chaudes à partir de points d'activité
// NOTE: This function doesn't seem to be used by any of the controller methods.
// The `getHotspots` method uses aggregation which calculates zones/grids directly.
// Consider removing this function if it's unused.
function generateHotZones(producerCoordinates, activityPoints) {
  // If not used, this can be removed. Keeping for now in case it's used elsewhere or planned.
  // ... (existing implementation) ...
  console.warn("WARN: generateHotZones function is defined but might be unused in heatmapController."); // Add warning
  return []; // Return empty array if unused for safety
}

module.exports = heatmapController; 