const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { createModel, databases } = require('../utils/modelCreator');

// Initialiser les modèles avec l'utilitaire
const Post = createModel(
  databases.CHOICE_APP,
  'Post',
  'Posts'
);

// Middleware d'authentification (à implémenter si nécessaire)
const auth = async (req, res, next) => {
  // Ajouter l'authentification si nécessaire
  next();
};

// Importer la fonction d'enrichissement de posts depuis posts.js
// Cette fonction est supposée être la même que dans posts.js
async function enrichPostWithAuthorInfo(post) {
  if (!post) return null;
  
  const postObj = post instanceof mongoose.Model ? post.toObject() : post;
  
  try {
    // Si c'est un post utilisateur
    if (postObj.user_id) {
      try {
        // Utiliser directement mongoose.connection pour accéder à la collection
        const db = mongoose.connection.useDb(databases.CHOICE_APP);
        const userCollection = db.collection('Users');
        
        let userId;
        try {
          userId = new mongoose.Types.ObjectId(postObj.user_id);
        } catch (e) {
          userId = postObj.user_id; // Utiliser l'ID tel quel si conversion impossible
        }
        
        const user = await userCollection.findOne({ _id: userId });
        
        if (user) {
          postObj.author_name = user.name || user.displayName || 'Utilisateur';
          postObj.author_avatar = user.avatar || user.photo || user.profile_pic;
          postObj.authorName = postObj.author_name; // Pour compatibilité frontend
          postObj.authorAvatar = postObj.author_avatar; // Pour compatibilité frontend
          postObj.authorId = postObj.user_id; // Pour compatibilité frontend
          
          // Définir explicitement le type pour l'affichage coloré
          postObj.producer_type = 'user';
          postObj.producerType = 'user';
          postObj.isUserPost = true;
        }
      } catch (e) {
        console.error(`Erreur lors de la récupération de l'utilisateur: ${e}`);
      }
    } 
    // Si c'est un post de producteur
    else if (postObj.producer_id) {
      try {
        let producer;
        const producerId = postObj.producer_id;
        let dbName = databases.RESTAURATION; // Base par défaut (restaurants)
        let collectionName = 'Producers'; // Collection par défaut
        
        // Déterminer la base de données et la collection en fonction du type de producteur
        if (postObj.producer_type === 'leisure') {
          dbName = databases.LOISIR;
          collectionName = 'Loisir_Paris_Producers';
        } else if (postObj.producer_type === 'wellness') {
          dbName = databases.BEAUTY_WELLNESS;
          collectionName = 'Beauty_Wellness_Producers';
        }
        
        // Accéder à la bonne base de données
        const db = mongoose.connection.useDb(dbName);
        const producerCollection = db.collection(collectionName);
        
        let producerObjectId;
        try {
          producerObjectId = new mongoose.Types.ObjectId(producerId);
        } catch (e) {
          producerObjectId = producerId; // Utiliser l'ID tel quel si conversion impossible
        }
        
        producer = await producerCollection.findOne({ _id: producerObjectId });
        
        if (producer) {
          postObj.author_name = producer.name || producer.title || 'Établissement';
          postObj.author_avatar = producer.photo || producer.image || producer.logo;
          postObj.authorName = postObj.author_name; // Pour compatibilité frontend
          postObj.authorAvatar = postObj.author_avatar; // Pour compatibilité frontend
          postObj.authorId = postObj.producer_id; // Pour compatibilité frontend
        }
      } catch (e) {
        console.error(`Erreur lors de la récupération du producteur: ${e}`);
      }
    }
    
    // Ajout des propriétés pour les contours colorés dans l'interface
    if (postObj.producer_type) {
      // Propriétés pour le type de post
      postObj.isProducerPost = !!postObj.producer_id;
      postObj.isLeisureProducer = postObj.producer_type === 'leisure';
      postObj.isRestaurationProducer = postObj.producer_type === 'restaurant';
      postObj.isBeautyProducer = postObj.producer_type === 'wellness';
      postObj.isUserPost = postObj.producer_type === 'user';
      
      // Ajouter aussi les versions sans "is" pour compatibilité
      postObj.producerPost = postObj.isProducerPost;
      postObj.leisureProducer = postObj.isLeisureProducer;
      postObj.restaurationProducer = postObj.isRestaurationProducer;
      postObj.beautyProducer = postObj.isBeautyProducer;
      postObj.userPost = postObj.isUserPost;
    } else {
      // Si pas de producer_type défini, considérer comme post utilisateur
      postObj.producer_type = 'user';
      postObj.producerType = 'user';
      postObj.isUserPost = true;
      postObj.userPost = true;
    }
  } catch (error) {
    console.error(`Erreur lors de l'enrichissement du post: ${error}`);
  }
  
  return postObj;
}

// GET /:producerId - Obtenir le feed principal d'un producteur
router.get('/:producerId', auth, async (req, res) => {
  try {
    const producerId = req.params.producerId;
    const { page = 1, limit = 10, filter = 'venue' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    console.log(`🏪 Récupération du feed producteur: ${producerId} (filtre: ${filter})`);

    let query = {};
    let posts = [];
    let total = 0;

    // Construire la requête en fonction du filtre
    switch (filter) {
      case 'venue':
        // Posts spécifiques à l'établissement
        query = { 
          $or: [
            { producer_id: producerId },
            { producerId: producerId }
          ]
        };
        break;
      
      case 'interactions':
        // Posts d'utilisateurs mentionnant l'établissement
        query = {
          $and: [
            // Post créé par un utilisateur (non-producteur)
            { user_id: { $exists: true } },
            // Qui mentionne ce producteur
            { 
              $or: [
                { mentions: producerId },
                { target_id: producerId },
                { targetId: producerId },
                { producer_id: producerId },
                { producerId: producerId }
              ]
            }
          ]
        };
        break;
      
      case 'localTrends':
        // Tendances locales (posts populaires dans la même zone)
        // D'abord récupérer les infos du producteur pour connaître sa localisation
        const db = mongoose.connection.useDb(databases.CHOICE_APP);
        const producersCollection = db.collection('Producers');
        
        let producerObjectId;
        try {
          producerObjectId = new mongoose.Types.ObjectId(producerId);
        } catch (e) {
          producerObjectId = producerId;
        }
        
        const producer = await producersCollection.findOne({ _id: producerObjectId });
        
        if (producer) {
          // Filtrer par localisation si disponible
          if (producer.location && producer.location.coordinates) {
            // Construire une requête géospatiale
            const { coordinates } = producer.location;
            const [longitude, latitude] = coordinates;
            
            // Créer un index géospatial si nécessaire (peut être fait en dehors de la route)
            // await Post.collection.createIndex({ "location.coordinates": "2dsphere" });
            
            // Trouver les posts dans un rayon autour du producteur (par exemple 5km)
            query = {
              "location.coordinates": {
                $near: {
                  $geometry: {
                    type: "Point",
                    coordinates: [longitude, latitude]
                  },
                  $maxDistance: 5000 // 5km en mètres
                }
              }
            };
          } else {
            // Fallback: posts les plus récents/populaires
            query = {}; // Tous les posts, triés par popularité ci-dessous
          }
        } else {
          // Fallback si producteur non trouvé
          query = {};
        }
        break;
      
      default:
        // Par défaut, renvoyer les posts de l'établissement
        query = { 
          $or: [
            { producer_id: producerId },
            { producerId: producerId }
          ]
        };
    }
    
    // Récupérer les posts selon la requête
    if (filter === 'localTrends') {
      // Pour les tendances locales, trier par nombre de likes/interactions
      posts = await Post.find(query)
        .sort({ likes: -1, comments: -1, posted_at: -1 })
        .skip(skip)
        .limit(parseInt(limit));
      
      total = await Post.countDocuments(query);
    } else {
      posts = await Post.find(query)
        .sort({ posted_at: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));
      
      total = await Post.countDocuments(query);
    }
    
    // Normaliser les posts et ajouter les informations d'auteur
    const normalizedPostsPromises = posts.map(post => enrichPostWithAuthorInfo(post));
    const normalizedPosts = await Promise.all(normalizedPostsPromises);
    
    console.log(`✅ Posts récupérés pour le feed producteur: ${normalizedPosts.length}`);
    
    res.status(200).json({
      posts: normalizedPosts,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération du feed producteur:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la récupération du feed producteur', 
      error: error.message 
    });
  }
});

// GET /:producerId/venue-posts - Obtenir les posts de l'établissement
router.get('/:producerId/venue-posts', auth, async (req, res) => {
  try {
    const producerId = req.params.producerId;
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Requête pour trouver les posts créés par ce producteur
    const query = { 
      $or: [
        { producer_id: producerId },
        { producerId: producerId }
      ]
    };
    
    const posts = await Post.find(query)
      .sort({ posted_at: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Normaliser les posts et ajouter les informations d'auteur
    const normalizedPostsPromises = posts.map(post => enrichPostWithAuthorInfo(post));
    const normalizedPosts = await Promise.all(normalizedPostsPromises);
    
    const total = await Post.countDocuments(query);
    
    res.status(200).json({
      posts: normalizedPosts,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des posts de l\'établissement:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la récupération des posts de l\'établissement', 
      error: error.message 
    });
  }
});

// GET /:producerId/interactions - Obtenir les interactions des utilisateurs avec l'établissement
router.get('/:producerId/interactions', auth, async (req, res) => {
  try {
    const producerId = req.params.producerId;
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Requête pour trouver les posts mentionnant ce producteur
    const query = {
      $and: [
        // Post créé par un utilisateur (non-producteur)
        { user_id: { $exists: true } },
        // Qui mentionne ce producteur
        { 
          $or: [
            { mentions: producerId },
            { target_id: producerId },
            { targetId: producerId },
            { producer_id: producerId },
            { producerId: producerId }
          ]
        }
      ]
    };
    
    const posts = await Post.find(query)
      .sort({ posted_at: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Normaliser les posts et ajouter les informations d'auteur
    const normalizedPostsPromises = posts.map(post => enrichPostWithAuthorInfo(post));
    const normalizedPosts = await Promise.all(normalizedPostsPromises);
    
    const total = await Post.countDocuments(query);
    
    res.status(200).json({
      posts: normalizedPosts,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des interactions:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la récupération des interactions', 
      error: error.message 
    });
  }
});

// Exporter le router
module.exports = router; 