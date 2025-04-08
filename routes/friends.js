const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { choiceAppDb } = require('../index');

// Modèle pour la collection users et friends
const User = choiceAppDb.model(
  'User',
  new mongoose.Schema({}, { strict: false }),
  'Users'
);

/**
 * @route GET /api/friends/nearby
 * @desc Obtenir les amis à proximité
 * @access Private
 */
router.get('/nearby', async (req, res) => {
  try {
    const { userId, lat, lng, latitude, longitude, radius = 5000, onlyFollowing, onlyFollowers, keyword } = req.query;
    
    // Accepter lat/lng ou latitude/longitude pour compatibilité totale avec le frontend
    const userLat = parseFloat(latitude || lat);
    const userLng = parseFloat(longitude || lng);
    
    if (!userId || (!userLat && userLat !== 0) || (!userLng && userLng !== 0)) {
      return res.status(400).json({ message: 'userId et coordonnées (lat/lng ou latitude/longitude) requis.' });
    }
    
    // Récupérer l'utilisateur
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    }
    
    let query = {
      _id: { $ne: userId }, // Exclure l'utilisateur courant
      'location.coordinates': {
        $nearSphere: {
          $geometry: {
            type: 'Point',
            coordinates: [userLng, userLat]
          },
          $maxDistance: parseInt(radius)
        }
      }
    };
    
    // Ajouter un filtre textuel si fourni
    if (keyword && keyword.trim().length > 0) {
      query.$or = [
        { name: { $regex: keyword, $options: 'i' } },
        { username: { $regex: keyword, $options: 'i' } }
      ];
    }
    
    // Filtrer par amis/abonnés si demandé
    if (onlyFollowing === 'true' && user.following) {
      query._id = { $in: user.following, $ne: userId };
    }
    
    if (onlyFollowers === 'true' && user.followers) {
      query._id = { $in: user.followers, $ne: userId };
    }
    
    // Si les deux filtres sont activés, chercher l'intersection
    if (onlyFollowing === 'true' && onlyFollowers === 'true' && user.following && user.followers) {
      const mutualFriends = user.following.filter(id => 
        user.followers.some(f => f.toString() === id.toString())
      );
      query._id = { $in: mutualFriends, $ne: userId };
    }
    
    // Récupérer les utilisateurs à proximité
    const nearbyUsers = await User.find(query)
      .select('_id name username profilePicture photo_url location last_active interests following followers')
      .limit(50); // Limiter pour performance
    
    // Transformer pour le format attendu par le frontend
    const formattedUsers = nearbyUsers.map(u => ({
      id: u._id,
      name: u.name || u.username || 'Utilisateur',
      username: u.username,
      profileImage: u.profilePicture || u.photo_url,
      location: u.location,
      lastActive: u.last_active || new Date().toISOString(),
      interests: u.interests || [],
      isFollowing: user.following?.some(id => id.toString() === u._id.toString()) || false,
      isFollower: user.followers?.some(id => id.toString() === u._id.toString()) || false,
      // Calculer les intérêts communs
      commonInterests: (u.interests || []).filter(interest => 
        (user.interests || []).includes(interest)
      ).length
    }));
    
    res.status(200).json(formattedUsers);
  } catch (error) {
    console.error('❌ Erreur lors de la recherche des amis à proximité :', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route GET /api/friends/activities
 * @desc Obtenir les activités récentes des amis
 * @access Private
 */
router.get('/activities', async (req, res) => {
  try {
    const { userId, limit = 20, fromDate, activityType } = req.query;
    
    if (!userId) {
      return res.status(400).json({ message: 'userId requis.' });
    }
    
    // Récupérer l'utilisateur et ses relations
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    }
    
    // Récupérer les IDs des amis
    const friendIds = [
      ...(user.following || []),
      ...(user.followers || [])
    ].filter((id, index, self) => 
      // Supprimer les doublons
      self.indexOf(id) === index
    );
    
    // Récupérer les activités
    // Note: Cette partie dépend de la structure de votre modèle d'activité
    // Pour cet exemple, nous supposerons une collection d'activités
    const Activities = choiceAppDb.model(
      'Activity',
      new mongoose.Schema({}, { strict: false }),
      'activities'
    );
    
    let query = {
      userId: { $in: friendIds }
    };
    
    // Filtre par type d'activité
    if (activityType) {
      query.activityType = activityType;
    }
    
    if (fromDate) {
      query.timestamp = { $gte: new Date(fromDate) };
    }
    
    const activities = await Activities.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));
      
    // Enrichir avec les infos utilisateur
    const enrichedActivities = await Promise.all(
      activities.map(async (activity) => {
        const activityUser = await User.findById(activity.userId)
          .select('_id name username profilePicture photo_url');
          
        return {
          ...activity.toObject(),
          userName: activityUser?.name || activityUser?.username || 'Utilisateur',
          userProfileImage: activityUser?.profilePicture || activityUser?.photo_url,
        };
      })
    );
    
    res.status(200).json(enrichedActivities);
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des activités des amis :', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route POST /api/friends/follow
 * @desc Suivre un utilisateur
 * @access Private
 */
router.post('/follow', async (req, res) => {
  try {
    const { userId, friendId } = req.body;
    
    if (!userId || !friendId) {
      return res.status(400).json({ message: 'userId et friendId requis.' });
    }
    
    // Éviter de se suivre soi-même
    if (userId === friendId) {
      return res.status(400).json({ message: 'Vous ne pouvez pas vous suivre vous-même.' });
    }
    
    // Vérifier l'existence de l'utilisateur
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    }
    
    // Vérifier l'existence de l'ami
    const friend = await User.findById(friendId);
    if (!friend) {
      return res.status(404).json({ message: 'Ami non trouvé.' });
    }
    
    // Ajouter l'ami aux abonnements si pas déjà présent
    if (!user.following) {
      user.following = [];
    }
    
    // Vérifier si déjà suivi
    if (user.following.includes(friendId)) {
      return res.status(400).json({ message: 'Vous suivez déjà cet utilisateur.' });
    }
    
    user.following.push(friendId);
    await user.save();
    
    // Ajouter l'utilisateur aux abonnés de l'ami
    if (!friend.followers) {
      friend.followers = [];
    }
    
    friend.followers.push(userId);
    await friend.save();
    
    res.status(200).json({ message: 'Utilisateur suivi avec succès.' });
  } catch (error) {
    console.error('❌ Erreur lors du suivi de l\'utilisateur :', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route POST /api/friends/unfollow
 * @desc Ne plus suivre un utilisateur
 * @access Private
 */
router.post('/unfollow', async (req, res) => {
  try {
    const { userId, friendId } = req.body;
    
    if (!userId || !friendId) {
      return res.status(400).json({ message: 'userId et friendId requis.' });
    }
    
    // Vérifier l'existence de l'utilisateur
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    }
    
    // Vérifier l'existence de l'ami
    const friend = await User.findById(friendId);
    if (!friend) {
      return res.status(404).json({ message: 'Ami non trouvé.' });
    }
    
    // Retirer l'ami des abonnements
    if (user.following) {
      user.following = user.following.filter(id => id.toString() !== friendId);
      await user.save();
    }
    
    // Retirer l'utilisateur des abonnés de l'ami
    if (friend.followers) {
      friend.followers = friend.followers.filter(id => id.toString() !== userId);
      await friend.save();
    }
    
    res.status(200).json({ message: 'Utilisateur retiré des abonnements.' });
  } catch (error) {
    console.error('❌ Erreur lors du retrait d\'abonnement :', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route GET /api/friends/:userId
 * @desc Obtenir les amis d'un utilisateur
 * @access Private
 */
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { type = 'all' } = req.query;
    
    // Vérifier l'existence de l'utilisateur
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    }
    
    let friends = [];
    
    if (type === 'following' || type === 'all') {
      // Récupérer les utilisateurs suivis
      if (user.following && user.following.length > 0) {
        const following = await User.find({ _id: { $in: user.following } })
          .select('_id name username profilePicture photo_url location');
        
        friends = [...friends, ...following.map(f => ({
          ...f.toObject(),
          relationship: 'following'
        }))];
      }
    }
    
    if (type === 'followers' || type === 'all') {
      // Récupérer les abonnés
      if (user.followers && user.followers.length > 0) {
        const followers = await User.find({ _id: { $in: user.followers } })
          .select('_id name username profilePicture photo_url location');
        
        friends = [...friends, ...followers.map(f => ({
          ...f.toObject(),
          relationship: 'follower'
        }))];
      }
    }
    
    if (type === 'mutual' || type === 'all') {
      // Calculer les amis mutuels (intersection des suivis et abonnés)
      if (user.following && user.followers) {
        const mutualIds = user.following.filter(id => 
          user.followers.some(f => f.toString() === id.toString())
        );
        
        if (mutualIds.length > 0) {
          const mutualFriends = await User.find({ _id: { $in: mutualIds } })
            .select('_id name username profilePicture photo_url location');
          
          friends = [...friends, ...mutualFriends.map(f => ({
            ...f.toObject(),
            relationship: 'mutual'
          }))];
        }
      }
    }
    
    // Supprimer les doublons basés sur l'ID
    const uniqueFriends = Array.from(
      new Map(friends.map(item => [item._id.toString(), item])).values()
    );
    
    res.status(200).json(uniqueFriends);
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des amis :', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

module.exports = router; 