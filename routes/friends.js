const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { createModel, databases } = require('../utils/modelCreator');

// Créer les modèles directement
const User = createModel(databases.CHOICE_APP, 'User', 'Users');
const Activity = createModel(databases.CHOICE_APP, 'Activity', 'activities');
const Post = createModel(databases.CHOICE_APP, 'Post', 'Posts');

// Fonction d'initialisation du router avec les connexions DB
const initialize = (db) => {
  // Définition des routes après initialisation

  /**
   * @route GET /api/friends/map-activities/:userId
   * @desc Obtenir les choix et intérêts des followers pour la carte
   * @access Public (Was Private)
   */
  router.get('/map-activities/:userId', async (req, res) => {
    try {
      // Utiliser l'ID de l'utilisateur authentifié ou celui fourni dans l'URL
      const userId = req.user?.id || req.params.userId;
      console.log(`📍 Route /map-activities/:userId appelée avec userId: ${userId}`);
      
      if (!userId) {
        return res.status(400).json({ message: 'userId requis.' });
      }
      
      // Récupérer l'utilisateur et ses amis
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé.' });
      }
      
      // Récupérer les amis (followers et following)
      const followingIds = user.following || [];
      const followerIds = user.followers || [];
      
      // Récupérer tous les amis (union des deux listes)
      const friendIds = [...new Set([...followingIds.map(id => id.toString()), 
                                    ...followerIds.map(id => id.toString())])];
      
      console.log(`📊 Amis trouvés: ${friendIds.length} (${followingIds.length} following, ${followerIds.length} followers)`);
      
      // Récupérer les détails des amis
      const friends = await User.find({ _id: { $in: friendIds } })
        .select('_id name username photo_url location');
      
      // Formatter les amis pour le frontend
      const formattedFriends = friends.map(friend => ({
        id: friend._id.toString(),
        name: friend.name || friend.username || 'Utilisateur',
        photo_url: friend.photo_url || '',
        location: friend.location || null
      }));
      
      // Rechercher les choices (les lieux visités par les amis)
      const userChoices = await User.find({ 
        _id: { $in: friendIds },
        choices: { $exists: true, $ne: [] }
      }).select('_id name choices');
      
      // Rechercher les interests (lieux qui intéressent les amis)
      const userInterests = await User.find({ 
        _id: { $in: friendIds },
        interests: { $exists: true, $ne: [] }
      }).select('_id name interests');
      
      console.log(`📊 Utilisateurs avec choices: ${userChoices.length}`);
      console.log(`📊 Utilisateurs avec interests: ${userInterests.length}`);
      
      // Collecter les IDs de choices et interests pour récupérer les détails des lieux
      const choiceIds = [];
      userChoices.forEach(user => {
        if (Array.isArray(user.choices)) {
          choiceIds.push(...user.choices);
        }
      });
      
      const interestIds = [];
      userInterests.forEach(user => {
        if (Array.isArray(user.interests)) {
          // Certains interests peuvent être des objets avec targetId
          user.interests.forEach(interest => {
            if (typeof interest === 'string') {
              interestIds.push(interest);
            } else if (interest && interest.targetId) {
              interestIds.push(interest.targetId);
            }
          });
        }
      });
      
      console.log(`📊 IDs de choices: ${choiceIds.length}`);
      console.log(`📊 IDs d'interests: ${interestIds.length}`);
      
      // Récupérer les informations sur les restaurants (base Restauration)
      let restaurantChoices = [];
      let restaurantInterests = [];
      
      try {
        const RestaurantProducer = createModel(
          databases.RESTAURATION, 
          'Producer', 
          'Producers'
        );
        
        if (choiceIds.length > 0) {
          restaurantChoices = await RestaurantProducer.find({
            _id: { $in: choiceIds }
          }).select('_id name location address rating photo_url category');
          
          console.log(`📊 Restaurants choices trouvés: ${restaurantChoices.length}`);
        }
        
        if (interestIds.length > 0) {
          restaurantInterests = await RestaurantProducer.find({
            _id: { $in: interestIds }
          }).select('_id name location address rating photo_url category');
          
          console.log(`📊 Restaurants interests trouvés: ${restaurantInterests.length}`);
        }
      } catch (error) {
        console.error('❌ Erreur lors de la récupération des restaurants:', error);
      }
      
      // Récupérer les informations sur les lieux de loisir (base Loisir&Culture)
      let leisureChoices = [];
      let leisureInterests = [];
      
      try {
        const LeisureProducer = createModel(
          databases.LOISIR, 
          'Producer', 
          'producers'
        );
        
        if (choiceIds.length > 0) {
          leisureChoices = await LeisureProducer.find({
            _id: { $in: choiceIds }
          }).select('_id name location address rating photo_url category');
          
          console.log(`📊 Lieux de loisir choices trouvés: ${leisureChoices.length}`);
        }
        
        if (interestIds.length > 0) {
          leisureInterests = await LeisureProducer.find({
            _id: { $in: interestIds }
          }).select('_id name location address rating photo_url category');
          
          console.log(`📊 Lieux de loisir interests trouvés: ${leisureInterests.length}`);
        }
      } catch (error) {
        console.error('❌ Erreur lors de la récupération des lieux de loisir:', error);
      }
      
      // Récupérer les informations sur les lieux de bien-être (base Beauty_Wellness)
      let wellnessChoices = [];
      let wellnessInterests = [];
      
      try {
        const WellnessProducer = createModel(
          databases.BEAUTY_WELLNESS, 
          'WellnessPlace', 
          'WellnessPlace'
        );
        
        if (choiceIds.length > 0) {
          wellnessChoices = await WellnessProducer.find({
            _id: { $in: choiceIds }
          }).select('_id name location address rating photo_url category');
          
          console.log(`📊 Lieux de bien-être choices trouvés: ${wellnessChoices.length}`);
        }
        
        if (interestIds.length > 0) {
          wellnessInterests = await WellnessProducer.find({
            _id: { $in: interestIds }
          }).select('_id name location address rating photo_url category');
          
          console.log(`📊 Lieux de bien-être interests trouvés: ${wellnessInterests.length}`);
        }
      } catch (error) {
        console.error('❌ Erreur lors de la récupération des lieux de bien-être:', error);
      }
      
      // Si pas assez de résultats, récupérer des posts pour avoir plus de données
      let postsChoices = [];
      let postsInterests = [];
      
      if (restaurantChoices.length + leisureChoices.length + wellnessChoices.length < 5 ||
          restaurantInterests.length + leisureInterests.length + wellnessInterests.length < 5) {
        try {
          const posts = await Post.find({ 
            $or: [
              { authorId: { $in: friendIds } },
              { 'producer_id': { $in: friendIds } }
            ]
          }).limit(30);
          
          console.log(`📊 Posts trouvés pour substitution: ${posts.length}`);
          
          // Distribuer les posts entre choices et interests
          posts.forEach((post, index) => {
            if (index % 2 === 0) {
              postsChoices.push(post);
            } else {
              postsInterests.push(post);
            }
          });
        } catch (error) {
          console.error('❌ Erreur lors de la récupération des posts:', error);
        }
      }
      
      // Formater les choices pour le frontend
      const formattedChoices = [
        ...restaurantChoices.map(place => formatPlace(place, 'restaurant', true, false)),
        ...leisureChoices.map(place => formatPlace(place, 'leisure', true, false)),
        ...wellnessChoices.map(place => formatPlace(place, 'wellness', true, false)),
        ...postsChoices.map(post => formatPost(post, true, false, friendIds))
      ];
      
      // Formater les interests pour le frontend
      const formattedInterests = [
        ...restaurantInterests.map(place => formatPlace(place, 'restaurant', false, true)),
        ...leisureInterests.map(place => formatPlace(place, 'leisure', false, true)),
        ...wellnessInterests.map(place => formatPlace(place, 'wellness', false, true)),
        ...postsInterests.map(post => formatPost(post, false, true, friendIds))
      ];
      
      // Si pas assez de résultats, générer des données aléatoires pour la démo
      if (formattedChoices.length < 5) {
        const additionalChoices = generateRandomPlaces(
          5 - formattedChoices.length, 
          true, 
          false, 
          friendIds
        );
        formattedChoices.push(...additionalChoices);
      }
      
      if (formattedInterests.length < 5) {
        const additionalInterests = generateRandomPlaces(
          5 - formattedInterests.length, 
          false, 
          true, 
          friendIds
        );
        formattedInterests.push(...additionalInterests);
      }
      
      console.log(`📊 Réponse finale: ${formattedFriends.length} amis, ${formattedChoices.length} choix, ${formattedInterests.length} intérêts`);
      
      // Créer une réponse complète pour la carte
      const response = {
        followers: formattedFriends,
        choices: formattedChoices,
        interests: formattedInterests
      };
      
      res.status(200).json(response);
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des activités pour la carte:', error);
      res.status(500).json({ message: 'Erreur interne du serveur.', error: error.message });
    }
  });

  /**
   * @route GET /api/friends/nearby
   * @desc Obtenir les amis à proximité
   * @access Private
   */
  router.get('/nearby', async (req, res) => {
    try {
      if (!mongoose.connection.readyState) {
        return res.status(500).json({ message: 'La connexion à la base de données n\'est pas établie' });
      }
      
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
        'location': {
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
      if (!mongoose.connection.readyState) {
        return res.status(500).json({ message: 'La connexion à la base de données n\'est pas établie' });
      }
      
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
      
      // Récupérer les activités avec le modèle créé directement
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
      
      const activities = await Activity.find(query)
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
   * @access Public (Was Private)
   */
  router.post('/follow', async (req, res) => {
    try {
      if (!mongoose.connection.readyState) {
        return res.status(500).json({ message: 'La connexion à la base de données n\'est pas établie' });
      }
      
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
   * @access Public (Was Private)
   */
  router.post('/unfollow', async (req, res) => {
    try {
      if (!mongoose.connection.readyState) {
        return res.status(500).json({ message: 'La connexion à la base de données n\'est pas établie' });
      }
      
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
   * @access Public (Was Private)
   */
  router.get('/:userId', async (req, res) => {
    try {
      if (!mongoose.connection.readyState) {
        return res.status(500).json({ message: 'La connexion à la base de données n\'est pas établie' });
      }
      
      // Utiliser l'ID de l'utilisateur authentifié ou celui fourni dans l'URL
      const userId = req.user?.id || req.params.userId;
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

  /**
   * @route GET /api/friends/following-interests
   * @desc Obtenir les choix et intérêts des utilisateurs suivis avec leur localisation
   * @access Public (Was Private)
   */
  router.get('/following-interests', async (req, res) => {
    try {
      // Utiliser l'ID de l'utilisateur authentifié ou celui fourni dans les paramètres
      const userId = req.user?.id || req.query.userId;
      const { radius = 50000, lat, lng } = req.query;
      
      if (!userId) {
        return res.status(400).json({ message: 'userId requis.' });
      }
      
      console.log(`📍 Recherche des intérêts/choix pour l'utilisateur ${userId}`);
      
      // Récupérer l'utilisateur pour obtenir ses followings
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé.' });
      }
      
      // Récupérer la liste des utilisateurs suivis
      const followingIds = user.following || [];
      
      if (followingIds.length === 0) {
        console.log('⚠️ Aucun utilisateur suivi trouvé.');
        return res.status(200).json({ 
          choices: [], 
          interests: [],
          message: 'Aucun utilisateur suivi.'
        });
      }
      
      console.log(`📊 Nombre d'utilisateurs suivis: ${followingIds.length}`);
      
      // Récupérer les utilisateurs suivis avec leurs choices et interests
      const followedUsers = await User.find({ _id: { $in: followingIds } })
        .select('_id name username profilePicture photo_url choices interests');
      
      console.log(`📊 Utilisateurs suivis récupérés: ${followedUsers.length}`);
      
      // Collecter tous les IDs de choices et interests
      let allChoiceIds = [];
      let allInterestIds = [];
      
      followedUsers.forEach(followedUser => {
        if (followedUser.choices && Array.isArray(followedUser.choices)) {
          allChoiceIds = [...allChoiceIds, ...followedUser.choices];
        }
        
        if (followedUser.interests && Array.isArray(followedUser.interests)) {
          // Filtrer pour ne garder que les ID ou les objets avec un ID
          const interestIds = followedUser.interests
            .filter(interest => 
              typeof interest === 'string' || 
              (typeof interest === 'object' && interest._id)
            )
            .map(interest => 
              typeof interest === 'string' ? interest : interest._id.toString()
            );
          
          allInterestIds = [...allInterestIds, ...interestIds];
        }
      });
      
      // Dédupliquer les IDs
      allChoiceIds = [...new Set(allChoiceIds)];
      allInterestIds = [...new Set(allInterestIds)];
      
      console.log(`📊 Total choices à rechercher: ${allChoiceIds.length}`);
      console.log(`📊 Total interests à rechercher: ${allInterestIds.length}`);
      
      // Créer une fonction pour récupérer les données d'une collection spécifique
      const getItemsFromCollection = async (collection, ids, isChoice, isInterest) => {
        if (!ids || ids.length === 0) return [];
        
        let query = { _id: { $in: ids } };
        
        // Ajouter un filtre de géolocalisation si les coordonnées sont fournies
        if (lat && lng && radius) {
          query.location = {
            $nearSphere: {
              $geometry: {
                type: 'Point',
                coordinates: [parseFloat(lng), parseFloat(lat)]
              },
              $maxDistance: parseInt(radius)
            }
          };
        }
        
        try {
          const items = await collection.find(query)
            .select('_id name location address coordinates rating photo_url category')
            .limit(100);
          
          return items.map(item => formatPlace(item, item.category || 'unknown', isChoice, isInterest));
        } catch (error) {
          console.error(`❌ Erreur lors de la récupération des données:`, error);
          return [];
        }
      };
      
      // 1. Restaurants
      let choiceRestaurants = [];
      let interestRestaurants = [];
      
      try {
        const RestaurantProducer = createModel(
          databases.RESTAURATION, 
          'Producer', 
          'Producers'
        );
        
        choiceRestaurants = await getItemsFromCollection(
          RestaurantProducer, 
          allChoiceIds, 
          true, 
          false
        );
        
        interestRestaurants = await getItemsFromCollection(
          RestaurantProducer, 
          allInterestIds, 
          false, 
          true
        );
        
        console.log(`📊 Restaurants choices trouvés: ${choiceRestaurants.length}`);
        console.log(`📊 Restaurants interests trouvés: ${interestRestaurants.length}`);
      } catch (error) {
        console.error('❌ Erreur lors de la récupération des restaurants:', error);
      }
      
      // 2. Loisirs
      let choiceLeisure = [];
      let interestLeisure = [];
      
      try {
        const LeisureProducer = createModel(
          databases.LOISIR, 
          'Producer', 
          'producers'
        );
        
        choiceLeisure = await getItemsFromCollection(
          LeisureProducer, 
          allChoiceIds, 
          true, 
          false
        );
        
        interestLeisure = await getItemsFromCollection(
          LeisureProducer, 
          allInterestIds, 
          false, 
          true
        );
        
        console.log(`📊 Lieux de loisirs choices trouvés: ${choiceLeisure.length}`);
        console.log(`📊 Lieux de loisirs interests trouvés: ${interestLeisure.length}`);
      } catch (error) {
        console.error('❌ Erreur lors de la récupération des lieux de loisirs:', error);
      }
      
      // 3. Bien-être
      let choiceWellness = [];
      let interestWellness = [];
      
      try {
        const WellnessProducer = createModel(
          databases.BEAUTY_WELLNESS, 
          'WellnessPlace', 
          'WellnessPlace'
        );
        
        choiceWellness = await getItemsFromCollection(
          WellnessProducer, 
          allChoiceIds, 
          true, 
          false
        );
        
        interestWellness = await getItemsFromCollection(
          WellnessProducer, 
          allInterestIds, 
          false, 
          true
        );
        
        console.log(`📊 Lieux de bien-être choices trouvés: ${choiceWellness.length}`);
        console.log(`📊 Lieux de bien-être interests trouvés: ${interestWellness.length}`);
      } catch (error) {
        console.error('❌ Erreur lors de la récupération des lieux de bien-être:', error);
      }
      
      // Combiner tous les résultats
      const allChoices = [
        ...choiceRestaurants,
        ...choiceLeisure,
        ...choiceWellness
      ];
      
      const allInterests = [
        ...interestRestaurants,
        ...interestLeisure,
        ...interestWellness
      ];
      
      // Si les résultats sont insuffisants, ajouter des posts
      if (allChoices.length < 10 || allInterests.length < 10) {
        try {
          const posts = await Post.find({
            authorId: { $in: followingIds }
          })
          .limit(30);
          
          console.log(`📊 Posts récupérés: ${posts.length}`);
          
          // Distribuer les posts entre choices et interests
          posts.forEach((post, index) => {
            const formattedPost = formatPost(post, 
                                           index % 2 === 0, 
                                           index % 2 !== 0, 
                                           followingIds);
            
            if (index % 2 === 0) {
              allChoices.push(formattedPost);
            } else {
              allInterests.push(formattedPost);
            }
          });
        } catch (error) {
          console.error('❌ Erreur lors de la récupération des posts:', error);
        }
      }
      
      console.log(`�� Réponse finale: ${allChoices.length} choix, ${allInterests.length} intérêts`);
      
      res.status(200).json({
        choices: allChoices,
        interests: allInterests
      });
      
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des intérêts et choix des amis:', error);
      res.status(500).json({ 
        message: 'Erreur interne du serveur.', 
        error: error.message 
      });
    }
  });

  /**
   * @route GET /api/friends/public/following-map
   * @desc Version publique de la route pour obtenir les choix et intérêts (pour le développement)
   * @access Public
   */
  router.get('/public/following-map', async (req, res) => {
    try {
      const { userId, radius = 50000, lat, lng } = req.query;
      
      if (!userId) {
        return res.status(400).json({ message: 'userId requis.' });
      }
      
      console.log(`📍 [PUBLIC] Recherche des intérêts/choix pour l'utilisateur ${userId}`);
      
      // Récupérer l'utilisateur pour obtenir ses followings
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé.' });
      }
      
      // Récupérer la liste des utilisateurs suivis
      const followingIds = user.following || [];
      
      if (followingIds.length === 0) {
        console.log('⚠️ Aucun utilisateur suivi trouvé.');
        return res.status(200).json({ 
          choices: [], 
          interests: [],
          message: 'Aucun utilisateur suivi.'
        });
      }
      
      console.log(`📊 Nombre d'utilisateurs suivis: ${followingIds.length}`);
      
      // Récupérer les utilisateurs suivis avec leurs choices et interests
      const followedUsers = await User.find({ _id: { $in: followingIds } })
        .select('_id name username profilePicture photo_url choices interests');
      
      console.log(`📊 Utilisateurs suivis récupérés: ${followedUsers.length}`);
      
      // Collecter tous les IDs de choices et interests
      let allChoiceIds = [];
      let allInterestIds = [];
      
      followedUsers.forEach(followedUser => {
        if (followedUser.choices && Array.isArray(followedUser.choices)) {
          allChoiceIds = [...allChoiceIds, ...followedUser.choices];
        }
        
        if (followedUser.interests && Array.isArray(followedUser.interests)) {
          // Filtrer pour ne garder que les ID ou les objets avec un ID
          const interestIds = followedUser.interests
            .filter(interest => 
              typeof interest === 'string' || 
              (typeof interest === 'object' && interest._id)
            )
            .map(interest => 
              typeof interest === 'string' ? interest : interest._id.toString()
            );
          
          allInterestIds = [...allInterestIds, ...interestIds];
        }
      });
      
      // Dédupliquer les IDs
      allChoiceIds = [...new Set(allChoiceIds)];
      allInterestIds = [...new Set(allInterestIds)];
      
      console.log(`📊 Total choices à rechercher: ${allChoiceIds.length}`);
      console.log(`📊 Total interests à rechercher: ${allInterestIds.length}`);
      
      // Créer une fonction pour récupérer les données d'une collection spécifique
      const getItemsFromCollection = async (collection, ids, isChoice, isInterest) => {
        if (!ids || ids.length === 0) return [];
        
        let query = { _id: { $in: ids } };
        
        // Ajouter un filtre de géolocalisation si les coordonnées sont fournies
        if (lat && lng && radius) {
          query.location = {
            $nearSphere: {
              $geometry: {
                type: 'Point',
                coordinates: [parseFloat(lng), parseFloat(lat)]
              },
              $maxDistance: parseInt(radius)
            }
          };
        }
        
        try {
          const items = await collection.find(query)
            .select('_id name location address coordinates rating photo_url category')
            .limit(100);
          
          return items.map(item => formatPlace(item, item.category || 'unknown', isChoice, isInterest));
        } catch (error) {
          console.error(`❌ Erreur lors de la récupération des données:`, error);
          return [];
        }
      };
      
      // 1. Restaurants
      let choiceRestaurants = [];
      let interestRestaurants = [];
      
      try {
        const RestaurantProducer = createModel(
          databases.RESTAURATION, 
          'Producer', 
          'Producers'
        );
        
        choiceRestaurants = await getItemsFromCollection(
          RestaurantProducer, 
          allChoiceIds, 
          true, 
          false
        );
        
        interestRestaurants = await getItemsFromCollection(
          RestaurantProducer, 
          allInterestIds, 
          false, 
          true
        );
        
        console.log(`📊 Restaurants choices trouvés: ${choiceRestaurants.length}`);
        console.log(`📊 Restaurants interests trouvés: ${interestRestaurants.length}`);
      } catch (error) {
        console.error('❌ Erreur lors de la récupération des restaurants:', error);
      }
      
      // 2. Loisirs
      let choiceLeisure = [];
      let interestLeisure = [];
      
      try {
        const LeisureProducer = createModel(
          databases.LOISIR, 
          'Producer', 
          'producers'
        );
        
        choiceLeisure = await getItemsFromCollection(
          LeisureProducer, 
          allChoiceIds, 
          true, 
          false
        );
        
        interestLeisure = await getItemsFromCollection(
          LeisureProducer, 
          allInterestIds, 
          false, 
          true
        );
        
        console.log(`📊 Lieux de loisirs choices trouvés: ${choiceLeisure.length}`);
        console.log(`📊 Lieux de loisirs interests trouvés: ${interestLeisure.length}`);
      } catch (error) {
        console.error('❌ Erreur lors de la récupération des lieux de loisirs:', error);
      }
      
      // 3. Bien-être
      let choiceWellness = [];
      let interestWellness = [];
      
      try {
        const WellnessProducer = createModel(
          databases.BEAUTY_WELLNESS, 
          'WellnessPlace', 
          'WellnessPlace'
        );
        
        choiceWellness = await getItemsFromCollection(
          WellnessProducer, 
          allChoiceIds, 
          true, 
          false
        );
        
        interestWellness = await getItemsFromCollection(
          WellnessProducer, 
          allInterestIds, 
          false, 
          true
        );
        
        console.log(`📊 Lieux de bien-être choices trouvés: ${choiceWellness.length}`);
        console.log(`📊 Lieux de bien-être interests trouvés: ${interestWellness.length}`);
      } catch (error) {
        console.error('❌ Erreur lors de la récupération des lieux de bien-être:', error);
      }
      
      // Combiner tous les résultats
      const allChoices = [
        ...choiceRestaurants,
        ...choiceLeisure,
        ...choiceWellness
      ];
      
      const allInterests = [
        ...interestRestaurants,
        ...interestLeisure,
        ...interestWellness
      ];
      
      // Si les résultats sont insuffisants, ajouter des posts
      if (allChoices.length < 10 || allInterests.length < 10) {
        try {
          const posts = await Post.find({
            authorId: { $in: followingIds }
          })
          .limit(30);
          
          console.log(`📊 Posts récupérés: ${posts.length}`);
          
          // Distribuer les posts entre choices et interests
          posts.forEach((post, index) => {
            const formattedPost = formatPost(post, 
                                           index % 2 === 0, 
                                           index % 2 !== 0, 
                                           followingIds);
            
            if (index % 2 === 0) {
              allChoices.push(formattedPost);
            } else {
              allInterests.push(formattedPost);
            }
          });
        } catch (error) {
          console.error('❌ Erreur lors de la récupération des posts:', error);
        }
      }
      
      console.log(`�� Réponse finale: ${allChoices.length} choix, ${allInterests.length} intérêts`);
      
      res.status(200).json({
        choices: allChoices,
        interests: allInterests
      });
      
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des intérêts et choix des amis:', error);
      res.status(500).json({ 
        message: 'Erreur interne du serveur.', 
        error: error.message 
      });
    }
  });

  /**
   * @route GET /api/friends/feed/:userId
   * @desc Obtenir les posts des amis d'un utilisateur
   * @access Public (Was Private)
   */
  router.get('/feed/:userId', async (req, res) => {
    try {
      if (!mongoose.connection.readyState) {
        return res.status(500).json({ message: 'La connexion à la base de données n\'est pas établie' });
      }
      
      const { userId, limit = 20, fromDate } = req.query;
      
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
      
      // Récupérer les posts avec le modèle créé directement
      let query = {
        userId: { $in: friendIds }
      };
      
      if (fromDate) {
        query.timestamp = { $gte: new Date(fromDate) };
      }
      
      const posts = await Post.find(query)
        .sort({ timestamp: -1 })
        .limit(parseInt(limit));
        
      // Enrichir avec les infos utilisateur
      const enrichedPosts = await Promise.all(
        posts.map(async (post) => {
          const postUser = await User.findById(post.userId)
            .select('_id name username profilePicture photo_url');
            
          return {
            ...post.toObject(),
            userName: postUser?.name || postUser?.username || 'Utilisateur',
            userProfileImage: postUser?.profilePicture || postUser?.photo_url,
          };
        })
      );
      
      res.status(200).json(enrichedPosts);
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des posts des amis :', error);
      res.status(500).json({ message: 'Erreur interne du serveur.' });
    }
  });

  /**
   * @route GET /api/friends/suggestions/:userId
   * @desc Obtenir des suggestions d'amis pour un utilisateur
   * @access Public (Was Private)
   */
  router.get('/suggestions/:userId', async (req, res) => {
    try {
      if (!mongoose.connection.readyState) {
        return res.status(500).json({ message: 'La connexion à la base de données n\'est pas établie' });
      }
      
      const { userId, limit = 10 } = req.query;
      
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
      
      // Récupérer les utilisateurs à suggérer
      const suggestedUsers = await User.find({ _id: { $nin: friendIds } })
        .select('_id name username profilePicture photo_url location last_active interests following followers')
        .limit(parseInt(limit));
      
      // Transformer pour le format attendu par le frontend
      const formattedSuggestedUsers = suggestedUsers.map(u => ({
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
      
      res.status(200).json(formattedSuggestedUsers);
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des suggestions d\'amis :', error);
      res.status(500).json({ message: 'Erreur interne du serveur.' });
    }
  });

  /**
   * @route POST /api/friends/request
   * @desc Envoyer une demande d'ami à un utilisateur
   * @access Public (Was Private)
   */
  router.post('/request', async (req, res) => {
    try {
      if (!mongoose.connection.readyState) {
        return res.status(500).json({ message: 'La connexion à la base de données n\'est pas établie' });
      }
      
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
      console.error('❌ Erreur lors de l\'envoi de la demande d\'ami :', error);
      res.status(500).json({ message: 'Erreur interne du serveur.' });
    }
  });

  return router;
};

router.initialize = initialize;
module.exports = router; 