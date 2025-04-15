const mongoose = require('mongoose');

module.exports = (connection) => {
  const RestaurantStatsSchema = new mongoose.Schema({
    producerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Producer'
    },
    // Données hebdomadaires
    weeklyStats: {
      visitors: { type: Number, default: 0 },
      newCustomers: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 },
      ordersCount: { type: Number, default: 0 },
      averageOrderValue: { type: Number, default: 0 },
    },
    // Données mensuelles
    monthlyStats: {
      visitors: { type: Number, default: 0 },
      newCustomers: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 },
      ordersCount: { type: Number, default: 0 },
      averageOrderValue: { type: Number, default: 0 },
    },
    // Données d'engagement
    engagement: {
      profileViews: { type: Number, default: 0 },
      menuViews: { type: Number, default: 0 },
      mapClicks: { type: Number, default: 0 },
      websiteClicks: { type: Number, default: 0 },
      phoneCallsCount: { type: Number, default: 0 },
    },
    // Données du menu
    menuStats: {
      topSellingItems: [{
        itemId: String,
        name: String,
        quantity: Number,
        revenue: Number
      }],
      leastSellingItems: [{
        itemId: String,
        name: String,
        quantity: Number,
        revenue: Number
      }]
    },
    // Performances quotidiennes (pour graphiques)
    dailyPerformance: [{
      date: { type: Date },
      visitors: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 },
      ordersCount: { type: Number, default: 0 }
    }],
    // Performances des promotions
    promotionStats: [{
      promotionId: String,
      name: String,
      startDate: Date,
      endDate: Date,
      discountPercentage: Number,
      redemptionsCount: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 }
    }],
    // Date de mise à jour
    lastUpdated: { type: Date, default: Date.now }
  });

  // Créer un index pour le producerId pour des requêtes efficaces
  RestaurantStatsSchema.index({ producerId: 1 });
  
  // Ajouter un index pour la date de dernière mise à jour
  RestaurantStatsSchema.index({ lastUpdated: 1 });

  return connection.model('RestaurantStats', RestaurantStatsSchema, 'restaurant_stats');
}; 