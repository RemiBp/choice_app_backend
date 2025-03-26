const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

// Connexions aux différentes bases de données
const choiceDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: 'choice_app',
});

const restaurationDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: 'Restauration_Officielle',
});

const loisirDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: 'Loisir&Culture',
});

// Modèles
const Restaurant = restaurationDb.model(
  'Restaurant',
  new mongoose.Schema({}, { strict: false }),
  'producers'
);

const LeisureVenue = loisirDb.model(
  'LeisureVenue',
  new mongoose.Schema({}, { strict: false }),
  'Loisir_Paris_Producers'
);

const Post = choiceDb.model(
  'Post',
  new mongoose.Schema({}, { strict: false }),
  'Posts'
);

const User = choiceDb.model(
  'User',
  new mongoose.Schema({}, { strict: false }),
  'Users'
);

/**
 * Récupère les statistiques globales d'un producteur
 * 
 * @route GET /api/growth-analytics/:producerId/overview
 * @param {string} producerId - ID du producteur
 * @returns {Object} Statistiques globales
 */
router.get('/:producerId/overview', async (req, res) => {
  const { producerId } = req.params;
  const { period = '30' } = req.query; // période en jours (7, 30, 90, 365)
  
  try {
    if (!mongoose.isValidObjectId(producerId)) {
      return res.status(400).json({ message: 'ID de producteur invalide' });
    }

    console.log(`🔍 Récupération des statistiques pour le producteur: ${producerId} (${period} jours)`);
    
    // Déterminer si c'est un restaurant ou un lieu de loisir
    let producer = await Restaurant.findById(producerId);
    let isLeisureProducer = false;
    
    if (!producer) {
      producer = await LeisureVenue.findById(producerId);
      isLeisureProducer = true;
      
      if (!producer) {
        return res.status(404).json({ message: 'Producteur non trouvé' });
      }
    }
    
    // Calcul de la date limite pour les statistiques
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(period));
    
    // Récupérer les posts du producteur
    const posts = await Post.find({
      producer_id: producerId,
      time_posted: { $gte: cutoffDate }
    }).lean();
    
    // Calculer les statistiques de base
    const totalPosts = posts.length;
    const totalLikes = posts.reduce((sum, post) => sum + (post.likes_count || 0), 0);
    const totalComments = posts.reduce((sum, post) => sum + (post.comments?.length || 0), 0);
    const totalShares = posts.reduce((sum, post) => sum + (post.shares_count || 0), 0);
    
    // Calculer l'engagement moyen par post
    const avgEngagement = totalPosts > 0 
      ? (totalLikes + totalComments + totalShares) / totalPosts 
      : 0;
    
    // Récupérer les données de followers
    const followerCount = producer.followers?.length || 0;
    
    // Récupérer les données d'intérêts et de choix
    const interestedUsersCount = producer.interestedUsers?.length || 0;
    const choiceUsersCount = producer.choiceUsers?.length || 0;
    
    // Récupérer les posts mentionnant le producteur pour mesurer le reach
    const mentionPosts = await Post.find({
      content: { $regex: producer.name, $options: 'i' },
      producer_id: { $ne: producerId },
      time_posted: { $gte: cutoffDate }
    }).count();
    
    // Segmentation démographique des followers si disponible
    let demographics = { age: {}, gender: {}, location: {} };
    
    if (followerCount > 0 && producer.followers?.length > 0) {
      const followerUsers = await User.find({
        _id: { $in: producer.followers }
      }).select('age gender location').lean();
      
      // Agréger les données démographiques
      demographics = followerUsers.reduce((demo, user) => {
        // Segmentation par âge
        const ageGroup = getAgeGroup(user.age);
        demo.age[ageGroup] = (demo.age[ageGroup] || 0) + 1;
        
        // Segmentation par genre
        if (user.gender) {
          demo.gender[user.gender] = (demo.gender[user.gender] || 0) + 1;
        }
        
        // Segmentation par lieu
        if (user.location?.city) {
          demo.location[user.location.city] = (demo.location[user.location.city] || 0) + 1;
        }
        
        return demo;
      }, { age: {}, gender: {}, location: {} });
      
      // Convertir en pourcentages
      Object.keys(demographics.age).forEach(key => {
        demographics.age[key] = (demographics.age[key] / followerUsers.length) * 100;
      });
      
      Object.keys(demographics.gender).forEach(key => {
        demographics.gender[key] = (demographics.gender[key] / followerUsers.length) * 100;
      });
      
      // Prendre les 5 villes principales
      const sortedLocations = Object.entries(demographics.location)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      
      demographics.location = Object.fromEntries(sortedLocations);
    }
    
    // Récupérer les données de concurrents pour comparaison
    const competitors = await getCompetitors(producerId, producer, isLeisureProducer);
    
    res.status(200).json({
      producer: {
        id: producerId,
        name: producer.name,
        type: isLeisureProducer ? 'leisure' : 'restaurant',
        category: producer.category || [],
        photo: producer.photo || '',
      },
      period: parseInt(period),
      engagement: {
        posts: totalPosts,
        likes: totalLikes,
        comments: totalComments,
        shares: totalShares,
        average_per_post: avgEngagement,
      },
      followers: {
        total: followerCount,
        new: 0, // À implémenter: nombre de nouveaux followers
        growth_rate: 0, // À implémenter: taux de croissance
      },
      reach: {
        mentions: mentionPosts,
        interested_users: interestedUsersCount,
        choice_users: choiceUsersCount,
        conversion_rate: followerCount > 0 ? (choiceUsersCount / followerCount) * 100 : 0,
      },
      demographics,
      competitors
    });
  } catch (error) {
    console.error(`❌ Erreur lors de la récupération des statistiques: ${error.message}`);
    res.status(500).json({ message: 'Erreur interne du serveur', error: error.message });
  }
});

/**
 * Récupère les tendances temporelles pour un producteur
 * 
 * @route GET /api/growth-analytics/:producerId/trends
 * @param {string} producerId - ID du producteur
 * @returns {Object} Données de tendances
 */
router.get('/:producerId/trends', async (req, res) => {
  const { producerId } = req.params;
  const { period = '90' } = req.query; // période en jours (7, 30, 90, 365)
  
  try {
    if (!mongoose.isValidObjectId(producerId)) {
      return res.status(400).json({ message: 'ID de producteur invalide' });
    }
    
    // Déterminer si c'est un restaurant ou un lieu de loisir
    let producer = await Restaurant.findById(producerId);
    let isLeisureProducer = false;
    
    if (!producer) {
      producer = await LeisureVenue.findById(producerId);
      isLeisureProducer = true;
      
      if (!producer) {
        return res.status(404).json({ message: 'Producteur non trouvé' });
      }
    }
    
    // Calcul de la date limite pour les statistiques
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(period));
    
    // Récupérer les posts du producteur
    const posts = await Post.find({
      producer_id: producerId,
      time_posted: { $gte: cutoffDate }
    }).sort({ time_posted: 1 }).lean();
    
    // Déterminer l'intervalle de regroupement (quotidien, hebdomadaire, mensuel)
    const intervalType = parseInt(period) <= 30 ? 'day' : (parseInt(period) <= 90 ? 'week' : 'month');
    
    // Préparer les données de tendance
    const trends = {
      engagement: generateTimeSeries(posts, intervalType, period),
      top_posts: getTopPosts(posts),
      peak_times: analyzePostingTimes(posts),
      weekly_distribution: analyzeWeekdayDistribution(posts),
    };
    
    res.status(200).json(trends);
  } catch (error) {
    console.error(`❌ Erreur lors de la récupération des tendances: ${error.message}`);
    res.status(500).json({ message: 'Erreur interne du serveur', error: error.message });
  }
});

/**
 * Récupère les recommandations stratégiques pour un producteur
 * 
 * @route GET /api/growth-analytics/:producerId/recommendations
 * @param {string} producerId - ID du producteur
 * @returns {Object} Recommandations stratégiques
 */
router.get('/:producerId/recommendations', async (req, res) => {
  const { producerId } = req.params;
  
  try {
    if (!mongoose.isValidObjectId(producerId)) {
      return res.status(400).json({ message: 'ID de producteur invalide' });
    }
    
    // Déterminer si c'est un restaurant ou un lieu de loisir
    let producer = await Restaurant.findById(producerId);
    let isLeisureProducer = false;
    
    if (!producer) {
      producer = await LeisureVenue.findById(producerId);
      isLeisureProducer = true;
      
      if (!producer) {
        return res.status(404).json({ message: 'Producteur non trouvé' });
      }
    }
    
    // Récupérer les posts des 90 derniers jours
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    
    const posts = await Post.find({
      producer_id: producerId,
      time_posted: { $gte: cutoffDate }
    }).lean();
    
    // Analyser les données et générer des recommandations
    const recommendations = generateRecommendations(producer, posts, isLeisureProducer);
    
    res.status(200).json(recommendations);
  } catch (error) {
    console.error(`❌ Erreur lors de la génération des recommandations: ${error.message}`);
    res.status(500).json({ message: 'Erreur interne du serveur', error: error.message });
  }
});

/**
 * Fonctions utilitaires
 */

// Grouper les utilisateurs par tranche d'âge
function getAgeGroup(age) {
  if (!age) return 'Inconnu';
  if (age < 18) return '<18';
  if (age < 25) return '18-24';
  if (age < 35) return '25-34';
  if (age < 45) return '35-44';
  if (age < 55) return '45-54';
  return '55+';
}

// Récupérer les concurrents proches
async function getCompetitors(producerId, producer, isLeisureProducer) {
  try {
    const Model = isLeisureProducer ? LeisureVenue : Restaurant;
    
    // Récupérer les coordonnées du producteur
    const coordinates = producer.gps_coordinates?.coordinates;
    
    if (!coordinates || coordinates.length !== 2) {
      return [];
    }
    
    // Trouver les concurrents à proximité dans la même catégorie
    const competitors = await Model.find({
      _id: { $ne: producerId },
      category: { $in: producer.category || [] },
      gps_coordinates: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: coordinates
          },
          $maxDistance: 5000 // 5km
        }
      }
    })
    .limit(5)
    .select('_id name photo rating followers abonnés')
    .lean();
    
    // Enrichir avec les données d'engagement
    const enrichedCompetitors = await Promise.all(
      competitors.map(async (competitor) => {
        // Compter les posts des 30 derniers jours
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 30);
        
        const postCount = await Post.countDocuments({
          producer_id: competitor._id,
          time_posted: { $gte: cutoffDate }
        });
        
        return {
          id: competitor._id,
          name: competitor.name,
          photo: competitor.photo || '',
          rating: competitor.rating || 0,
          followers: competitor.followers?.length || competitor.abonnés || 0,
          recent_posts: postCount
        };
      })
    );
    
    return enrichedCompetitors;
  } catch (error) {
    console.error(`❌ Erreur lors de la récupération des concurrents: ${error.message}`);
    return [];
  }
}

// Générer une série temporelle pour les données d'engagement
function generateTimeSeries(posts, intervalType, period) {
  // Déterminer les points de données en fonction de l'intervalle
  const dataPoints = {};
  const now = new Date();
  
  // Initialiser tous les points de la période avec des valeurs à zéro
  for (let i = 0; i < parseInt(period); i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    
    let key;
    if (intervalType === 'day') {
      key = date.toISOString().split('T')[0]; // YYYY-MM-DD
    } else if (intervalType === 'week') {
      // Obtenir le lundi de la semaine
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(date.setDate(diff));
      key = monday.toISOString().split('T')[0];
    } else { // month
      key = date.toISOString().split('-').slice(0, 2).join('-'); // YYYY-MM
    }
    
    if (!dataPoints[key]) {
      dataPoints[key] = {
        posts: 0,
        likes: 0,
        comments: 0,
        shares: 0
      };
    }
  }
  
  // Agréger les données des posts
  posts.forEach(post => {
    const postDate = new Date(post.time_posted);
    
    let key;
    if (intervalType === 'day') {
      key = postDate.toISOString().split('T')[0];
    } else if (intervalType === 'week') {
      const day = postDate.getDay();
      const diff = postDate.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(postDate.setDate(diff));
      key = monday.toISOString().split('T')[0];
    } else {
      key = postDate.toISOString().split('-').slice(0, 2).join('-');
    }
    
    if (dataPoints[key]) {
      dataPoints[key].posts += 1;
      dataPoints[key].likes += post.likes_count || 0;
      dataPoints[key].comments += post.comments?.length || 0;
      dataPoints[key].shares += post.shares_count || 0;
    }
  });
  
  // Convertir en tableau trié par date
  return Object.entries(dataPoints)
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Récupérer les meilleurs posts
function getTopPosts(posts) {
  if (!posts.length) return [];
  
  // Calculer le score d'engagement pour chaque post
  const scoredPosts = posts.map(post => {
    const likesScore = post.likes_count || 0;
    const commentsScore = (post.comments?.length || 0) * 2; // Les commentaires comptent double
    const sharesScore = (post.shares_count || 0) * 3; // Les partages comptent triple
    
    return {
      id: post._id,
      content: post.content?.substring(0, 100) + (post.content?.length > 100 ? '...' : '') || '',
      posted_at: post.time_posted,
      media: post.media?.length > 0 ? post.media[0].url : null,
      engagement: {
        likes: post.likes_count || 0,
        comments: post.comments?.length || 0,
        shares: post.shares_count || 0
      },
      score: likesScore + commentsScore + sharesScore
    };
  });
  
  // Retourner les 5 meilleurs posts
  return scoredPosts
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

// Analyser les heures de publication optimales
function analyzePostingTimes(posts) {
  if (!posts.length) return [];
  
  // Regrouper les posts par heure de la journée
  const hourlyData = {};
  
  for (let i = 0; i < 24; i++) {
    hourlyData[i] = { posts: 0, total_engagement: 0, average_engagement: 0 };
  }
  
  posts.forEach(post => {
    const postDate = new Date(post.time_posted);
    const hour = postDate.getHours();
    
    const engagement = (post.likes_count || 0) + 
                       (post.comments?.length || 0) * 2 + 
                       (post.shares_count || 0) * 3;
    
    hourlyData[hour].posts += 1;
    hourlyData[hour].total_engagement += engagement;
  });
  
  // Calculer l'engagement moyen par heure
  Object.keys(hourlyData).forEach(hour => {
    if (hourlyData[hour].posts > 0) {
      hourlyData[hour].average_engagement = hourlyData[hour].total_engagement / hourlyData[hour].posts;
    }
  });
  
  // Convertir en tableau et trier par engagement moyen
  return Object.entries(hourlyData)
    .map(([hour, data]) => ({
      hour: parseInt(hour),
      posts: data.posts,
      average_engagement: data.average_engagement
    }))
    .sort((a, b) => b.average_engagement - a.average_engagement);
}

// Analyser la distribution des posts par jour de la semaine
function analyzeWeekdayDistribution(posts) {
  if (!posts.length) return [];
  
  const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const dayData = {};
  
  days.forEach((day, index) => {
    dayData[index] = { day, posts: 0, total_engagement: 0, average_engagement: 0 };
  });
  
  posts.forEach(post => {
    const postDate = new Date(post.time_posted);
    const dayIndex = postDate.getDay();
    
    const engagement = (post.likes_count || 0) + 
                       (post.comments?.length || 0) * 2 + 
                       (post.shares_count || 0) * 3;
    
    dayData[dayIndex].posts += 1;
    dayData[dayIndex].total_engagement += engagement;
  });
  
  // Calculer l'engagement moyen par jour
  Object.values(dayData).forEach(data => {
    if (data.posts > 0) {
      data.average_engagement = data.total_engagement / data.posts;
    }
  });
  
  // Retourner sous forme de tableau
  return Object.values(dayData);
}

// Générer des recommandations stratégiques
function generateRecommendations(producer, posts, isLeisureProducer) {
  const recommendations = {
    content_strategy: [],
    engagement_tactics: [],
    growth_opportunities: []
  };
  
  // Analyser la fréquence de publication
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const recentPosts = posts.filter(post => new Date(post.time_posted) >= thirtyDaysAgo);
  const postsPerMonth = recentPosts.length;
  
  // Analyser les types de contenu
  const hasVideos = recentPosts.some(post => post.media?.some(m => m.type === 'video'));
  const hasImages = recentPosts.some(post => post.media?.some(m => m.type === 'image'));
  
  // Recommandations de stratégie de contenu
  if (postsPerMonth < 4) {
    recommendations.content_strategy.push({
      title: "Augmentez votre fréquence de publication",
      description: "Publiez au moins une fois par semaine pour maintenir l'engagement de votre audience.",
      action: "Planifiez 4 publications par mois minimum"
    });
  }
  
  if (!hasVideos) {
    recommendations.content_strategy.push({
      title: "Diversifiez vos formats de contenu",
      description: "Les vidéos génèrent en moyenne 38% plus d'engagement que les images.",
      action: "Ajoutez des vidéos courtes à votre stratégie de contenu"
    });
  }
  
  // Recommandations d'engagement spécifiques au type d'établissement
  if (isLeisureProducer) {
    recommendations.engagement_tactics.push({
      title: "Promotions pour événements à venir",
      description: "Les annonces d'événements avec une offre exclusive génèrent 52% plus de partages.",
      action: "Créez des offres spéciales pour vos événements à venir"
    });
  } else {
    recommendations.engagement_tactics.push({
      title: "Mettez en valeur vos plats signature",
      description: "Les publications présentant des plats signature reçoivent 67% plus de likes.",
      action: "Partagez des photos et histoires de vos plats les plus populaires"
    });
  }
  
  // Recommandations pour la croissance
  const followerCount = producer.followers?.length || 0;
  
  recommendations.growth_opportunities.push({
    title: "Interactions avec la communauté locale",
    description: "Engagez-vous avec les posts mentionnant votre quartier pour augmenter votre visibilité.",
    action: "Commentez et aimez 5 publications locales par semaine"
  });
  
  if (followerCount > 0) {
    recommendations.growth_opportunities.push({
      title: "Programme d'ambassadeurs",
      description: "Les clients fidèles peuvent vous aider à atteindre un nouveau public.",
      action: "Identifiez vos 10 followers les plus engagés et proposez-leur des avantages exclusifs"
    });
  }
  
  return recommendations;
}

module.exports = router; 