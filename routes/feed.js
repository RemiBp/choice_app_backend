const express = require('express');
const router = express.Router(); // Définition du routeur
const calculateDistance = require('../services/distanceService'); // Fonction utilitaire pour la distance
const { ObjectId } = require('mongodb'); // Pour la conversion des ID

// Fonction pour calculer le score du post
function calculatePostScore(user, post, now) {
  let score = 0;

  // Correspondance des tags
  const tagsMatched = post.tags?.filter((tag) => user.liked_tags?.includes(tag)).length || 0;
  score += tagsMatched * 10;

  // Cercle de confiance
  if (user.trusted_circle?.includes(post.author_id)) score += 25;

  // Bonus de récence
  const hoursSincePosted = (now - new Date(post.time_posted)) / (1000 * 60 * 60);
  score += Math.max(0, 20 - hoursSincePosted);

  // Retour du score
  return score;
}

/**
 * Récupère les informations de l'auteur d'un post depuis les collections appropriées
 * @param {Object} post - Le post pour lequel récupérer les infos de l'auteur
 * @param {Object} collections - Les collections MongoDB disponibles
 * @returns {Promise<Object>} - Les informations enrichies de l'auteur
 */
async function getAuthorInfo(post, collections) {
  try {
    // Vérifie si c'est un post d'un restaurant/producteur ou d'un utilisateur
    if (post.isProducerPost || post.author_type === 'producer') {
      // Essayer d'abord dans la collection des producteurs de restauration
      let producer = null;
      
      // Vérifier si le post est lié à un producteur de loisir
      if (post.isLeisureProducer) {
        try {
          // Tenter de trouver dans la collection Loisir_Paris_Producers
          const db = collections.choiceAppDb.client.db("Loisir&Culture");
          const leisureProducersCollection = db.collection("Loisir_Paris_Producers");
          
          producer = await leisureProducersCollection.findOne({ 
            _id: typeof post.author_id === 'string' ? post.author_id : new ObjectId(post.author_id) 
          });
          
          if (producer) {
            return {
              author_name: producer.lieu || "Établissement de loisir",
              author_photo: producer.image || producer.photos?.[0] || null,
              author_id: producer._id.toString(),
              author_type: 'leisure_producer',
              isLeisureProducer: true
            };
          }
        } catch (err) {
          console.log(`Erreur lors de la recherche du producteur de loisir: ${err}`);
        }
      } else {
        // Tenter de récupérer depuis la collection des restaurants
        try {
          const db = collections.choiceAppDb.client.db("Restauration_Officielle");
          const producersCollection = db.collection("producers");
          
          producer = await producersCollection.findOne({ 
            _id: typeof post.author_id === 'string' ? post.author_id : new ObjectId(post.author_id) 
          });
          
          if (producer) {
            return {
              author_name: producer.name || "Restaurant",
              author_photo: producer.photo || 
                            (producer.photos && producer.photos.length > 0 ? producer.photos[0] : null),
              author_id: producer._id.toString(),
              author_type: 'producer',
              isProducerPost: true
            };
          }
        } catch (err) {
          console.log(`Erreur lors de la recherche du restaurant: ${err}`);
        }
      }
    }
    
    // Par défaut ou si c'est un post utilisateur, chercher dans la collection utilisateurs
    try {
      const usersCollection = collections.choiceAppDb.collection("Users");
      const user = await usersCollection.findOne({ 
        _id: typeof post.author_id === 'string' ? post.author_id : new ObjectId(post.author_id) 
      });
      
      if (user) {
        return {
          author_name: user.name || "Utilisateur",
          author_photo: user.photo_url || null,
          author_id: user._id.toString(),
          author_type: 'user'
        };
      }
    } catch (err) {
      console.log(`Erreur lors de la recherche de l'utilisateur: ${err}`);
    }
    
    // Informations par défaut si aucune correspondance n'est trouvée
    return {
      author_name: post.author_name || "Utilisateur inconnu",
      author_photo: post.author_photo || null,
      author_id: post.author_id || null,
      author_type: post.author_type || 'user'
    };
  } catch (error) {
    console.error(`Erreur lors de la récupération des infos d'auteur: ${error}`);
    return {
      author_name: "Utilisateur",
      author_photo: null,
      author_id: post.author_id || null,
      author_type: 'user'
    };
  }
}

// Route principale pour générer le feed
router.get('/', async (req, res) => {
  const { userId, limit = 10, query, page = 1, content_type } = req.query;
  const pageSize = parseInt(limit, 10);
  const currentPage = parseInt(page, 10);
  const skip = (currentPage - 1) * pageSize;

  if (!userId) {
    return res.status(400).json({ error: 'User ID est requis.' });
  }

  try {
    // Récupération des collections MongoDB
    const collections = {
      choiceAppDb: req.app.locals.choiceAppDb,
      testDb: req.app.locals.testDb
    };
    
    const usersCollection = collections.choiceAppDb.collection("Users");
    const postsCollection = collections.choiceAppDb.collection("Posts");

    // Récupération de l'utilisateur
    const user = await usersCollection.findOne({ 
      _id: typeof userId === 'string' ? userId : new ObjectId(userId) 
    });
    
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé.' });
    }

    // Construction de la requête MongoDB
    let query = {};
    
    // Filtrage par type de contenu si spécifié
    if (content_type) {
      if (content_type === 'restaurants') {
        query.isProducerPost = true;
        query.isLeisureProducer = { $ne: true };
      } else if (content_type === 'leisure') {
        query.isLeisureProducer = true;
      } else if (content_type === 'users') {
        query.isProducerPost = { $ne: true };
      }
    }

    // Récupération des posts avec pagination
    let posts = await postsCollection.find(query)
      .sort({ time_posted: -1 })
      .skip(skip)
      .limit(pageSize)
      .toArray();

    const now = new Date();

    // Enrichir les posts avec les informations d'auteur et calculer le score
    const feed = await Promise.all(
      posts.map(async (post) => {
        // Récupération des infos de l'auteur
        const authorInfo = await getAuthorInfo(post, collections);
        
        // Calcul du score de pertinence
        const score = calculatePostScore(user, post, now);
        
        return {
          ...post,
          author_name: authorInfo.author_name,
          author_photo: authorInfo.author_photo,
          author_id: authorInfo.author_id,
          author_type: authorInfo.author_type,
          isProducerPost: post.isProducerPost || authorInfo.author_type === 'producer' || authorInfo.author_type === 'leisure_producer',
          isLeisureProducer: post.isLeisureProducer || authorInfo.author_type === 'leisure_producer',
          relevance_score: score,
        };
      })
    );

    // Organisez le feed pour une meilleure diversité
    const organizedFeed = organizeFeedForDiversity(feed, user);

    // Compte total pour la pagination
    const totalPosts = await postsCollection.countDocuments(query);
    
    res.json({
      feed: organizedFeed,
      pagination: {
        currentPage,
        pageSize,
        totalPosts,
        totalPages: Math.ceil(totalPosts / pageSize),
        hasMore: currentPage * pageSize < totalPosts
      }
    });
  } catch (error) {
    console.error('Erreur lors de la génération du feed :', error);
    res.status(500).json({ error: 'Erreur interne du serveur.' });
  }
});

/**
 * Réorganise le feed pour assurer une diversité entre les types de contenu
 * @param {Array} feed - Les posts du feed
 * @param {Object} user - L'utilisateur actuel
 * @returns {Array} - Le feed réorganisé
 */
function organizeFeedForDiversity(feed, user) {
  // Séparer les posts par catégorie
  const restaurantPosts = feed.filter(p => p.isProducerPost && !p.isLeisureProducer);
  const leisurePosts = feed.filter(p => p.isLeisureProducer);
  const userPosts = feed.filter(p => !p.isProducerPost && !p.isLeisureProducer);
  
  // Identifier les posts provenant du cercle de confiance
  const trustedCirclePosts = feed.filter(p => 
    user.trusted_circle?.includes(p.author_id) && !p.isProducerPost
  );
  
  // Identifier les posts des producteurs suivis
  const followedProducerPosts = feed.filter(p => 
    p.isProducerPost && user.followingProducers?.includes(p.author_id)
  );
  
  // Organiser le feed de manière alternée
  const organizedFeed = [];
  const maxLength = Math.max(
    restaurantPosts.length, 
    leisurePosts.length, 
    userPosts.length,
    trustedCirclePosts.length,
    followedProducerPosts.length
  );
  
  // Prioriser les posts du cercle de confiance et des producteurs suivis
  const priorityPosts = [...trustedCirclePosts, ...followedProducerPosts];
  
  // Ajouter d'abord jusqu'à 3 posts prioritaires
  for (let i = 0; i < Math.min(3, priorityPosts.length); i++) {
    organizedFeed.push(priorityPosts[i]);
  }
  
  // Puis mélanger les différents types de posts
  for (let i = 0; i < maxLength; i++) {
    // Ajouter un post utilisateur si disponible
    if (i < userPosts.length && !organizedFeed.some(p => p._id === userPosts[i]._id)) {
      organizedFeed.push(userPosts[i]);
    }
    
    // Ajouter un post restaurant si disponible
    if (i < restaurantPosts.length && !organizedFeed.some(p => p._id === restaurantPosts[i]._id)) {
      organizedFeed.push(restaurantPosts[i]);
    }
    
    // Ajouter un post loisir si disponible
    if (i < leisurePosts.length && !organizedFeed.some(p => p._id === leisurePosts[i]._id)) {
      organizedFeed.push(leisurePosts[i]);
    }
  }
  
  // Ajouter les posts restants qui n'ont pas déjà été inclus
  for (const post of feed) {
    if (!organizedFeed.some(p => p._id === post._id)) {
      organizedFeed.push(post);
    }
  }
  
  return organizedFeed;
}

module.exports = router; // Exportation du routeur
