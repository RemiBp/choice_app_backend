const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Importer les modèles nécessaires
let Producer;
let Post;
let User;

// Initialiser les connexions et modèles
const initModels = async () => {
  try {
    // Modèle pour les producteurs (restaurants)
    const restaurantDb = mongoose.createConnection(process.env.MONGO_URI, {
      dbName: 'Restauration_Officielle',
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    Producer = restaurantDb.model(
      'Producer',
      new mongoose.Schema({
        name: String,
        description: String,
        photo: String,
        category: [String],
        followers: [String],
        gps_coordinates: {
          type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
          },
          coordinates: {
            type: [Number],
            index: '2dsphere'
          }
        }
      }, { strict: false }),
      'producers'
    );

    // Modèle pour les posts et utilisateurs
    const choiceAppDb = mongoose.createConnection(process.env.MONGO_URI, {
      dbName: 'choice_app',
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    Post = choiceAppDb.model(
      'Post',
      new mongoose.Schema({}, { strict: false }),
      'posts'
    );
    
    User = choiceAppDb.model(
      'User',
      new mongoose.Schema({}, { strict: false }),
      'users'
    );

    console.log('✅ Modèles Feed Producteur initialisés avec succès');
  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation des modèles Feed Producteur', error);
  }
};

// Initialiser les modèles au démarrage
initModels();

// Route pour récupérer les posts du lieu (venue-posts)
router.get('/:producerId/venue-posts', async (req, res) => {
  try {
    const { producerId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    // Vérifier si l'ID est valide
    if (!mongoose.Types.ObjectId.isValid(producerId)) {
      return res.status(400).json({ message: 'ID de producteur invalide.' });
    }

    // Récupérer le producteur
    const producer = await Producer.findById(producerId);
    if (!producer) {
      return res.status(404).json({ message: 'Producteur non trouvé.' });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Récupérer les posts associés à ce producteur
    const venuePosts = await Post.find({
      producer_id: producerId,
      // Ne pas inclure les posts automatisés dans cette section
      $or: [
        { is_automated: { $exists: false } },
        { is_automated: false }
      ]
    })
    .sort({ time_posted: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

    // Ajouter des informations supplémentaires pour l'affichage
    const enrichedPosts = venuePosts.map(post => ({
      ...post,
      isProducerPost: true,
      isLeisureProducer: producer.category?.includes('Loisir') || false,
      author_name: producer.name || 'Établissement',
      author_avatar: producer.photo || '',
      author_id: producerId,
    }));

    // Récupérer le nombre total de posts pour la pagination
    const totalPosts = await Post.countDocuments({
      producer_id: producerId,
      $or: [
        { is_automated: { $exists: false } },
        { is_automated: false }
      ]
    });

    res.status(200).json({
      items: enrichedPosts,
      page: parseInt(page),
      limit: parseInt(limit),
      total_pages: Math.ceil(totalPosts / parseInt(limit)),
      total: totalPosts,
      hasMore: skip + enrichedPosts.length < totalPosts
    });
  } catch (err) {
    console.error('❌ Erreur lors de la récupération des posts du lieu :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// Route pour récupérer les interactions liées à l'activité du producteur
router.get('/:producerId/interactions', async (req, res) => {
  try {
    const { producerId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    // Vérifier si l'ID est valide
    if (!mongoose.Types.ObjectId.isValid(producerId)) {
      return res.status(400).json({ message: 'ID de producteur invalide.' });
    }

    // Récupérer le producteur
    const producer = await Producer.findById(producerId);
    if (!producer) {
      return res.status(404).json({ message: 'Producteur non trouvé.' });
    }
    
    // Récupérer les followers du producteur
    const followerIds = producer.followers || [];
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Récupérer les posts mentionnant ce producteur
    const mentionPosts = await Post.find({
      content: { $regex: producer.name, $options: 'i' },
      producer_id: { $ne: producerId } // Exclure les posts du producteur lui-même
    })
    .sort({ time_posted: -1 })
    .limit(parseInt(limit) / 2)
    .lean();

    // Récupérer les posts des followers
    const followerPosts = await Post.find({
      user_id: { $in: followerIds },
      producer_id: { $ne: producerId } // Exclure les posts du producteur lui-même
    })
    .sort({ time_posted: -1 })
    .limit(parseInt(limit) / 2)
    .lean();

    // Fusionner et trier les résultats
    const allInteractions = [...mentionPosts, ...followerPosts]
      .sort((a, b) => new Date(b.time_posted) - new Date(a.time_posted))
      .slice(0, parseInt(limit));

    // Enrichir les posts avec les informations utilisateur
    const userIds = [...new Set(allInteractions.map(post => post.user_id).filter(id => id))];
    const users = await User.find({ _id: { $in: userIds } }).lean();
    const userMap = users.reduce((acc, user) => {
      acc[user._id.toString()] = user;
      return acc;
    }, {});

    const enrichedInteractions = allInteractions.map(post => {
      const user = post.user_id ? userMap[post.user_id.toString()] : null;
      return {
        ...post,
        author_name: user?.name || 'Utilisateur',
        author_avatar: user?.photo_url || '',
        isInteraction: true,
        interactionType: post.content?.includes(producer.name) ? 'mention' : 'follower'
      };
    });

    res.status(200).json({
      items: enrichedInteractions,
      page: parseInt(page),
      limit: parseInt(limit),
      hasMore: enrichedInteractions.length >= parseInt(limit)
    });
  } catch (err) {
    console.error('❌ Erreur lors de la récupération des interactions :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// Route pour récupérer les tendances locales
router.get('/:producerId/local-trends', async (req, res) => {
  try {
    const { producerId } = req.params;
    const { page = 1, limit = 10, radius = 5000 } = req.query;
    
    // Vérifier si l'ID est valide
    if (!mongoose.Types.ObjectId.isValid(producerId)) {
      return res.status(400).json({ message: 'ID de producteur invalide.' });
    }

    // Récupérer le producteur
    const producer = await Producer.findById(producerId);
    if (!producer) {
      return res.status(404).json({ message: 'Producteur non trouvé.' });
    }

    // Récupérer les coordonnées du lieu
    const coordinates = producer.gps_coordinates?.coordinates || [0, 0];
    
    // Récupérer les producteurs à proximité (concurrents)
    const nearbyProducers = await Producer.find({
      _id: { $ne: producerId }, // Exclure le producteur lui-même
      gps_coordinates: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: coordinates
          },
          $maxDistance: parseInt(radius)
        }
      },
      // Filtrer par catégorie similaire
      category: { $in: producer.category || [] }
    })
    .limit(5)
    .lean();

    // Récupérer les posts populaires de la région
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Récupérer les posts tendance dans la région
    const popularPosts = await Post.find({
      // Posts avec coordonnées dans le rayon
      'location.coordinates': {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: coordinates
          },
          $maxDistance: parseInt(radius)
        }
      },
      // Posts avec un engagement élevé
      $or: [
        { likes_count: { $gte: 5 } },
        { comments: { $size: { $gte: 3 } } }
      ]
    })
    .sort({ time_posted: -1, likes_count: -1 })
    .skip(skip)
    .limit(parseInt(limit) - nearbyProducers.length) // Laisser de la place pour les concurrents
    .lean();

    // Créer des "posts" à partir des données des concurrents
    const competitorPosts = nearbyProducers.map(competitor => {
      // Calculer la distance entre le producteur et le concurrent
      const distance = calculateDistance(
        coordinates[1], // latitude
        coordinates[0], // longitude
        competitor.gps_coordinates?.coordinates[1] || 0,
        competitor.gps_coordinates?.coordinates[0] || 0
      );
      
      return {
        _id: `competitor_${competitor._id}`,
        producer_id: competitor._id,
        content: `${competitor.name} est un établissement concurrent à ${Math.round(distance * 10) / 10} km. Ils proposent ${competitor.category?.join(', ') || 'une offre similaire'}.`,
        author_name: 'Tendances Locales',
        author_avatar: '',
        posted_at: new Date().toISOString(),
        time_posted: new Date().toISOString(),
        isProducerPost: true,
        is_competitor: true,
        is_trending: true,
        likes_count: 0,
        comments: [],
        location: {
          name: competitor.name,
          address: competitor.address,
          coordinates: competitor.gps_coordinates?.coordinates || [0, 0],
          distance: `${Math.round(distance * 10) / 10} km`
        },
        media: competitor.photos || [],
        tags: competitor.category || []
      };
    });

    // Combiner et enrichir tous les posts
    const allTrendPosts = [...competitorPosts, ...popularPosts];
    
    // Trier par nouveauté et engagement
    allTrendPosts.sort((a, b) => {
      // Privilégier les posts tendance
      if (a.is_trending && !b.is_trending) return -1;
      if (!a.is_trending && b.is_trending) return 1;
      
      // Puis par date et engagement
      const dateA = new Date(a.time_posted || a.posted_at);
      const dateB = new Date(b.time_posted || b.posted_at);
      const likesA = a.likes_count || 0;
      const likesB = b.likes_count || 0;
      
      // Score combiné
      const scoreA = dateA.getTime() / 1000 + likesA * 3600; // 1 like = 1 heure de fraîcheur
      const scoreB = dateB.getTime() / 1000 + likesB * 3600;
      
      return scoreB - scoreA;
    });

    // Limiter au nombre demandé
    const resultPosts = allTrendPosts.slice(0, parseInt(limit));

    res.status(200).json({
      items: resultPosts,
      page: parseInt(page),
      limit: parseInt(limit),
      hasMore: false // Pas de pagination pour les tendances locales
    });
  } catch (err) {
    console.error('❌ Erreur lors de la récupération des tendances locales :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// Fonction utilitaire pour calculer la distance entre deux points géographiques
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Rayon de la Terre en km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c; // Distance en km
}

function deg2rad(deg) {
  return deg * (Math.PI/180);
}

module.exports = router; 