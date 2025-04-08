const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Post = require('../models/Post');
const Producer = require('../models/Producer');
const LeisureProducer = require('../models/leisureProducer');
const BeautyProducer = require('../models/beautyProducer');
const Event = require('../models/event');
const { Conversation } = require('../models/conversation');

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
        Producer = require('../models/beautyProducer');
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
    } else if (type === 'beauty') {
      stats.servicesCount = producer.services?.length || 0;
      stats.appointmentsCount = producer.appointment_system?.slots?.length || 0;
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
      BeautyProducer.countDocuments(),
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
        
        BeautyProducer.find()
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

module.exports = router; 