const mongoose = require('mongoose');
const { createModel, databases } = require('../utils/modelCreator');
const config = require('../config');

// Initialiser les modèles directement avec notre utilitaire
const Post = createModel(
  databases.CHOICE_APP,
  'Post',
  'Posts'
);

const User = createModel(
  databases.CHOICE_APP,
  'User',
  'Users'
);

const Producer = createModel(
  databases.RESTAURATION,
  'Producer',
  'Producers'
);

const LeisureProducer = createModel(
  databases.LOISIR,
  'LeisureProducer',
  'LeisureProducers'
);

const BeautyProducer = createModel(
  databases.BEAUTY_WELLNESS,
  'BeautyProducer',
  'BeautyProducers'
);

const Event = createModel(
  databases.LOISIR,
  'Event',
  'Events'
);

// Fonction utilitaire pour traiter les URLs des médias
const processMediaUrls = (url, options = {}) => {
  if (!url) return null;
  
  // Traitement des URLs Google Maps Photo References
  if (url.includes('googleapis.com/maps/api/place/photo') && url.includes('photoreference=')) {
    try {
      // Extraire et limiter la longueur de la photoreference
      const urlObj = new URL(url);
      const photoReference = urlObj.searchParams.get('photoreference');
      
      // Si la photoreference est trop longue (plus de 100 caractères), c'est probablement une erreur
      // Google Maps API accepte généralement des références de moins de 100 caractères
      if (photoReference && photoReference.length > 100) {
        console.log(`⚠️ Reference photo Google Maps trop longue (${photoReference.length} chars), utilisation d'une image placeholder`);
        return 'https://via.placeholder.com/400x300?text=Photo+indisponible';
      }
      
      // Vérifier que l'URL a une clé API valide
      const apiKey = urlObj.searchParams.get('key');
      if (!apiKey || apiKey.trim() === '') {
        console.log('⚠️ Clé API Google Maps manquante, utilisation d\'une image placeholder');
        return 'https://via.placeholder.com/400x300?text=Photo+indisponible';
      }
      
      // Limiter la longueur maximale de l'URL
      if (url.length > 500) {
        console.log(`⚠️ URL Google Maps trop longue (${url.length} chars), utilisation d'une image placeholder`);
        return 'https://via.placeholder.com/400x300?text=Photo+indisponible';
      }
      
      return url;
    } catch (error) {
      console.error('❌ Erreur lors du traitement de l\'URL Google Maps:', error);
      return 'https://via.placeholder.com/400x300?text=Photo+indisponible';
    }
  }
  
  return url;
};

/**
 * Contrôleur pour les fonctionnalités de feed/flux d'activité
 */
const feedController = {
  /**
   * Obtenir le feed principal
   */
  getFeed: async (req, res) => {
    try {
      const { userId, limit = 20, page = 1, filter } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      if (!userId) {
        return res.status(400).json({ message: 'UserId requis' });
      }
      
      // Récupérer l'utilisateur pour obtenir ses préférences et relations
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé' });
      }
      
      // Construire la requête de base
      let query = {};
      
      // Filtres supplémentaires en fonction des paramètres
      if (filter === 'liked') {
        query.likes = { $in: [userId] };
      } else if (filter === 'commented') {
        query.comments = { $elemMatch: { userId: userId } };
      } else if (filter === 'shared') {
        query.sharedBy = { $in: [userId] };
      }
      
      // Récupérer les posts avec population des relations
      const posts = await Post.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('userId', 'name username profilePicture photo_url')
        .populate({
          path: 'producer_id',
          select: 'name photo_url type category',
          model: function() {
            return this.producerType === 'Producer' ? Producer :
                   this.producerType === 'LeisureProducer' ? LeisureProducer :
                   this.producerType === 'BeautyProducer' ? BeautyProducer : null;
          }
        })
        .populate('event_id', 'title description date category');
      
      // Transformer les posts pour ajouter des métadonnées
      const transformedPosts = await Promise.all(posts.map(async (post) => {
        const postObj = post.toObject();
        
        // Traiter les URLs des médias pour éviter les erreurs
        if (postObj.media && Array.isArray(postObj.media)) {
          postObj.media = postObj.media.map(mediaItem => {
            if (typeof mediaItem === 'string') {
              return processMediaUrls(mediaItem);
            } else if (mediaItem && typeof mediaItem === 'object' && mediaItem.url) {
              mediaItem.url = processMediaUrls(mediaItem.url);
              return mediaItem;
            }
            return mediaItem;
          }).filter(Boolean); // Filtrer les éléments null ou undefined
        }
        
        // Déterminer le type de post et adapter la structure en conséquence
        let producerData = null;
        if (postObj.producer_id) {
          // Adapter selon le type de producteur
          if (postObj.producerType === 'Producer' || postObj.producerType === 'BeautyProducer') {
            producerData = {
              id: postObj.producer_id._id,
              name: postObj.producer_id.name,
              photo: postObj.producer_id.photo_url,
              type: postObj.producer_id.type,
              category: postObj.producer_id.category,
              hasChoice: true,
              hasInterests: true
            };
          } else if (postObj.producerType === 'LeisureProducer') {
            producerData = {
              id: postObj.producer_id._id,
              name: postObj.producer_id.name,
              photo: postObj.producer_id.photo_url,
              type: postObj.producer_id.type,
              category: postObj.producer_id.category,
              hasChoice: postObj.event_id ? true : false,
              hasInterests: true
            };
          }
        }

        // Adapter l'événement si présent
        let eventData = null;
        if (postObj.event_id) {
          eventData = {
            id: postObj.event_id._id,
            title: postObj.event_id.title,
            description: postObj.event_id.description,
            date: postObj.event_id.date,
            category: postObj.event_id.category
          };
        }

        // Adapter l'utilisateur si présent
        let userData = null;
        if (postObj.userId) {
          userData = {
            id: postObj.userId._id,
            name: postObj.userId.name,
            username: postObj.userId.username,
            profilePicture: postObj.userId.profilePicture || postObj.userId.photo_url,
            hasChoice: false,
            hasInterests: false
          };
        }
        
        return {
          ...postObj,
          media,
          userLiked: postObj.likes?.includes(userId) || false,
          userCommented: postObj.comments?.some(c => c.userId.toString() === userId) || false,
          userShared: postObj.sharedBy?.includes(userId) || false,
          user: userData,
          producer: producerData,
          event: eventData,
          features: {
            canChoice: producerData?.hasChoice || false,
            canInteract: true,
            canShare: true,
            canComment: true
          }
        };
      }));
      
      // Compter le nombre total de posts
      const total = await Post.countDocuments(query);
      
      res.status(200).json({
        posts: transformedPosts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      console.error('❌ Erreur de récupération du feed:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération du feed', error: error.message });
    }
  },
  
  /**
   * Obtenir le flux de découverte
   */
  getDiscoveryFeed: async (req, res) => {
    try {
      const { userId, limit = 20, page = 1 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      if (!userId) {
        return res.status(400).json({ message: 'UserId requis' });
      }
      
      // Récupérer l'utilisateur pour obtenir ses préférences
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé' });
      }
      
      // Récupérer les intérêts et tags préférés de l'utilisateur
      const userInterests = user.interests || [];
      const userLikedTags = user.liked_tags || [];
      
      // Construire une requête qui prend en compte les intérêts mais montre aussi du contenu varié
      let query = {
        $or: [
          { tags: { $in: userLikedTags } }, // Posts avec tags similaires aux préférences
          { interests: { $in: userInterests } } // Posts avec intérêts similaires aux préférences
        ]
      };
      
      // Exclure les posts déjà vus, si l'information est disponible
      if (user.viewed_posts && user.viewed_posts.length > 0) {
        query._id = { $nin: user.viewed_posts };
      }
      
      // Récupérer les posts
      const posts = await Post.find(query)
        .sort({ createdAt: -1, likes: -1 }) // Prioriser nouveau contenu et populaire
        .skip(skip)
        .limit(parseInt(limit))
        .populate('userId', 'name username profilePicture photo_url');
      
      // Si pas assez de posts trouvés avec les intérêts, compléter avec d'autres posts populaires
      let discoveryPosts = [...posts];
      
      if (discoveryPosts.length < parseInt(limit)) {
        // Combien de posts supplémentaires sont nécessaires
        const additionalNeeded = parseInt(limit) - discoveryPosts.length;
        
        // Exclure les IDs déjà récupérés
        const excludeIds = [...discoveryPosts.map(p => p._id)];
        if (user.viewed_posts) {
          excludeIds.push(...user.viewed_posts);
        }
        
        // Récupérer des posts populaires supplémentaires
        const additionalPosts = await Post.find({ _id: { $nin: excludeIds } })
          .sort({ likes: -1 }) // Trier par popularité
          .limit(additionalNeeded)
          .populate('userId', 'name username profilePicture photo_url');
          
        discoveryPosts = [...discoveryPosts, ...additionalPosts];
      }
      
      // Transformer pour ajouter des métadonnées
      const transformedPosts = discoveryPosts.map(post => {
        const postObj = post.toObject();
        
        return {
          ...postObj,
          userLiked: postObj.likes?.includes(userId) || false,
          userCommented: postObj.comments?.some(c => c.userId.toString() === userId) || false,
          userShared: postObj.sharedBy?.includes(userId) || false,
        };
      });
      
      res.status(200).json({
        posts: transformedPosts
      });
    } catch (error) {
      console.error('❌ Erreur de récupération du feed de découverte:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération du feed de découverte', error: error.message });
    }
  },
  
  /**
   * Obtenir le flux des utilisateurs suivis
   */
  getFollowingFeed: async (req, res) => {
    try {
      const { userId, limit = 20, page = 1 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      if (!userId) {
        return res.status(400).json({ message: 'UserId requis' });
      }
      
      // Récupérer l'utilisateur pour obtenir sa liste d'abonnements
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé' });
      }
      
      // Liste des utilisateurs suivis
      const following = user.following || [];
      
      if (following.length === 0) {
        return res.status(200).json({ 
          posts: [],
          message: "Vous ne suivez aucun utilisateur"
        });
      }
      
      // Récupérer les posts des utilisateurs suivis
      const posts = await Post.find({ userId: { $in: following } })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('userId', 'name username profilePicture photo_url');
      
      // Transformer pour ajouter des métadonnées
      const transformedPosts = posts.map(post => {
        const postObj = post.toObject();
        
        return {
          ...postObj,
          userLiked: postObj.likes?.includes(userId) || false,
          userCommented: postObj.comments?.some(c => c.userId.toString() === userId) || false,
          userShared: postObj.sharedBy?.includes(userId) || false,
        };
      });
      
      // Compter le nombre total de posts
      const total = await Post.countDocuments({ userId: { $in: following } });
      
      res.status(200).json({
        posts: transformedPosts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      console.error('❌ Erreur de récupération du feed des abonnements:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération du feed des abonnements', error: error.message });
    }
  },
  
  /**
   * Obtenir les contenus tendance
   */
  getTrendingContent: async (req, res) => {
    try {
      const { limit = 20, timeFrame = 'week' } = req.query;
      
      // Définir la plage de temps pour les tendances
      let timeFilter = {};
      const now = new Date();
      
      if (timeFrame === 'day') {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        timeFilter = { createdAt: { $gte: yesterday } };
      } else if (timeFrame === 'week') {
        const lastWeek = new Date(now);
        lastWeek.setDate(lastWeek.getDate() - 7);
        timeFilter = { createdAt: { $gte: lastWeek } };
      } else if (timeFrame === 'month') {
        const lastMonth = new Date(now);
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        timeFilter = { createdAt: { $gte: lastMonth } };
      }
      
      // Récupérer les posts les plus populaires
      const trendingPosts = await Post.find(timeFilter)
        .sort({ 
          likes: -1,          // D'abord par nombre de likes
          commentsCount: -1,  // Puis par nombre de commentaires
          views: -1,          // Puis par vues
          createdAt: -1       // Enfin, par récence
        })
        .limit(parseInt(limit))
        .populate('userId', 'name username profilePicture photo_url');
      
      res.status(200).json({
        posts: trendingPosts,
        timeFrame
      });
    } catch (error) {
      console.error('❌ Erreur de récupération des contenus tendance:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des contenus tendance', error: error.message });
    }
  },
  
  /**
   * Obtenir les activités à proximité
   */
  getNearbyActivities: async (req, res) => {
    try {
      const { latitude, longitude, radius = 5000, limit = 20 } = req.query;
      
      if (!latitude || !longitude) {
        return res.status(400).json({ message: 'Coordonnées (latitude, longitude) requises' });
      }
      
      // Recherche géospatiale
      const nearbyPosts = await Post.find({
        location: {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: [parseFloat(longitude), parseFloat(latitude)]
            },
            $maxDistance: parseInt(radius)
          }
        }
      })
      .limit(parseInt(limit))
      .sort({ createdAt: -1 })
      .populate('userId', 'name username profilePicture photo_url');
      
      res.status(200).json({
        posts: nearbyPosts,
        location: {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          radius: parseInt(radius)
        }
      });
    } catch (error) {
      console.error('❌ Erreur de récupération des activités à proximité:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des activités à proximité', error: error.message });
    }
  },
  
  /**
   * Obtenir le flux par catégorie
   */
  getFeedByCategory: async (req, res) => {
    try {
      const { category } = req.params;
      const { limit = 20, page = 1 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      if (!category) {
        return res.status(400).json({ message: 'Catégorie requise' });
      }
      
      // Récupérer les posts de la catégorie spécifiée
      const posts = await Post.find({ 
        $or: [
          { category: category },
          { tags: category }
        ]
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('userId', 'name username profilePicture photo_url');
      
      // Compter le nombre total de posts
      const total = await Post.countDocuments({ 
        $or: [
          { category: category },
          { tags: category }
        ]
      });
      
      res.status(200).json({
        posts,
        category,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      console.error(`❌ Erreur de récupération du feed pour la catégorie ${req.params.category}:`, error);
      res.status(500).json({ message: 'Erreur lors de la récupération du feed par catégorie', error: error.message });
    }
  },
  
  /**
   * Obtenir le flux d'un utilisateur spécifique
   */
  getUserFeed: async (req, res) => {
    try {
      const { userId } = req.params;
      const { limit = 20, page = 1 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      if (!userId) {
        return res.status(400).json({ message: 'UserId requis' });
      }
      
      // Vérifier que l'utilisateur existe
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé' });
      }
      
      // Récupérer les posts de l'utilisateur
      const posts = await Post.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('userId', 'name username profilePicture photo_url');
      
      // Compter le nombre total de posts
      const total = await Post.countDocuments({ userId });
      
      res.status(200).json({
        posts,
        user: {
          _id: user._id,
          name: user.name,
          username: user.username,
          profilePicture: user.profilePicture || user.photo_url
        },
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      console.error(`❌ Erreur de récupération du feed de l'utilisateur ${req.params.userId}:`, error);
      res.status(500).json({ message: 'Erreur lors de la récupération du feed utilisateur', error: error.message });
    }
  }
};

module.exports = feedController; 