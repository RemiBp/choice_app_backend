const mongoose = require('mongoose');

/**
 * Schéma pour la localisation (GeoJSON Point)
 */
const LocationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['Point'],
    default: 'Point'
  },
  coordinates: {
    type: [Number],
    default: [0, 0]
  }
});

/**
 * Schéma pour un point d'activité d'utilisateur
 */
const ActivityPointSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['view', 'search', 'favorite', 'click', 'share', 'call'],
    default: 'view'
  },
  location: {
    type: LocationSchema,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  producerId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  producerType: {
    type: String,
    enum: ['restaurant', 'leisure', 'wellness'],
    required: true
  },
  // Champs spécifiques à certains types d'activité
  query: String, // Pour les recherches
  distance: Number, // Distance en mètres
  metadata: {
    type: Object,
    default: {}
  }
});

/**
 * Schéma pour une zone chaude (hotspot)
 */
const HotZoneSchema = new mongoose.Schema({
  center: {
    type: LocationSchema,
    required: true
  },
  radius: {
    type: Number,
    default: 100 // Rayon en mètres
  },
  intensity: {
    type: Number,
    min: 0,
    max: 1,
    default: 0.5
  },
  points: {
    type: Number,
    default: 0
  },
  metadata: {
    type: Object,
    default: {}
  }
});

/**
 * Schéma pour une recherche effectuée à proximité
 */
const SearchQuerySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  query: {
    type: String,
    required: true
  },
  location: {
    type: LocationSchema,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  distance: Number // Distance en mètres
});

/**
 * Schéma principal de données heatmap
 */
const HeatmapDataSchema = new mongoose.Schema({
  producerId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  producerType: {
    type: String,
    enum: ['restaurant', 'leisure', 'wellness'],
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  timeframe: {
    type: String,
    enum: ['15m', '30m', '1h', '3h', '6h', '12h', '24h'],
    default: '30m'
  },
  // Données du producteur
  producer: {
    id: mongoose.Schema.Types.ObjectId,
    name: String,
    type: String,
    location: LocationSchema
  },
  // Points d'activité dans la zone
  activityPoints: [ActivityPointSchema],
  // Zones chaudes (agrégations de points d'activité)
  hotZones: [HotZoneSchema],
  // Recherches effectuées à proximité
  searches: [SearchQuerySchema],
  // Statistiques
  stats: {
    totalActivities: Number,
    uniqueUsers: Number,
    totalSearches: Number
  }
});

// Créer des index géospatiaux pour les recherches de proximité
ActivityPointSchema.index({ location: '2dsphere' });
HotZoneSchema.index({ center: '2dsphere' });
SearchQuerySchema.index({ location: '2dsphere' });

// Créer des index pour les champs fréquemment utilisés dans les requêtes
HeatmapDataSchema.index({ producerId: 1, timestamp: -1 });
ActivityPointSchema.index({ userId: 1, timestamp: -1 });
ActivityPointSchema.index({ producerId: 1, timestamp: -1 });
SearchQuerySchema.index({ query: 1 });

// Méthode pour filtrer les données par intervalle de temps
HeatmapDataSchema.methods.filterByTimeframe = function(timeframe) {
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
  
  // Filtrer les points d'activité
  this.activityPoints = this.activityPoints.filter(point => 
    new Date(point.timestamp) >= startTime
  );
  
  // Filtrer les recherches
  this.searches = this.searches.filter(search => 
    new Date(search.timestamp) >= startTime
  );
  
  // Mettre à jour le timeframe
  this.timeframe = timeframe;
  
  // Recalculer les statistiques
  this.stats.totalActivities = this.activityPoints.length;
  this.stats.uniqueUsers = new Set(this.activityPoints.map(p => p.userId.toString())).size;
  this.stats.totalSearches = this.searches.length;
  
  return this;
};

// Exporter les modèles
const HeatmapData = mongoose.model('HeatmapData', HeatmapDataSchema, 'heatmapData');
const ActivityPoint = mongoose.model('ActivityPoint', ActivityPointSchema, 'activityPoints');
const HotZone = mongoose.model('HotZone', HotZoneSchema, 'hotZones');
const SearchQuery = mongoose.model('SearchQuery', SearchQuerySchema, 'searchQueries');

module.exports = {
  HeatmapData,
  ActivityPoint,
  HotZone,
  SearchQuery
}; 