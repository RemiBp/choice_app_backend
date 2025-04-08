const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');

// MongoDB connections
const { choiceAppDb, restaurationDb, loisirDb, beautyWellnessDb } = require('../index');

/**
 * @route GET /api/growth-analytics/:producerId/overview
 * @desc Get overview of producer growth metrics
 * @access Private
 */
router.get('/:producerId/overview', auth, async (req, res) => {
  try {
    const { producerId } = req.params;
    const { period = '30' } = req.query; // Default to 30 days
    
    // Determine producer type based on ID or collection existence
    const producerType = await getProducerType(producerId);
    
    if (!producerType) {
      return res.status(404).json({ message: 'Producer not found' });
    }
    
    // Get basic producer info
    const producer = await getProducerInfo(producerId, producerType);
    
    if (!producer) {
      return res.status(404).json({ message: 'Producer not found' });
    }
    
    // Get engagement metrics
    const engagement = await getEngagementMetrics(producerId, parseInt(period));
    
    // Get follower metrics
    const followers = await getFollowerMetrics(producerId, parseInt(period));
    
    // Get reach metrics
    const reach = await getReachMetrics(producerId, parseInt(period));
    
    // Get demographic data
    const demographics = await getDemographics(producerId);
    
    // Get competitor data
    const competitors = await getCompetitors(producerId, producerType);
    
    // Combine all data
    const response = {
      producer,
      period: parseInt(period),
      engagement,
      followers,
      reach,
      demographics,
      competitors
    };
    
    res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching growth overview:', error);
    res.status(500).json({ message: 'Error fetching growth overview', error: error.message });
  }
});

/**
 * @route GET /api/growth-analytics/:producerId/trends
 * @desc Get trend data for a producer
 * @access Private
 */
router.get('/:producerId/trends', auth, async (req, res) => {
  try {
    const { producerId } = req.params;
    const { period = '90' } = req.query; // Default to 90 days
    
    // Check if producer exists
    const producerType = await getProducerType(producerId);
    
    if (!producerType) {
      return res.status(404).json({ message: 'Producer not found' });
    }
    
    // Get engagement time series
    const engagement = await getEngagementTimeSeries(producerId, parseInt(period));
    
    // Get top posts
    const topPosts = await getTopPosts(producerId, parseInt(period));
    
    // Combine data
    const response = {
      engagement,
      top_posts: topPosts
    };
    
    res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching growth trends:', error);
    res.status(500).json({ message: 'Error fetching growth trends', error: error.message });
  }
});

/**
 * @route GET /api/growth-analytics/:producerId/recommendations
 * @desc Get growth recommendations for a producer
 * @access Private
 */
router.get('/:producerId/recommendations', auth, async (req, res) => {
  try {
    const { producerId } = req.params;
    
    // Check if producer exists
    const producerType = await getProducerType(producerId);
    
    if (!producerType) {
      return res.status(404).json({ message: 'Producer not found' });
    }
    
    // Generate recommendations based on producer metrics
    const recommendations = await generateRecommendations(producerId, producerType);
    
    res.status(200).json(recommendations);
  } catch (error) {
    console.error('Error generating recommendations:', error);
    res.status(500).json({ message: 'Error generating recommendations', error: error.message });
  }
});

// Helper functions

/**
 * Determine the producer type based on the producer ID
 */
async function getProducerType(producerId) {
  // Try to find the producer in each collection
  const collections = [
    { db: restaurationDb, name: 'restaurant', collection: 'restaurants' },
    { db: loisirDb, name: 'leisure', collection: 'leisure_producers' },
    { db: beautyWellnessDb, name: 'wellness', collection: 'wellness_producers' }
  ];
  
  for (const { db, name, collection } of collections) {
    try {
      const model = db.model(collection, new mongoose.Schema({}, { strict: false }), collection);
      const producer = await model.findOne({ _id: producerId });
      
      if (producer) {
        return name;
      }
    } catch (error) {
      console.log(`Error checking ${collection}:`, error.message);
    }
  }
  
  return null;
}

/**
 * Get basic producer information
 */
async function getProducerInfo(producerId, producerType) {
  let db, collection;
  
  switch (producerType) {
    case 'restaurant':
      db = restaurationDb;
      collection = 'restaurants';
      break;
    case 'leisure':
      db = loisirDb;
      collection = 'leisure_producers';
      break;
    case 'wellness':
      db = beautyWellnessDb;
      collection = 'wellness_producers';
      break;
    default:
      return null;
  }
  
  try {
    const model = db.model(collection, new mongoose.Schema({}, { strict: false }), collection);
    const producer = await model.findOne({ _id: producerId });
    
    if (!producer) return null;
    
    return {
      id: producerId,
      name: producer.name || producer.nom || 'Unknown',
      type: producerType,
      category: producer.category || producer.categories || producer.catégorie || [],
      photo: producer.photo || producer.image || producer.profilePicture || null
    };
  } catch (error) {
    console.error(`Error getting producer info for ${producerId}:`, error);
    return null;
  }
}

/**
 * Get engagement metrics for a producer
 */
async function getEngagementMetrics(producerId, period) {
  // This would typically query interaction data from the database
  // For now, we'll generate mock data
  
  // Get date from period days ago
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);
  
  try {
    // Get posts count
    const Post = choiceAppDb.model('Post');
    const postsCount = await Post.countDocuments({
      producerId,
      createdAt: { $gte: startDate }
    });
    
    // Get likes, comments, shares
    const Interaction = choiceAppDb.model('Interaction');
    const likeCount = await Interaction.countDocuments({
      targetId: producerId,
      type: 'like',
      createdAt: { $gte: startDate }
    });
    
    const commentCount = await Interaction.countDocuments({
      targetId: producerId,
      type: 'comment',
      createdAt: { $gte: startDate }
    });
    
    const shareCount = await Interaction.countDocuments({
      targetId: producerId,
      type: 'share',
      createdAt: { $gte: startDate }
    });
    
    // Calculate average engagement per post
    const averagePerPost = postsCount > 0 
      ? ((likeCount + commentCount + shareCount) / postsCount).toFixed(1)
      : 0;
    
    return {
      posts: postsCount,
      likes: likeCount,
      comments: commentCount,
      shares: shareCount,
      average_per_post: parseFloat(averagePerPost)
    };
  } catch (error) {
    console.error(`Error getting engagement metrics for ${producerId}:`, error);
    
    // Return mock data in case of error
    return {
      posts: Math.floor(Math.random() * 20) + 5,
      likes: Math.floor(Math.random() * 300) + 50,
      comments: Math.floor(Math.random() * 80) + 10,
      shares: Math.floor(Math.random() * 30) + 5,
      average_per_post: parseFloat((Math.random() * 20 + 5).toFixed(1))
    };
  }
}

/**
 * Get follower metrics for a producer
 */
async function getFollowerMetrics(producerId, period) {
  // This would typically query follower data from the database
  // For now, we'll generate mock data
  
  // Get date from period days ago
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);
  
  try {
    // Get total followers
    const Follow = choiceAppDb.model('Follow');
    const totalFollowers = await Follow.countDocuments({
      followedId: producerId
    });
    
    const newFollowers = await Follow.countDocuments({
      followedId: producerId,
      createdAt: { $gte: startDate }
    });
    
    // Calculate growth rate
    const growthRate = totalFollowers > 0 
      ? (newFollowers / totalFollowers * 100).toFixed(1)
      : 0;
    
    return {
      total: totalFollowers,
      new: newFollowers,
      growth_rate: parseFloat(growthRate)
    };
  } catch (error) {
    console.error(`Error getting follower metrics for ${producerId}:`, error);
    
    // Return mock data in case of error
    const total = Math.floor(Math.random() * 150) + 50;
    const newFollowers = Math.floor(Math.random() * 20) + 5;
    const growthRate = (newFollowers / total * 100).toFixed(1);
    
    return {
      total,
      new: newFollowers,
      growth_rate: parseFloat(growthRate)
    };
  }
}

/**
 * Get reach metrics for a producer
 */
async function getReachMetrics(producerId, period) {
  // This would typically query reach data from the database
  // For now, we'll generate mock data
  
  // Get date from period days ago
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);
  
  try {
    // Mock querying data - this should be replaced with actual DB queries
    const mentions = Math.floor(Math.random() * 15) + 3;
    const interestedUsers = Math.floor(Math.random() * 80) + 20;
    const choiceUsers = Math.floor(Math.random() * 50) + 10;
    const conversionRate = (choiceUsers / interestedUsers * 100).toFixed(1);
    
    return {
      mentions,
      interested_users: interestedUsers,
      choice_users: choiceUsers,
      conversion_rate: parseFloat(conversionRate)
    };
  } catch (error) {
    console.error(`Error getting reach metrics for ${producerId}:`, error);
    
    // Return mock data in case of error
    return {
      mentions: Math.floor(Math.random() * 15) + 3,
      interested_users: Math.floor(Math.random() * 80) + 20,
      choice_users: Math.floor(Math.random() * 50) + 10,
      conversion_rate: parseFloat((Math.random() * 30 + 10).toFixed(1))
    };
  }
}

/**
 * Get demographic data for producer's audience
 */
async function getDemographics(producerId) {
  // This would typically query demographic data from the database
  // For now, we'll generate mock data
  
  return {
    age: {
      '18-24': parseFloat((Math.random() * 20).toFixed(1)),
      '25-34': parseFloat((Math.random() * 30 + 20).toFixed(1)),
      '35-44': parseFloat((Math.random() * 20 + 15).toFixed(1)),
      '45-54': parseFloat((Math.random() * 15 + 5).toFixed(1)),
      '55+': parseFloat((Math.random() * 10).toFixed(1))
    },
    gender: {
      'Homme': parseFloat((Math.random() * 15 + 40).toFixed(1)),
      'Femme': parseFloat((Math.random() * 15 + 40).toFixed(1))
    },
    location: {
      'Paris': parseFloat((Math.random() * 20 + 30).toFixed(1)),
      'Boulogne-Billancourt': parseFloat((Math.random() * 10 + 5).toFixed(1)),
      'Neuilly-sur-Seine': parseFloat((Math.random() * 10 + 5).toFixed(1)),
      'Versailles': parseFloat((Math.random() * 10).toFixed(1)),
      'Saint-Denis': parseFloat((Math.random() * 5).toFixed(1))
    }
  };
}

/**
 * Get competitor data for a producer
 */
async function getCompetitors(producerId, producerType) {
  // This would typically find similar producers in the same category
  // For now, we'll generate mock data
  
  // Generate 2-3 competitor entries
  const competitorCount = Math.floor(Math.random() * 2) + 2;
  const competitors = [];
  
  for (let i = 0; i < competitorCount; i++) {
    competitors.push({
      id: `comp_${i + 1}`,
      name: producerType === 'restaurant' 
        ? ['Bistro Parisien', 'La Bonne Table', 'Le Gourmet'][i % 3]
        : producerType === 'leisure'
          ? ['Théâtre du Châtelet', 'Musée du Louvre', 'Galerie d\'Art Moderne'][i % 3]
          : ['Spa Zen', 'Yoga Center', 'Massage Therapy'][i % 3],
      photo: `https://picsum.photos/id/${420 + i}/200/200`,
      rating: parseFloat((Math.random() * 1 + 4).toFixed(1)),
      followers: Math.floor(Math.random() * 200) + 100,
      recent_posts: Math.floor(Math.random() * 20) + 5
    });
  }
  
  return competitors;
}

/**
 * Get time series data for engagement metrics
 */
async function getEngagementTimeSeries(producerId, period) {
  // This would typically query time series data from the database
  // For now, we'll generate mock data
  
  const now = new Date();
  const intervalType = period <= 30 ? 'day' : (period <= 90 ? 'week' : 'month');
  const timeSeries = [];
  
  // Generate data points
  for (let i = period; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    
    let dateStr;
    if (intervalType === 'day') {
      dateStr = date.toISOString().split('T')[0];
    } else if (intervalType === 'week') {
      // Calculate Monday of the week
      const dayOfWeek = date.getDay();
      const diff = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const monday = new Date(date.setDate(diff));
      dateStr = monday.toISOString().split('T')[0];
    } else {
      // Month format
      dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padLeft(2, '0')}`;
    }
    
    // Only add if date doesn't exist yet
    if (!timeSeries.some(item => item.date === dateStr)) {
      timeSeries.push({
        date: dateStr,
        posts: (i % 7 === 0) ? 2 : (i % 3 === 0 ? 1 : 0),
        likes: 10 + (i % 5) * 8,
        comments: 3 + (i % 4) * 2,
        shares: 1 + (i % 6)
      });
    }
  }
  
  return timeSeries;
}

/**
 * Get top performing posts for a producer
 */
async function getTopPosts(producerId, period) {
  // This would typically query post data from the database
  // For now, we'll generate mock data
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);
  
  const topPosts = [];
  
  // Generate 2-3 top posts
  const postCount = Math.floor(Math.random() * 2) + 2;
  
  for (let i = 0; i < postCount; i++) {
    const daysAgo = Math.floor(Math.random() * period);
    const postDate = new Date();
    postDate.setDate(postDate.getDate() - daysAgo);
    
    topPosts.push({
      id: `post_${i + 1}`,
      content: i === 0 
        ? "Nouvelle spécialité du chef à découvrir ce weekend !"
        : i === 1
          ? "Merci à tous nos clients pour cette soirée exceptionnelle !"
          : "Promotion spéciale pour nos abonnés fidèles !",
      posted_at: postDate.toISOString(),
      media: `https://picsum.photos/id/${480 + i}/600/400`,
      engagement: {
        likes: Math.floor(Math.random() * 30) + 30,
        comments: Math.floor(Math.random() * 10) + 5,
        shares: Math.floor(Math.random() * 10)
      },
      score: Math.floor(Math.random() * 20) + 80
    });
  }
  
  // Sort by score descending
  topPosts.sort((a, b) => b.score - a.score);
  
  return topPosts;
}

/**
 * Generate growth recommendations for a producer
 */
async function generateRecommendations(producerId, producerType) {
  // This would typically analyze producer data and generate personalized recommendations
  // For now, we'll return mock recommendations
  
  const recommendationCategories = [
    {
      title: "Contenu",
      icon: "image",
      recommendations: [
        {
          title: "Augmentez votre fréquence de publications",
          description: "Nous constatons que vous publiez environ 1 fois par semaine. Essayez d'augmenter à 3-4 publications hebdomadaires pour améliorer votre visibilité.",
          priority: "high",
          impact: 8,
          effort: 6
        },
        {
          title: "Utilisez plus de photos de qualité",
          description: "Les publications avec des images professionnelles obtiennent 2.3x plus d'engagement sur Choice App.",
          priority: "medium",
          impact: 7,
          effort: 5
        }
      ]
    },
    {
      title: "Engagement",
      icon: "chat",
      recommendations: [
        {
          title: "Répondez plus rapidement aux commentaires",
          description: "Votre temps de réponse moyen est de 2 jours. Essayez de réduire à moins de 3 heures pour augmenter la satisfaction client.",
          priority: "high",
          impact: 9,
          effort: 7
        }
      ]
    },
    {
      title: "Visibilité",
      icon: "visibility",
      recommendations: [
        {
          title: "Complétez votre profil à 100%",
          description: "Il manque des informations importantes comme vos horaires du weekend et votre site web.",
          priority: "medium",
          impact: 6,
          effort: 3
        },
        {
          title: "Ajoutez des tags pertinents",
          description: "Utilisez des tags plus spécifiques liés à votre spécialité pour attirer un public ciblé.",
          priority: "low",
          impact: 5,
          effort: 2
        }
      ]
    }
  ];
  
  // Add different recommendations based on producer type
  if (producerType === 'restaurant') {
    recommendationCategories[0].recommendations.push({
      title: "Mettez votre menu à jour régulièrement",
      description: "Les restaurants qui mettent à jour leur menu au moins une fois par mois obtiennent 40% plus de vues.",
      priority: "medium",
      impact: 8,
      effort: 4
    });
  } else if (producerType === 'leisure') {
    recommendationCategories[0].recommendations.push({
      title: "Publiez vos événements à l'avance",
      description: "Les événements publiés au moins 2 semaines à l'avance ont 75% plus de participants.",
      priority: "high",
      impact: 9,
      effort: 3
    });
  } else if (producerType === 'wellness') {
    recommendationCategories[0].recommendations.push({
      title: "Partagez des témoignages clients",
      description: "Les établissements de bien-être qui partagent des témoignages reçoivent 3x plus de réservations.",
      priority: "medium",
      impact: 7,
      effort: 5
    });
  }
  
  return {
    categories: recommendationCategories,
    last_updated: new Date().toISOString()
  };
}

module.exports = router; 