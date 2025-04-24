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
  }, // Added comma

  /**
   * Récupérer les données de heatmap en temps réel pour un producteur
   * @route GET /api/heatmap/realtime/:producerId
   */
  getRealtimeHeatmap: async (req, res) => {
    // Keep the simple 501 implementation as the other was test data
    res.status(501).json({ message: 'Fonctionnalité temps réel non implémentée.' });
  }, // Added comma

  /**
   * Récupérer les utilisateurs actifs autour d'un producteur
   * @route GET /api/heatmap/active-users/:producerId
   * @requires auth
   */
  getActiveUsers: async (req, res) => {
    // Keep the second, more complete implementation
    try {
      const { producerId } = req.params;
      // Use constants for defaults
      const radius = parseInt(req.query.radius, 10) || constants.DEFAULT_ACTIVE_USER_RADIUS_METERS;
      const lastMinutes = parseInt(req.query.lastMinutes, 10) || constants.DEFAULT_ACTIVE_USER_TIMESPAN_MINUTES;

      // 1. Get producer location
      const producerData = await findProducerInAnyCollection(producerId);
      if (!producerData || !producerData.producer.location || !producerData.producer.location.coordinates) {
        return res.status(404).json({ message: 'Localisation du producteur introuvable.' });
      }
      const [prodLng, prodLat] = producerData.producer.location.coordinates;

      // 2. Define search criteria
      const radiusM = radius;
      const timeLimit = new Date(Date.now() - lastMinutes * 60 * 1000);

      // 3. Find users within radius and time limit
      // Ensure User model has a 2dsphere index on currentLocation
      const activeUsers = await User.find({
         // Exclude the producer themselves if they are also a user (if applicable)
         // Ensure producerId is a valid ObjectId before using $ne
        _id: mongoose.Types.ObjectId.isValid(producerId) ? { $ne: new mongoose.Types.ObjectId(producerId) } : undefined,
        currentLocation: {
          $geoWithin: {
            $centerSphere: [[prodLng, prodLat], radiusM / constants.EARTH_RADIUS_METERS] // radius in radians
          }
        },
        lastSeen: { $gte: timeLimit } // Filter by last seen time
      })
      .select('_id name profilePicture currentLocation lastSeen') // Select necessary fields
      // Use constant for limit
      .limit(constants.MAX_ACTIVE_USERS_RETURNED);

      // 4. Format the response
      const formattedUsers = activeUsers.map(user => ({
        userId: user._id, // Consistent naming with frontend
        name: user.name,
        profilePicture: user.profilePicture,
        // Return the standard GeoJSON structure expected by frontend
        location: user.currentLocation,
        lastSeen: user.lastSeen,
        // Calculate distance on backend? Or frontend? Doing it here:
        distance: calculateDistance(prodLat, prodLng, user.currentLocation.coordinates[1], user.currentLocation.coordinates[0])
      }));

      res.status(200).json(formattedUsers); // Return the array directly

    } catch (error) {
      console.error('❌ Erreur dans getActiveUsers:', error);
      if (error.code === 51024 || (error.message && error.message.includes('unable to find index for $geoNear query'))) {
         console.error('   Hint: Missing 2dsphere index on users.currentLocation');
         return res.status(500).json({ message: 'Erreur de base de données: Index géospatial manquant sur users.currentLocation.', code: 'DB_GEO_INDEX_MISSING' });
      }
      res.status(500).json({ message: 'Erreur serveur lors de la récupération des utilisateurs actifs', error: error.message });
    }
  }, // Added comma

  /**
   * Récupérer les opportunités d'action pour un producteur basées sur l'historique de localisation
   * @route GET /api/heatmap/action-opportunities/:producerId
   * @requires auth
   */
  getActionOpportunities: async (req, res) => {
    // Keep the second, more complete implementation
    try {
      const { producerId } = req.params;
      // Use constants for defaults
      const radiusM = parseInt(req.query.radius, 10) || constants.DEFAULT_INSIGHTS_RADIUS_METERS;
      const daysToAnalyze = parseInt(req.query.days, 10) || constants.DEFAULT_INSIGHTS_TIMESPAN_DAYS;

      // 1. Trouver le producteur et sa localisation
      const producerData = await findProducerInAnyCollection(producerId);
      if (!producerData || !producerData.producer || !producerData.producer.location || !producerData.producer.location.coordinates) {
        return res.status(404).json({ message: 'Localisation du producteur introuvable.' });
      }
      const [prodLng, prodLat] = producerData.producer.location.coordinates;

      // 2. Définir la période d'analyse
      const analysisStartDate = new Date();
      analysisStartDate.setDate(analysisStartDate.getDate() - daysToAnalyze);

      // 3. Agréger l'historique de localisation proche
      const aggregationPipeline = [
        // Match documents near the producer within the timeframe
        {
          $match: {
            timestamp: { $gte: analysisStartDate },
            location: {
              $geoWithin: {
                 $centerSphere: [ [prodLng, prodLat], radiusM / constants.EARTH_RADIUS_METERS ] // radius in radians
              }
            }
          }
        },
        // Project hour and dayOfWeek (adjust for timezone if needed)
        {
          $project: {
              // Consider using timezone from producer or user settings if available
             hour: { $hour: { date: "$timestamp", timezone: constants.DEFAULT_TIMEZONE } }, // Example: "Europe/Paris"
             dayOfWeek: { $dayOfWeek: { date: "$timestamp", timezone: constants.DEFAULT_TIMEZONE } } // 1=Sun, 7=Sat
          }
        },
        // Group by hour and day to count occurrences
        {
          $group: {
            _id: {
              hour: "$hour",
              dayOfWeek: "$dayOfWeek"
            },
            count: { $sum: 1 }
          }
        },
        // Sort for easier processing (optional but can help)
        { $sort: { "_id.dayOfWeek": 1, "_id.hour": 1 } }
      ];

      const activityData = await LocationHistory.aggregate(aggregationPipeline);

      // 4. Analyser les données agrégées pour générer des insights
      const insights = [];
      if (activityData.length < constants.MIN_ACTIVITY_POINTS_FOR_INSIGHTS) { // Use constant
        insights.push({ title: "Peu de Données Locales", insights: ["Pas assez de données de localisation récentes à proximité pour générer des insights détaillés.", `Seulement ${activityData.length} points trouvés (minimum ${constants.MIN_ACTIVITY_POINTS_FOR_INSIGHTS} requis).`], type: "warning" });
      } else {
        // Calculate total counts per time slot and day
        let timeCounts = { morning: 0, afternoon: 0, evening: 0, night: 0 }; // Matin: 6-12, Aprem: 12-18, Soir: 18-24, Nuit: 0-6
        let dayCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 }; // Sun-Sat (based on $dayOfWeek)
        let totalActivity = 0;

        activityData.forEach(item => {
          const hour = item._id.hour;
          const day = item._id.dayOfWeek; // 1=Sun, 7=Sat
          const count = item.count;
          totalActivity += count;

          // Use constants for time slot boundaries
          if (hour >= constants.TIMESLOT_MORNING_START && hour < constants.TIMESLOT_AFTERNOON_START) timeCounts.morning += count;
          else if (hour >= constants.TIMESLOT_AFTERNOON_START && hour < constants.TIMESLOT_EVENING_START) timeCounts.afternoon += count;
          else if (hour >= constants.TIMESLOT_EVENING_START && hour < constants.TIMESLOT_NIGHT_START) timeCounts.evening += count; // Assuming 18-24
          else timeCounts.night += count; // 0-6

          if (day >= 1 && day <= 7) dayCounts[day] += count;
        });

        // Find peak time slot
        const [peakTimeSlot, peakTimeCount] = Object.entries(timeCounts).reduce((prev, curr) => (curr[1] > prev[1] ? curr : prev), ["", 0]);
        const timeSlotMap = { morning: "en matinée (6h-12h)", afternoon: "l'après-midi (12h-18h)", evening: "en soirée (18h-0h)", night: "la nuit (0h-6h)" }; // Corrected map
        // Use constant for threshold
        if (peakTimeCount > totalActivity * constants.INSIGHTS_PEAK_TIME_THRESHOLD) {
           insights.push({ title: "Pic d'Activité Temporel", insights: [`La majorité de l'activité locale est détectée ${timeSlotMap[peakTimeSlot] ?? 'à certaines heures'}.`, "Adaptez vos opérations ou promotions durant ces périodes."], type: "trend" });
        }

        // Find peak day
        const [peakDayNumStr, peakDayCount] = Object.entries(dayCounts).reduce((prev, curr) => (curr[1] > prev[1] ? curr : prev), ["0", 0]);
        const peakDayNum = parseInt(peakDayNumStr, 10); // Convert key to number
        const dayNameMap = { 1: "Dimanche", 2: "Lundi", 3: "Mardi", 4: "Mercredi", 5: "Jeudi", 6: "Vendredi", 7: "Samedi" };
         // Use constant for threshold
        if (peakDayCount > totalActivity * constants.INSIGHTS_PEAK_DAY_THRESHOLD && dayNameMap[peakDayNum]) {
            insights.push({ title: "Jour le Plus Actif", insights: [`Le ${dayNameMap[peakDayNum]} semble attirer le plus d'activité à proximité.`, "Envisagez une offre spéciale ou un événement ce jour-là."], type: "opportunity" });
        }

        // Add a generic insight if few specific ones were found or total activity is low/high
        if (insights.length < 2) {
            insights.push({ title: "Analyse Générale", insights: ["Continuez à surveiller l'activité locale pour affiner votre stratégie.", `Total de ${totalActivity} points de données analysés sur ${daysToAnalyze} jours dans un rayon de ${radiusM}m.`], type: "info" });
        }
      }

      // Format insights for frontend (keep structure simple)
       const formattedInsights = insights.map(insight => ({
           title: insight.title,
           insights: insight.insights, // Keep as array of strings
           type: insight.type, // Let frontend map type to color/icon
       }));

      console.log(`📊 Generated ${formattedInsights.length} action opportunities for producer ${producerId}`);
      // Use constant for limit
      res.status(200).json(formattedInsights.slice(0, constants.MAX_INSIGHTS_RETURNED));

    } catch (error) {
      console.error('❌ Erreur dans getActionOpportunities:', error);
      // Provide more specific error info if possible
      if (error.code === 51024 || (error.message && error.message.includes('unable to find index for $geoNear query'))) {
         console.error('   Hint: Missing 2dsphere index on locationHistories.location');
         return res.status(500).json({ message: 'Erreur de base de données: Index géospatial (location) manquant sur locationHistories.', code: 'DB_GEO_INDEX_MISSING' });
      }
      res.status(500).json({ message: 'Erreur serveur lors de la récupération des opportunités', error: error.message });
    }
  }, // Added comma

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
  }, // Added comma

  /**
   * Récupérer les recherches récentes à proximité d'un producteur
   * @route GET /api/heatmap/nearby-searches/:producerId
   * @requires auth
   */
  getNearbySearches: async (req, res) => {
    // This implementation looks fine
    try {
      const { producerId } = req.params;
      // Use constants for defaults
      const radiusM = parseInt(req.query.radius, 10) || constants.DEFAULT_NEARBY_SEARCH_RADIUS_METERS;
      const minutesAgo = parseInt(req.query.minutes, 10) || constants.DEFAULT_NEARBY_SEARCH_TIMESPAN_MINUTES;
      const limit = parseInt(req.query.limit, 10) || constants.MAX_NEARBY_SEARCHES_RETURNED;

      // 1. Trouver le producteur et sa localisation
      const producerData = await findProducerInAnyCollection(producerId);
      if (!producerData || !producerData.producer || !producerData.producer.location || !producerData.producer.location.coordinates) {
        return res.status(404).json({ message: 'Localisation du producteur introuvable.' });
      }
      const [prodLng, prodLat] = producerData.producer.location.coordinates;

      // 2. Définir la période de temps
      const searchSince = new Date(Date.now() - minutesAgo * 60 * 1000);

      // 3. Agréger les activités de recherche récentes
      // Ensure UserActivity model has a 2dsphere index on 'location'
      const aggregationPipeline = [
        // Match search actions near the producer within the timeframe
        {
          $match: {
            action: constants.USER_ACTIVITY_ACTIONS.SEARCH, // Use constant
            timestamp: { $gte: searchSince },
            location: {
              // Use $nearSphere for distance-based search from producer location
              $nearSphere: {
                $geometry: {
                  type: "Point",
                  coordinates: [prodLng, prodLat]
                },
                $maxDistance: radiusM // Max distance in meters
              }
            }
          }
        },
        // Sort by timestamp descending (most recent first)
        { $sort: { timestamp: -1 } },
        // Limit the results
        { $limit: limit },
        // Lookup user details (name, profilePicture)
        {
          $lookup: {
            from: "users", // Collection name for User model (check your actual name)
            localField: "userId",
            foreignField: "_id",
            // Pipeline to select only specific fields from user
             pipeline: [
               { $project: { _id: 0, name: 1, profilePicture: 1 } }
             ],
            as: "userDetails"
          }
        },
        // Deconstruct userDetails array (should be 0 or 1 element)
        {
          $unwind: {
            path: "$userDetails",
            preserveNullAndEmptyArrays: true // Keep searches even if user details not found/user deleted
          }
        },
        // Project the final desired format matching frontend model
        {
          $project: {
            _id: 0, // Exclude the aggregation _id
            searchId: "$_id", // Use the activity _id as searchId
            userId: "$userId",
            query: "$query", // Make sure 'query' field exists in UserActivity schema
            timestamp: "$timestamp",
            location: "$location", // Include location GeoJSON
            // Use $ifNull to provide default name if userDetails missing
            userName: { $ifNull: ["$userDetails.name", constants.DEFAULT_UNKNOWN_USERNAME] },
            userProfilePicture: "$userDetails.profilePicture" // Will be null if userDetails missing
          }
        }
      ];

      // Execute aggregation on UserActivity model
      const nearbySearches = await UserActivity.aggregate(aggregationPipeline);

      console.log(`🔎 Found ${nearbySearches.length} nearby search activities for producer ${producerId} within ${radiusM}m in the last ${minutesAgo} mins.`);
      res.status(200).json(nearbySearches);

    } catch (error) {
      console.error('❌ Erreur dans getNearbySearches:', error);
      // Check for geo index error ($nearSphere needs index)
      if (error.code === 166 || (error.message && error.message.includes('$nearSphere requires a 2dsphere index'))) {
        console.error('   Hint: Missing 2dsphere index on userActivities.location field!');
        return res.status(500).json({ message: 'Erreur de base de données: Index géospatial (location) manquant sur UserActivity.', code: 'DB_GEO_INDEX_MISSING' });
      }
      res.status(500).json({ message: 'Erreur serveur lors de la récupération des recherches proches', error: error.message });
    }
  } // No comma needed after last method
}; // Semicolon after object definition

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