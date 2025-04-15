const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

let connections = {};

// Initialiser le contrôleur avec les connexions à la base de données
exports.initialize = (dbConnections) => {
  connections = dbConnections;
};

/**
 * Récupère les statistiques d'un restaurant
 */
exports.getRestaurantStats = async (req, res) => {
  try {
    const { producerId } = req.params;
    const { period = 'week' } = req.query;
    
    // Vérifier que producerId est un ObjectId valide
    if (!ObjectId.isValid(producerId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID de restaurant invalide' 
      });
    }
    
    // Récupérer le modèle RestaurantStats depuis la connexion
    const RestaurantStats = connections.restaurationDb.model('RestaurantStats');
    
    // Chercher les statistiques existantes
    let stats = await RestaurantStats.findOne({ producerId: new ObjectId(producerId) });
    
    // Si aucune statistique n'existe, générer des données de démonstration
    if (!stats) {
      stats = await generateDemoStats(producerId);
    }

    // Filtrer les données en fonction de la période demandée
    const periodStats = getPeriodStats(stats, period);
    
    return res.status(200).json({
      success: true,
      stats: periodStats
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des statistiques:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Erreur lors de la récupération des statistiques',
      error: error.message
    });
  }
};

/**
 * Récupère les statistiques du menu d'un restaurant
 */
exports.getMenuStats = async (req, res) => {
  try {
    const { producerId } = req.params;
    
    // Vérifier que producerId est un ObjectId valide
    if (!ObjectId.isValid(producerId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID de restaurant invalide' 
      });
    }
    
    // Récupérer le modèle RestaurantStats depuis la connexion
    const RestaurantStats = connections.restaurationDb.model('RestaurantStats');
    
    // Chercher les statistiques existantes
    let stats = await RestaurantStats.findOne({ producerId: new ObjectId(producerId) });
    
    // Si aucune statistique n'existe, générer des données de démonstration
    if (!stats) {
      stats = await generateDemoStats(producerId);
    }

    return res.status(200).json({
      success: true,
      menuStats: stats.menuStats
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des statistiques du menu:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Erreur lors de la récupération des statistiques du menu',
      error: error.message
    });
  }
};

/**
 * Récupère les statistiques d'engagement d'un restaurant
 */
exports.getEngagementStats = async (req, res) => {
  try {
    const { producerId } = req.params;
    
    // Vérifier que producerId est un ObjectId valide
    if (!ObjectId.isValid(producerId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID de restaurant invalide' 
      });
    }
    
    // Récupérer le modèle RestaurantStats depuis la connexion
    const RestaurantStats = connections.restaurationDb.model('RestaurantStats');
    
    // Chercher les statistiques existantes
    let stats = await RestaurantStats.findOne({ producerId: new ObjectId(producerId) });
    
    // Si aucune statistique n'existe, générer des données de démonstration
    if (!stats) {
      stats = await generateDemoStats(producerId);
    }

    return res.status(200).json({
      success: true,
      engagement: stats.engagement
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des statistiques d\'engagement:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Erreur lors de la récupération des statistiques d\'engagement',
      error: error.message
    });
  }
};

/**
 * Récupère les statistiques quotidiennes pour les graphiques
 */
exports.getDailyStats = async (req, res) => {
  try {
    const { producerId } = req.params;
    const { days = 30 } = req.query;
    
    // Vérifier que producerId est un ObjectId valide
    if (!ObjectId.isValid(producerId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID de restaurant invalide' 
      });
    }
    
    // Récupérer le modèle RestaurantStats depuis la connexion
    const RestaurantStats = connections.restaurationDb.model('RestaurantStats');
    
    // Chercher les statistiques existantes
    let stats = await RestaurantStats.findOne({ producerId: new ObjectId(producerId) });
    
    // Si aucune statistique n'existe, générer des données de démonstration
    if (!stats) {
      stats = await generateDemoStats(producerId);
    }

    // Limiter les données aux derniers jours demandés
    const limitedDailyPerformance = stats.dailyPerformance
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, parseInt(days))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    return res.status(200).json({
      success: true,
      dailyStats: limitedDailyPerformance
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des statistiques quotidiennes:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Erreur lors de la récupération des statistiques quotidiennes',
      error: error.message
    });
  }
};

/**
 * Génère des statistiques de démonstration pour un restaurant
 * @param {string} producerId - ID du restaurant
 * @returns {Object} Les statistiques générées
 */
async function generateDemoStats(producerId) {
  try {
    const RestaurantStats = connections.restaurationDb.model('RestaurantStats');
    
    // Date actuelle
    const now = new Date();
    
    // Générer des données quotidiennes pour les 30 derniers jours
    const dailyPerformance = [];
    for (let i = 30; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      
      // Ajouter un peu de variance aux données
      const baseVisitors = Math.floor(Math.random() * 30) + 40;
      const baseRevenue = Math.floor(Math.random() * 300) + 500;
      const baseOrders = Math.floor(Math.random() * 15) + 20;
      
      // Augmenter les valeurs pour les weekends
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const multiplier = isWeekend ? 1.5 : 1;
      
      dailyPerformance.push({
        date,
        visitors: Math.floor(baseVisitors * multiplier),
        revenue: Math.floor(baseRevenue * multiplier),
        ordersCount: Math.floor(baseOrders * multiplier)
      });
    }
    
    // Calculer les totaux hebdomadaires (7 derniers jours)
    const last7Days = dailyPerformance.slice(-7);
    const weeklyVisitors = last7Days.reduce((sum, day) => sum + day.visitors, 0);
    const weeklyRevenue = last7Days.reduce((sum, day) => sum + day.revenue, 0);
    const weeklyOrders = last7Days.reduce((sum, day) => sum + day.ordersCount, 0);
    
    // Calculer les totaux mensuels (30 derniers jours)
    const last30Days = dailyPerformance.slice(-30);
    const monthlyVisitors = last30Days.reduce((sum, day) => sum + day.visitors, 0);
    const monthlyRevenue = last30Days.reduce((sum, day) => sum + day.revenue, 0);
    const monthlyOrders = last30Days.reduce((sum, day) => sum + day.ordersCount, 0);
    
    // Créer des statistiques de menu fictives
    const menuStats = {
      topSellingItems: [
        { itemId: '1', name: 'Burger Signature', quantity: 142, revenue: 1562 },
        { itemId: '2', name: 'Pizza Margherita', quantity: 98, revenue: 980 },
        { itemId: '3', name: 'Salade César', quantity: 76, revenue: 684 },
        { itemId: '4', name: 'Pâtes Carbonara', quantity: 67, revenue: 804 },
        { itemId: '5', name: 'Tiramisu', quantity: 58, revenue: 406 }
      ],
      leastSellingItems: [
        { itemId: '6', name: 'Soupe à l\'oignon', quantity: 12, revenue: 96 },
        { itemId: '7', name: 'Tarte aux fraises', quantity: 15, revenue: 120 },
        { itemId: '8', name: 'Sandwich Végétarien', quantity: 18, revenue: 126 },
        { itemId: '9', name: 'Café Gourmand', quantity: 22, revenue: 110 },
        { itemId: '10', name: 'Thé vert', quantity: 25, revenue: 100 }
      ]
    };
    
    // Créer des statistiques d'engagement fictives
    const engagement = {
      profileViews: monthlyVisitors * 3,
      menuViews: monthlyVisitors * 2,
      mapClicks: Math.floor(monthlyVisitors * 0.4),
      websiteClicks: Math.floor(monthlyVisitors * 0.3),
      phoneCallsCount: Math.floor(monthlyVisitors * 0.2)
    };
    
    // Statistiques de promotions fictives
    const promotionStats = [
      {
        promotionId: '1',
        name: 'Happy Hour -20%',
        startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 15),
        endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 8),
        discountPercentage: 20,
        redemptionsCount: 87,
        revenue: 1305
      },
      {
        promotionId: '2',
        name: 'Menu du midi à -15%',
        startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30),
        endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 16),
        discountPercentage: 15,
        redemptionsCount: 124,
        revenue: 1860
      }
    ];
    
    // Créer l'objet de statistiques complet
    const stats = new RestaurantStats({
      producerId: new ObjectId(producerId),
      weeklyStats: {
        visitors: weeklyVisitors,
        newCustomers: Math.floor(weeklyVisitors * 0.3),
        revenue: weeklyRevenue,
        ordersCount: weeklyOrders,
        averageOrderValue: Math.floor(weeklyRevenue / weeklyOrders)
      },
      monthlyStats: {
        visitors: monthlyVisitors,
        newCustomers: Math.floor(monthlyVisitors * 0.25),
        revenue: monthlyRevenue,
        ordersCount: monthlyOrders,
        averageOrderValue: Math.floor(monthlyRevenue / monthlyOrders)
      },
      engagement,
      menuStats,
      dailyPerformance,
      promotionStats,
      lastUpdated: now
    });
    
    // Sauvegarder les statistiques
    await stats.save();
    
    return stats;
  } catch (error) {
    console.error('❌ Erreur lors de la génération des statistiques de démonstration:', error);
    throw error;
  }
}

/**
 * Extrait les statistiques pour une période spécifique
 * @param {Object} stats - L'objet statistiques complet
 * @param {string} period - La période ('day', 'week', 'month')
 * @returns {Object} Les statistiques filtrées pour la période
 */
function getPeriodStats(stats, period) {
  switch (period) {
    case 'day':
      // Obtenir les statistiques de la dernière journée
      const lastDay = stats.dailyPerformance.slice(-1)[0] || { visitors: 0, revenue: 0, ordersCount: 0 };
      return {
        visitors: lastDay.visitors,
        revenue: lastDay.revenue,
        ordersCount: lastDay.ordersCount,
        averageOrderValue: lastDay.ordersCount > 0 ? Math.floor(lastDay.revenue / lastDay.ordersCount) : 0,
        newCustomers: Math.floor(lastDay.visitors * 0.3)
      };
    case 'week':
      return stats.weeklyStats;
    case 'month':
      return stats.monthlyStats;
    default:
      return stats.weeklyStats;
  }
} 