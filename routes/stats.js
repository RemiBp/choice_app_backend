const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Post = require('../models/Post');
const Producer = require('../models/Producer');
const LeisureProducer = require('../models/leisureProducer');
const WellnessPlace = require('../models/WellnessPlace');
const Event = require('../models/event');
const { Conversation } = require('../models/conversation');
const mongoose = require('mongoose');
const loisirsDb = mongoose.connection.useDb('Loisir&Culture');
const statsController = require('../controllers/statsController');

// Middleware d'authentification
const auth = async (req, res, next) => {
  // Votre logique d'authentification ici
  next();
};

// GET /api/stats/user/:userId - Obtenir les statistiques d'un utilisateur
router.get('/user/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Vérifier que l'utilisateur existe
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    // Récupérer diverses statistiques
    const [postsCount, choicesCount, followersCount, followingCount, conversationsCount] = await Promise.all([
      Post.countDocuments({ userId }),
      User.findById(userId, 'choiceCount choices').then(u => u.choiceCount || u.choices?.length || 0),
      User.findById(userId, 'followers').then(u => u.followers?.length || 0),
      User.findById(userId, 'following').then(u => u.following?.length || 0),
      Conversation.countDocuments({ participants: userId })
    ]);
    
    res.status(200).json({
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        profilePicture: user.profilePicture,
        bio: user.bio,
        createdAt: user.created_at
      },
      stats: {
        postsCount,
        choicesCount,
        followersCount,
        followingCount,
        conversationsCount,
        interestsCount: user.interests?.length || 0,
        tagsCount: user.liked_tags?.length || 0
      }
    });
  } catch (error) {
    console.error('Erreur de récupération des statistiques utilisateur:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des statistiques utilisateur' });
  }
});

// GET /api/stats/producer/:producerId - Obtenir les statistiques d'un établissement
router.get('/producer/:producerId', auth, async (req, res) => {
  try {
    const { producerId } = req.params;
    const { type = 'restaurant' } = req.query;
    
    // Déterminer le modèle à utiliser selon le type
    let Producer;
    switch (type) {
      case 'restaurant':
        Producer = require('../models/Producer');
        break;
      case 'leisure':
        Producer = require('../models/leisureProducer');
        break;
      case 'beauty':
      case 'wellness':
        Producer = require('../models/WellnessPlace');
        break;
      default:
        Producer = require('../models/Producer');
    }
    
    // Vérifier que l'établissement existe
    const producer = await Producer.findById(producerId);
    
    if (!producer) {
      return res.status(404).json({ error: 'Établissement non trouvé' });
    }
    
    // Récupérer diverses statistiques
    const postsCount = await Post.countDocuments({ producerId });
    const followersCount = producer.followers?.length || producer.abonnés || 0;
    const conversationsCount = await Conversation.countDocuments({
      producerId: producerId,
      isProducerConversation: true
    });
    
    const stats = {
      postsCount,
      followersCount,
      conversationsCount,
      rating: producer.rating || 0,
      reviewsCount: producer.reviews?.length || producer.user_ratings_total || 0
    };
    
    // Statistiques spécifiques selon le type
    if (type === 'restaurant') {
      stats.menuItemsCount = producer.menu_items?.length || producer.menu?.length || 0;
    } else if (type === 'beauty' || type === 'wellness') {
      stats.servicesCount = producer.services?.length || 0;
    } else if (type === 'leisure') {
      stats.eventsCount = producer.evenements?.length || producer.nombre_evenements || 0;
    }
    
    res.status(200).json({
      producer: {
        _id: producer._id,
        name: producer.name || producer.lieu,
        photo: producer.photo,
        address: producer.address || producer.adresse,
        category: producer.category || producer.catégorie
      },
      stats
    });
  } catch (error) {
    console.error('Erreur de récupération des statistiques établissement:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des statistiques établissement' });
  }
});

// GET /api/stats/event/:eventId - Obtenir les statistiques d'un événement
router.get('/event/:eventId', auth, async (req, res) => {
  try {
    const { eventId } = req.params;
    
    // Vérifier que l'événement existe
    const event = await Event.findById(eventId);
    
    if (!event) {
      return res.status(404).json({ error: 'Événement non trouvé' });
    }
    
    // Récupérer diverses statistiques
    const postsCount = await Post.countDocuments({ eventId });
    const interestedCount = event.interestedUsers?.length || 0;
    const choiceCount = event.choiceUsers?.length || event.choice_count || 0;
    
    res.status(200).json({
      event: {
        _id: event._id,
        title: event.title || event.intitulé || event.name,
        image: event.image || event.photo,
        venue: event.lieu || event.venue,
        startDate: event.startDate || event.date_debut || event.date
      },
      stats: {
        postsCount,
        interestedCount,
        choiceCount
      }
    });
  } catch (error) {
    console.error('Erreur de récupération des statistiques événement:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des statistiques événement' });
  }
});

// GET /api/stats/global - Obtenir des statistiques globales de l'application
router.get('/global', auth, async (req, res) => {
  try {
    // Vérifier si l'utilisateur a des droits d'administration
    if (req.user.account_type !== 'admin') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    
    // Récupérer diverses statistiques globales
    const [usersCount, postsCount, restaurantsCount, leisureCount, beautyCount, eventsCount] = await Promise.all([
      User.countDocuments(),
      Post.countDocuments(),
      Producer.countDocuments(),
      LeisureProducer.countDocuments(),
      WellnessPlace.countDocuments(),
      Event.countDocuments()
    ]);
    
    // Statistiques des utilisateurs actifs (dernière connexion < 7 jours)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const activeUsersCount = await User.countDocuments({
      last_login: { $gte: sevenDaysAgo }
    });
    
    // Statistiques des posts des dernières 24 heures
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const recentPostsCount = await Post.countDocuments({
      createdAt: { $gte: oneDayAgo }
    });
    
    res.status(200).json({
      usersStats: {
        total: usersCount,
        active: activeUsersCount,
        activationRate: usersCount > 0 ? (activeUsersCount / usersCount * 100).toFixed(2) : 0
      },
      contentStats: {
        posts: postsCount,
        recentPosts: recentPostsCount
      },
      placesStats: {
        restaurants: restaurantsCount,
        leisure: leisureCount,
        beauty: beautyCount,
        events: eventsCount,
        total: restaurantsCount + leisureCount + beautyCount + eventsCount
      }
    });
  } catch (error) {
    console.error('Erreur de récupération des statistiques globales:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des statistiques globales' });
  }
});

// GET /api/stats/trending - Obtenir les éléments tendance
router.get('/trending', async (req, res) => {
  try {
    const { type, limit = 10 } = req.query;
    const limitNum = parseInt(limit);
    
    let results = {};
    
    // Récupérer les établissements les plus populaires (basés sur les abonnés/followers)
    if (!type || type === 'producers' || type === 'all') {
      const [trendingRestaurants, trendingLeisure, trendingBeauty] = await Promise.all([
        Producer.find()
          .sort({ abonnés: -1 })
          .limit(limitNum)
          .select('_id name photo address category rating'),
        
        LeisureProducer.find()
          .sort({ abonnés: -1 })
          .limit(limitNum)
          .select('_id lieu name photo adresse address catégorie category'),
        
        WellnessPlace.find()
          .sort({ abonnés: -1 })
          .limit(limitNum)
          .select('_id name photo address category rating')
      ]);
      
      results.restaurants = trendingRestaurants;
      results.leisure = trendingLeisure;
      results.beauty = trendingBeauty;
    }
    
    // Récupérer les événements les plus populaires (basés sur le nombre de choix)
    if (!type || type === 'events' || type === 'all') {
      const trendingEvents = await Event.find()
        .sort({ choice_count: -1 })
        .limit(limitNum)
        .select('_id intitulé title name photo image lieu catégorie category description date date_debut startDate');
      
      results.events = trendingEvents;
    }
    
    // Récupérer les posts les plus populaires (basés sur les likes)
    if (!type || type === 'posts' || type === 'all') {
      const trendingPosts = await Post.aggregate([
        { $addFields: { likesCount: { $size: { $ifNull: ['$likes', []] } } } },
        { $sort: { likesCount: -1, createdAt: -1 } },
        { $limit: limitNum },
        { $project: { _id: 1, userId: 1, text: 1, media: 1, likesCount: 1, createdAt: 1 } }
      ]);
      
      results.posts = trendingPosts;
    }
    
    // Récupérer les tags les plus utilisés
    if (!type || type === 'tags' || type === 'all') {
      const trendingTags = await Post.aggregate([
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: limitNum },
        { $project: { _id: 0, tag: '$_id', count: 1 } }
      ]);
      
      results.tags = trendingTags;
    }
    
    res.status(200).json(results);
  } catch (error) {
    console.error('Erreur de récupération des éléments tendance:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des éléments tendance' });
  }
});

/**
 * @route GET /api/stats/top-producers/:type
 * @desc Get top producers based on choices
 * @access Public
 */
router.get('/top-producers/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    
    if (!['restaurant', 'event', 'wellness', 'all'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Type invalide. Les valeurs acceptées sont: restaurant, event, wellness, all'
      });
    }
    
    let results = [];
    
    // Fonction pour récupérer les producteurs triés par nombre de choices
    const getTopProducers = async (model, type, limit) => {
      return await model.find({
        choiceCount: { $exists: true, $gt: 0 }
      })
      .sort({ choiceCount: -1, ratingCount: -1 })
      .limit(limit)
      .select('_id name address photos category choiceCount ratingCount ratingTotals')
      .lean();
    };
    
    // Pour chaque type, calculer les moyennes de notes depuis les totaux
    const calculateAverageRatings = (producers, type) => {
      return producers.map(p => {
        const avgRatings = {};
        const totals = p.ratingTotals || {};
        const count = p.ratingCount || 0;
        
        if (count > 0) {
          if (type === 'restaurant') {
            avgRatings.service = totals.service ? (totals.service / count).toFixed(1) : null;
            avgRatings.lieu = totals.lieu ? (totals.lieu / count).toFixed(1) : null;
            avgRatings.portions = totals.portions ? (totals.portions / count).toFixed(1) : null;
            avgRatings.ambiance = totals.ambiance ? (totals.ambiance / count).toFixed(1) : null;
          } else if (type === 'wellness') {
            avgRatings.ambiance = totals.ambiance ? (totals.ambiance / count).toFixed(1) : null;
            avgRatings.service = totals.service ? (totals.service / count).toFixed(1) : null;
            avgRatings.proprete = totals.proprete ? (totals.proprete / count).toFixed(1) : null;
            avgRatings.expertise = totals.expertise ? (totals.expertise / count).toFixed(1) : null;
          }
          
          // Calculer une note globale
          const values = Object.values(avgRatings).filter(v => v !== null).map(v => parseFloat(v));
          avgRatings.overall = values.length > 0 
            ? (values.reduce((sum, val) => sum + val, 0) / values.length).toFixed(1)
            : null;
        }
        
        return {
          ...p,
          type,
          avgRatings,
          ratingTotals: undefined // Supprimer les totaux pour alléger la réponse
        };
      });
    };
    
    // Récupérer les restaurants populaires
    if (type === 'restaurant' || type === 'all') {
      const topRestaurants = await getTopProducers(Producer, 'restaurant', limit);
      const processedRestaurants = calculateAverageRatings(topRestaurants, 'restaurant');
      results = [...results, ...processedRestaurants];
    }
    
    // Récupérer les établissements de bien-être populaires
    if (type === 'wellness' || type === 'all') {
      const topWellnessPlaces = await getTopProducers(Producer, 'wellness', limit);
      const processedWellnessPlaces = calculateAverageRatings(topWellnessPlaces, 'wellness');
      results = [...results, ...processedWellnessPlaces];
    }
    
    // Récupérer les producteurs d'événements populaires
    if (type === 'event' || type === 'all') {
      const topEventProducers = await getTopProducers(LeisureProducer, 'event', limit);
      const processedEventProducers = topEventProducers.map(p => ({
        ...p,
        type: 'event',
        choiceCount: p.totalEventChoices,
        ratingCount: p.eventsPopularity?.totalRatings || 0,
        eventsPopularity: undefined // Supprimer pour alléger la réponse
      }));
      
      results = [...results, ...processedEventProducers];
    }
    
    // En mode 'all', trier tous les résultats par nombre de choices
    if (type === 'all') {
      results.sort((a, b) => b.choiceCount - a.choiceCount);
      results = results.slice(0, limit); // Limiter à 'limit' résultats
    }
    
    res.status(200).json({
      success: true,
      count: results.length,
      data: results
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des producteurs populaires:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/stats/restaurant/:producerId
 * @desc    Récupérer les statistiques générales d'un restaurant
 * @access  Private (producteur authentifié)
 */
router.get('/restaurant/:producerId', statsController.getRestaurantStats);

/**
 * @route   GET /api/stats/restaurant/:producerId/menu
 * @desc    Récupérer les statistiques du menu d'un restaurant
 * @access  Private (producteur authentifié)
 */
router.get('/restaurant/:producerId/menu', statsController.getMenuStats);

/**
 * @route   GET /api/stats/restaurant/:producerId/engagement
 * @desc    Récupérer les statistiques d'engagement d'un restaurant
 * @access  Private (producteur authentifié)
 */
router.get('/restaurant/:producerId/engagement', statsController.getEngagementStats);

/**
 * @route   GET /api/stats/restaurant/:producerId/daily
 * @desc    Récupérer les statistiques quotidiennes pour les graphiques
 * @access  Private (producteur authentifié)
 */
router.get('/restaurant/:producerId/daily', statsController.getDailyStats);

module.exports = router; 