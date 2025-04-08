const mongoose = require('mongoose');
const { choiceAppDb, restaurationDb, loisirDb, beautyWellnessDb } = require('../index');
const User = require('../models/User');

// Modèles pour les différents types de producteurs
const Producer = restaurationDb.model(
  'Producer',
  new mongoose.Schema({}, { strict: false }),
  'producers'
);

const LeisureProducer = loisirDb.model(
  'LeisureProducer',
  new mongoose.Schema({}, { strict: false }),
  'producers'
);

const WellnessProducer = beautyWellnessDb.model(
  'WellnessProducer',
  new mongoose.Schema({}, { strict: false }),
  'WellnessPlace'
);

// Modèle pour les données de localisation
const LocationHistory = choiceAppDb.model(
  'LocationHistory',
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
  }),
  'locationHistories'
);

// Modèle pour les activités utilisateur
const UserActivity = choiceAppDb.model(
  'UserActivity',
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
  }),
  'userActivities'
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

// Contrôleur pour les fonctionnalités heatmap
const heatmapController = {
  /**
   * Récupérer les hotspots de localisation autour d'un point
   * @route GET /api/location-history/hotspots
   */
  getHotspots: async (req, res) => {
    try {
      const { latitude, longitude, radius = 2000, limit = 20 } = req.query;
      
      if (!latitude || !longitude) {
        return res.status(400).json({ message: 'Latitude et longitude requises' });
      }
      
      // Convertir les paramètres
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      const radiusM = parseInt(radius, 10);
      
      // Créer une requête géospatiale pour trouver les points d'activité à proximité
      const locationHistories = await LocationHistory.aggregate([
        {
          $geoNear: {
            near: { type: "Point", coordinates: [lng, lat] },
            distanceField: "distance",
            maxDistance: radiusM,
            spherical: true
          }
        },
        {
          $group: {
            _id: {
              // Grouper par grille de 100m × 100m
              latGrid: { $floor: { $multiply: ["$location.coordinates.1", 100] } },
              lngGrid: { $floor: { $multiply: ["$location.coordinates.0", 100] } }
            },
            latitude: { $avg: "$location.coordinates.1" },
            longitude: { $avg: "$location.coordinates.0" },
            count: { $sum: 1 },
            userIds: { $addToSet: "$userId" }
          }
        },
        {
          $project: {
            _id: 0,
            id: { $toString: "$_id" },
            latitude: 1,
            longitude: 1,
            intensity: { $min: [{ $divide: ["$count", 100] }, 1] }, // Normaliser entre 0 et 1
            visitorCount: { $size: "$userIds" }
          }
        },
        { $sort: { intensity: -1 } },
        { $limit: parseInt(limit, 10) }
      ]);
      
      // Enrichir les hotspots avec des données supplémentaires
      const hotspots = locationHistories.map(spot => {
        // Générer un ID unique
        const id = new mongoose.Types.ObjectId().toString();
        
        // Déterminer le nom de la zone (simulé pour le moment)
        const zoneName = `Zone ${spot.latitude.toFixed(3)}, ${spot.longitude.toFixed(3)}`;
        
        // Simuler les distributions temporelles et journalières
        // Dans une version de production, ces données viendraient d'une analyse réelle
        const timeDistribution = {
          morning: Math.random() * 0.5 + 0.25,
          afternoon: Math.random() * 0.5 + 0.25,
          evening: Math.random() * 0.5 + 0.25
        };
        
        const dayDistribution = {
          monday: Math.random() * 0.2 + 0.1,
          tuesday: Math.random() * 0.2 + 0.1,
          wednesday: Math.random() * 0.2 + 0.1,
          thursday: Math.random() * 0.2 + 0.1,
          friday: Math.random() * 0.2 + 0.1,
          saturday: Math.random() * 0.3 + 0.1,
          sunday: Math.random() * 0.3 + 0.1
        };
        
        return {
          id: id,
          latitude: spot.latitude,
          longitude: spot.longitude,
          zoneName: zoneName,
          intensity: spot.intensity,
          visitorCount: spot.visitorCount || Math.floor(Math.random() * 50) + 10,
          weight: spot.intensity,
          timeDistribution: timeDistribution,
          dayDistribution: dayDistribution
        };
      });
      
      res.status(200).json(hotspots);
    } catch (error) {
      console.error('❌ Erreur dans getHotspots:', error);
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
      
      // Validation de base
      if (!producerId) {
        return res.status(400).json({ message: 'ID du producteur requis' });
      }
      
      // Trouver le producteur
      const producerResult = await findProducerInAnyCollection(producerId);
      if (!producerResult) {
        return res.status(404).json({ message: 'Producteur non trouvé' });
      }
      
      const { producer, type: producerType } = producerResult;
      
      // Déterminer les modèles adaptés et les requêtes selon le type de producteur
      let opportunities = [];
      
      // Récupérer les données d'activité récentes (30 derniers jours)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const activities = await UserActivity.find({
        producerId,
        timestamp: { $gte: thirtyDaysAgo }
      }).lean();
      
      // Analyser les données pour générer des opportunités
      
      // 1. Heures de pointe d'activité
      const hourCounts = Array(24).fill(0);
      activities.forEach(activity => {
        const hour = new Date(activity.timestamp).getHours();
        hourCounts[hour]++;
      });
      
      // Trouver les 3 heures les plus actives
      const peakHours = hourCounts
        .map((count, hour) => ({ hour, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map(item => item.hour);
      
      opportunities.push({
        type: 'peak_hours',
        title: 'Heures de pointe d\'activité',
        description: `Vos clients sont les plus actifs à ${peakHours.map(h => `${h}h`).join(', ')}`,
        actionable: true,
        action: 'Envisagez de lancer des promotions pendant ces heures'
      });
      
      // 2. Jours les plus actifs
      const dayCounts = Array(7).fill(0);
      activities.forEach(activity => {
        const day = new Date(activity.timestamp).getDay();
        dayCounts[day]++;
      });
      
      // Trouver les 2 jours les plus actifs
      const daysOfWeek = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
      const peakDays = dayCounts
        .map((count, day) => ({ day: daysOfWeek[day], count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 2)
        .map(item => item.day);
      
      opportunities.push({
        type: 'peak_days',
        title: 'Jours les plus actifs',
        description: `Vos clients sont les plus actifs le ${peakDays.join(' et le ')}`,
        actionable: true,
        action: 'Envisagez des événements spéciaux ces jours-là'
      });
      
      // 3. Recherches populaires
      const searchQueries = activities
        .filter(a => a.action === 'search' && a.query)
        .map(a => a.query);
      
      if (searchQueries.length > 0) {
        // Compter les occurrences de chaque requête
        const queryCounts = {};
        searchQueries.forEach(query => {
          queryCounts[query] = (queryCounts[query] || 0) + 1;
        });
        
        // Trouver les requêtes les plus populaires
        const popularQueries = Object.entries(queryCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([query]) => query);
        
        if (popularQueries.length > 0) {
          opportunities.push({
            type: 'popular_searches',
            title: 'Recherches populaires',
            description: `Vos clients recherchent souvent: ${popularQueries.join(', ')}`,
            actionable: true,
            action: 'Assurez-vous que ces éléments sont bien mis en avant sur votre profil'
          });
        }
      }
      
      // 4. Recommandations spécifiques au type de producteur
      if (producerType === 'restaurant') {
        opportunities.push({
          type: 'menu_suggestion',
          title: 'Suggestion de menu',
          description: 'Votre menu pourrait bénéficier d\'une mise à jour saisonnière',
          actionable: true,
          action: 'Mettez à jour votre menu avec des plats de saison'
        });
      } else if (producerType === 'leisure') {
        opportunities.push({
          type: 'event_suggestion',
          title: 'Suggestion d\'événement',
          description: 'Les événements en soirée génèrent plus d\'engagement',
          actionable: true,
          action: 'Planifiez un événement nocturne dans les prochaines semaines'
        });
      } else if (producerType === 'wellness') {
        opportunities.push({
          type: 'service_suggestion',
          title: 'Suggestion de service',
          description: 'Les services de relaxation sont très demandés en ce moment',
          actionable: true,
          action: 'Mettez en avant vos services de relaxation'
        });
      }
      
      res.status(200).json({ actionOpportunities: opportunities });
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