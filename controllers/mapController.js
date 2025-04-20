const mongoose = require('mongoose');
const { createModel, databases } = require('../utils/modelCreator');
const { User } = require('../models/UserModels')(mongoose.connection);

// Initialiser les modèles directement avec notre utilitaire
const Producer = createModel(
  databases.RESTAURATION,
  'Producer',
  'Producers'
);

const BeautyPlace = createModel(
  databases.BEAUTY_WELLNESS,
  'BeautyPlace',
  'BeautyPlaces'
);

const WellnessPlace = createModel(
  databases.BEAUTY_WELLNESS,
  'WellnessPlace',
  'WellnessPlaces'
);

const LeisureProducer = createModel(
  databases.LOISIR,
  'LeisureProducer',
  'LeisureProducers'
);

const LeisureEvent = createModel(
  databases.LOISIR,
  'Event',
  'Events'
);

/**
 * Contrôleur pour les fonctionnalités de carte/géolocalisation
 */
const mapController = {
  /**
   * Obtenir tous les marqueurs pour la carte (vue globale)
   */
  getAllMarkers: async (req, res) => {
    try {
      const { lat, lng, radius = 5000, limit = 50 } = req.query;

      if (!lat || !lng) {
        return res.status(400).json({ message: 'Les coordonnées (lat, lng) sont requises' });
      }

      // Coordonnées et rayon
      const coordinates = [parseFloat(lng), parseFloat(lat)];
      const maxDistance = parseInt(radius);

      // Requêtes pour chaque type d'entité
      const restaurantsPromise = Restaurant && Restaurant.find({
        location: {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates
            },
            $maxDistance: maxDistance
          }
        }
      })
        .limit(parseInt(limit))
        .lean()
        .exec()
        .then(restaurants => restaurants.map(r => ({
          ...r,
          type: 'restaurant'
        })))
        .catch(err => {
          console.error('Erreur lors de la récupération des restaurants:', err);
          return [];
        });

      const leisureVenuesPromise = LeisureProducer && LeisureProducer.find({
        localisation: {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates
            },
            $maxDistance: maxDistance
          }
        }
      })
        .limit(parseInt(limit))
        .lean()
        .exec()
        .then(venues => venues.map(v => ({
          ...v,
          type: 'leisureVenue'
        })))
        .catch(err => {
          console.error('Erreur lors de la récupération des lieux de loisirs:', err);
          return [];
        });

      const leisureEventsPromise = LeisureEvent && LeisureEvent.find({
        localisation: {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates
            },
            $maxDistance: maxDistance
          }
        }
      })
        .limit(parseInt(limit))
        .lean()
        .exec()
        .then(events => events.map(e => ({
          ...e,
          type: 'leisureEvent'
        })))
        .catch(err => {
          console.error('Erreur lors de la récupération des événements de loisirs:', err);
          return [];
        });

      const wellnessPlacesPromise = WellnessPlace && WellnessPlace.find({
        location: {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates
            },
            $maxDistance: maxDistance
          }
        }
      })
        .limit(parseInt(limit))
        .lean()
        .exec()
        .then(places => places.map(p => ({
          ...p,
          type: 'wellness'
        })))
        .catch(err => {
          console.error('Erreur lors de la récupération des lieux de bien-être:', err);
          return [];
        });

      // Exécuter toutes les requêtes en parallèle
      const promises = [
        restaurantsPromise,
        leisureVenuesPromise,
        leisureEventsPromise,
        wellnessPlacesPromise
      ].filter(Boolean);
      
      const results = await Promise.all(promises);

      // Formater les données pour la carte
      const markers = results.flat();

      res.status(200).json(markers);
    } catch (error) {
      console.error('❌ Erreur dans getAllMarkers:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des marqueurs', error: error.message });
    }
  },

  /**
   * Obtenir les restaurants pour la carte
   */
  getRestaurantsForMap: async (req, res) => {
    try {
      const { lat, lng, radius = 5000, limit = 50 } = req.query;

      if (!lat || !lng) {
        return res.status(400).json({ message: 'Les coordonnées (lat, lng) sont requises' });
      }

      // Vérifier que le modèle est disponible
      if (!Restaurant) {
        return res.status(500).json({ message: 'Modèle Restaurant non disponible' });
      }

      // Recherche géospatiale
      const restaurants = await Restaurant.find({
        location: {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: [parseFloat(lng), parseFloat(lat)]
            },
            $maxDistance: parseInt(radius)
          }
        }
      }).limit(parseInt(limit));

      res.status(200).json(restaurants);
    } catch (error) {
      console.error('❌ Erreur dans getRestaurantsForMap:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des restaurants', error: error.message });
    }
  },

  /**
   * Obtenir les lieux de loisirs pour la carte
   */
  getLeisureVenuesForMap: async (req, res) => {
    try {
      const { lat, lng, radius = 5000, limit = 50 } = req.query;

      if (!lat || !lng) {
        return res.status(400).json({ message: 'Les coordonnées (lat, lng) sont requises' });
      }

      // Vérifier que le modèle est disponible
      if (!LeisureProducer) {
        return res.status(500).json({ message: 'Modèle LeisureProducer non disponible' });
      }

      // Recherche géospatiale
      const leisureVenues = await LeisureProducer.find({
        localisation: {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: [parseFloat(lng), parseFloat(lat)]
            },
            $maxDistance: parseInt(radius)
          }
        }
      }).limit(parseInt(limit));

      res.status(200).json(leisureVenues);
    } catch (error) {
      console.error('❌ Erreur dans getLeisureVenuesForMap:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des lieux de loisirs', error: error.message });
    }
  },

  /**
   * Obtenir les événements de loisirs pour la carte
   */
  getLeisureEventsForMap: async (req, res) => {
    try {
      const { lat, lng, radius = 5000, limit = 50 } = req.query;

      if (!lat || !lng) {
        return res.status(400).json({ message: 'Les coordonnées (lat, lng) sont requises' });
      }

      // Vérifier que le modèle est disponible
      if (!LeisureEvent) {
        return res.status(500).json({ message: 'Modèle LeisureEvent non disponible' });
      }

      // Recherche géospatiale
      const leisureEvents = await LeisureEvent.find({
        localisation: {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: [parseFloat(lng), parseFloat(lat)]
            },
            $maxDistance: parseInt(radius)
          }
        }
      }).limit(parseInt(limit));

      res.status(200).json(leisureEvents);
    } catch (error) {
      console.error('❌ Erreur dans getLeisureEventsForMap:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des événements de loisirs', error: error.message });
    }
  },

  /**
   * Obtenir les établissements de bien-être pour la carte
   */
  getWellnessPlacesForMap: async (req, res) => {
    try {
      const { lat, lng, radius = 5000, limit = 50 } = req.query;

      if (!lat || !lng) {
        return res.status(400).json({ message: 'Les coordonnées (lat, lng) sont requises' });
      }

      // Recherche géospatiale parallèle dans les deux collections
      const [beautyPlaces, wellnessPlaces] = await Promise.all([
        BeautyPlace.find({
          location: {
            $nearSphere: {
              $geometry: {
                type: "Point",
                coordinates: [parseFloat(lng), parseFloat(lat)]
              },
              $maxDistance: parseInt(radius)
            }
          }
        }).limit(parseInt(limit)),
        WellnessPlace.find({
          location: {
            $nearSphere: {
              $geometry: {
                type: "Point",
                coordinates: [parseFloat(lng), parseFloat(lat)]
              },
              $maxDistance: parseInt(radius)
            }
          }
        }).limit(parseInt(limit))
      ]);

      // Fusionner les résultats
      const allWellnessPlaces = [...beautyPlaces, ...wellnessPlaces];

      res.status(200).json(allWellnessPlaces);
    } catch (error) {
      console.error('❌ Erreur dans getWellnessPlacesForMap:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des établissements de bien-être', error: error.message });
    }
  },

  /**
   * Rechercher des restaurants sur la carte
   */
  searchRestaurantsOnMap: async (req, res) => {
    try {
      const { location, radius = 5000, filters = {}, limit = 50 } = req.body;

      if (!location || !location.lat || !location.lng) {
        return res.status(400).json({ message: 'Les coordonnées de localisation sont requises' });
      }

      // Construire la requête de recherche
      const searchQuery = {
        location: {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: [parseFloat(location.lng), parseFloat(location.lat)]
            },
            $maxDistance: parseInt(radius)
          }
        }
      };

      // Ajouter les filtres supplémentaires
      if (filters.category) searchQuery.category = filters.category;
      if (filters.cuisine) searchQuery.cuisine = filters.cuisine;
      if (filters.priceRange) searchQuery.price_level = filters.priceRange;
      if (filters.rating) searchQuery.rating = { $gte: parseFloat(filters.rating) };

      // Exécuter la recherche
      const restaurants = await Restaurant.find(searchQuery)
        .limit(parseInt(limit));

      res.status(200).json({ restaurants });
    } catch (error) {
      console.error('❌ Erreur dans searchRestaurantsOnMap:', error);
      res.status(500).json({ message: 'Erreur lors de la recherche de restaurants', error: error.message });
    }
  },

  /**
   * Rechercher des lieux de loisirs sur la carte
   */
  searchLeisureVenuesOnMap: async (req, res) => {
    try {
      const { location, radius = 5000, filters = {}, limit = 50 } = req.body;

      if (!location || !location.lat || !location.lng) {
        return res.status(400).json({ message: 'Les coordonnées de localisation sont requises' });
      }

      // Construire la requête de recherche
      const searchQuery = {
        localisation: {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: [parseFloat(location.lng), parseFloat(location.lat)]
            },
            $maxDistance: parseInt(radius)
          }
        }
      };

      // Ajouter les filtres supplémentaires
      if (filters.category) searchQuery.catégorie = filters.category;
      if (filters.tags) searchQuery.tags = { $in: filters.tags };
      if (filters.rating) searchQuery.note = { $gte: parseFloat(filters.rating) };
      if (filters.accessibility) searchQuery.accessibility = filters.accessibility;

      // Exécuter la recherche
      const venues = await LeisureProducer.find(searchQuery)
        .limit(parseInt(limit));

      res.status(200).json({ venues });
    } catch (error) {
      console.error('❌ Erreur dans searchLeisureVenuesOnMap:', error);
      res.status(500).json({ message: 'Erreur lors de la recherche de lieux de loisirs', error: error.message });
    }
  },

  /**
   * Rechercher des événements de loisirs sur la carte
   */
  searchLeisureEventsOnMap: async (req, res) => {
    try {
      const { location, radius = 5000, filters = {}, limit = 50 } = req.body;

      if (!location || !location.lat || !location.lng) {
        return res.status(400).json({ message: 'Les coordonnées de localisation sont requises' });
      }

      // Construire la requête de recherche
      const searchQuery = {
        localisation: {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: [parseFloat(location.lng), parseFloat(location.lat)]
            },
            $maxDistance: parseInt(radius)
          }
        }
      };

      // Ajouter les filtres supplémentaires
      if (filters.category) searchQuery.catégorie = filters.category;
      if (filters.emotions) searchQuery.émotions = { $in: filters.emotions };
      if (filters.dateRange) {
        searchQuery.date = {};
        if (filters.dateRange.start) searchQuery.date.$gte = new Date(filters.dateRange.start);
        if (filters.dateRange.end) searchQuery.date.$lte = new Date(filters.dateRange.end);
      }
      if (filters.priceRange) searchQuery.prix = { $lte: filters.priceRange };
      if (filters.familyFriendly) searchQuery.famille = true;

      // Exécuter la recherche
      const events = await LeisureEvent.find(searchQuery)
        .limit(parseInt(limit));

      res.status(200).json({ events });
    } catch (error) {
      console.error('❌ Erreur dans searchLeisureEventsOnMap:', error);
      res.status(500).json({ message: 'Erreur lors de la recherche d\'événements de loisirs', error: error.message });
    }
  },

  /**
   * Rechercher des établissements de bien-être sur la carte
   */
  searchWellnessPlacesOnMap: async (req, res) => {
    try {
      const { location, radius = 5000, filters = {}, limit = 50 } = req.body;

      if (!location || !location.lat || !location.lng) {
        return res.status(400).json({ message: 'Les coordonnées de localisation sont requises' });
      }

      // Construire les requêtes de recherche pour les deux collections
      const searchQuery = {
        location: {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: [parseFloat(location.lng), parseFloat(location.lat)]
            },
            $maxDistance: parseInt(radius)
          }
        }
      };

      // Ajouter les filtres supplémentaires (compatibles avec les deux collections)
      if (filters.category) {
        searchQuery.category = filters.category;
        // Alternative pour BeautyPlace qui pourrait utiliser une autre structure
        searchQuery.serviceCategory = filters.category;
      }
      if (filters.rating) searchQuery.rating = { $gte: parseFloat(filters.rating) };
      if (filters.priceRange) {
        searchQuery.priceLevel = filters.priceRange;
        searchQuery.price_level = filters.priceRange; // Alternative
      }

      // Exécuter la recherche dans les deux collections
      const [beautyPlaces, wellnessPlaces] = await Promise.all([
        BeautyPlace.find(searchQuery).limit(parseInt(limit)),
        WellnessPlace.find(searchQuery).limit(parseInt(limit))
      ]);

      // Fusionner les résultats
      const allPlaces = [...beautyPlaces, ...wellnessPlaces];

      res.status(200).json({ places: allPlaces });
    } catch (error) {
      console.error('❌ Erreur dans searchWellnessPlacesOnMap:', error);
      res.status(500).json({ message: 'Erreur lors de la recherche d\'établissements de bien-être', error: error.message });
    }
  },

  /**
   * Obtenir les amis à proximité ainsi que leurs activités pour la carte
   */
  getFriendsForMap: async (req, res) => {
    try {
      const { lat, lng, radius = 5000, userId, limit = 50 } = req.query;

      if (!lat || !lng || !userId) {
        return res.status(400).json({ message: 'Les coordonnées (lat, lng) et l\'ID utilisateur sont requis' });
      }

      // Référence aux collections
      const { choiceAppDb } = require('../index');
      const User = choiceAppDb.model('User', new mongoose.Schema({}, { strict: false }), 'Users');
      const Activities = choiceAppDb.model('Activity', new mongoose.Schema({}, { strict: false }), 'activities');
      
      // Récupérer l'utilisateur pour obtenir ses amis
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé' });
      }
      
      // Récupérer les IDs des amis (combinaison des following et followers)
      const friendIds = [
        ...(user.following || []), 
        ...(user.followers || [])
      ].filter((id, index, self) => self.indexOf(id) === index); // Supprimer les doublons
      
      // Rechercher les amis à proximité
      const nearbyFriends = await User.find({
        _id: { $in: friendIds },
        location: {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: [parseFloat(lng), parseFloat(lat)]
            },
            $maxDistance: parseInt(radius)
          }
        }
      }).select('_id name profilePicture location last_active interests').limit(parseInt(limit));
      
      // Récupérer les activités des amis (choix et intérêts)
      const friendsActivities = await Activities.find({
        userId: { $in: friendIds },
        location: {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: [parseFloat(lng), parseFloat(lat)]
            },
            $maxDistance: parseInt(radius)
          }
        }
      }).limit(parseInt(limit));
      
      // Préparation des données pour le frontend
      const formattedFriends = nearbyFriends.map(friend => ({
        id: friend._id,
        name: friend.name,
        profileImage: friend.profilePicture,
        location: friend.location,
        lastActive: friend.last_active || new Date().toISOString(),
        interests: friend.interests || [],
        isFollowing: user.following?.includes(friend._id.toString()) || false,
        isFollower: user.followers?.includes(friend._id.toString()) || false
      }));
      
      // Formater les activités
      const formattedActivities = friendsActivities.map(activity => {
        const friendInfo = nearbyFriends.find(f => f._id.toString() === activity.userId);
        return {
          id: activity._id,
          type: activity.type || 'place',
          name: activity.name,
          friendId: activity.userId,
          friendName: friendInfo?.name || 'Ami',
          isChoice: activity.isChoice || false,
          isInterest: activity.isInterest || false,
          latitude: activity.location?.coordinates?.[1] || 0,
          longitude: activity.location?.coordinates?.[0] || 0,
          address: activity.address,
          rating: activity.rating,
          photo: activity.photo_url || activity.image,
          date: activity.createdAt || activity.date
        };
      });
      
      res.status(200).json({
        friends: formattedFriends,
        activities: formattedActivities
      });
    } catch (error) {
      console.error('❌ Erreur dans getFriendsForMap:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des amis pour la carte', error: error.message });
    }
  },

  /**
   * Rechercher les activités des amis sur la carte avec filtres avancés
   */
  searchFriendsActivitiesOnMap: async (req, res) => {
    try {
      const { location, radius = 5000, filters = {}, userId, limit = 50 } = req.body;

      if (!location || !location.lat || !location.lng || !userId) {
        return res.status(400).json({ message: 'Les coordonnées de localisation et l\'ID utilisateur sont requis' });
      }
      
      // Référence aux collections
      const { choiceAppDb } = require('../index');
      const User = choiceAppDb.model('User', new mongoose.Schema({}, { strict: false }), 'Users');
      const Activities = choiceAppDb.model('Activity', new mongoose.Schema({}, { strict: false }), 'activities');
      
      // Récupérer l'utilisateur pour obtenir ses amis
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé' });
      }
      
      // Filtrer les IDs d'amis si spécifiés dans les filtres
      let friendIds = [];
      if (filters.friendIds && filters.friendIds.length > 0) {
        friendIds = filters.friendIds;
      } else {
        // Récupérer tous les amis (following + followers)
        friendIds = [
          ...(user.following || []), 
          ...(user.followers || [])
        ].filter((id, index, self) => self.indexOf(id) === index);
      }
      
      // Construire la requête pour les activités
      const activitiesQuery = {
        userId: { $in: friendIds },
        location: {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: [parseFloat(location.lng), parseFloat(location.lat)]
            },
            $maxDistance: parseInt(radius)
          }
        }
      };
      
      // Ajouter des filtres supplémentaires pour les activités
      if (filters.activityTypes && filters.activityTypes.length > 0) {
        activitiesQuery.type = { $in: filters.activityTypes };
      }
      
      if (filters.isChoices === true) {
        activitiesQuery.isChoice = true;
      }
      
      if (filters.isInterests === true) {
        activitiesQuery.isInterest = true;
      }
      
      // Filtrer par date si spécifié
      if (filters.dateRange) {
        activitiesQuery.createdAt = {};
        if (filters.dateRange.start) activitiesQuery.createdAt.$gte = new Date(filters.dateRange.start);
        if (filters.dateRange.end) activitiesQuery.createdAt.$lte = new Date(filters.dateRange.end);
      }
      
      // Rechercher les activités
      const activities = await Activities.find(activitiesQuery).limit(parseInt(limit));
      
      // Récupérer les informations des amis pour enrichir les données
      const friendsInfo = await User.find({ _id: { $in: friendIds } })
        .select('_id name profilePicture')
        .lean();
      
      // Créer un dictionnaire pour un accès rapide
      const friendsMap = {};
      friendsInfo.forEach(friend => {
        friendsMap[friend._id.toString()] = friend;
      });
      
      // Formater les activités avec les infos des amis
      const formattedActivities = activities.map(activity => {
        const friend = friendsMap[activity.userId] || {};
        return {
          id: activity._id,
          name: activity.name,
          type: activity.type || 'place',
          category: activity.category,
          friendId: activity.userId,
          friendName: friend.name || 'Ami',
          friendPhoto: friend.profilePicture,
          isChoice: activity.isChoice || false,
          isInterest: activity.isInterest || false,
          latitude: activity.location?.coordinates?.[1] || 0,
          longitude: activity.location?.coordinates?.[0] || 0,
          address: activity.address,
          rating: activity.rating,
          photo: activity.photo_url || activity.image,
          date: activity.createdAt || activity.date
        };
      });
      
      res.status(200).json({ activities: formattedActivities });
    } catch (error) {
      console.error('❌ Erreur dans searchFriendsActivitiesOnMap:', error);
      res.status(500).json({ message: 'Erreur lors de la recherche des activités des amis', error: error.message });
    }
  },

  /**
   * Récupère les restaurants en fonction d'une requête géographique complexe
   * @param {Object} geoQuery - Requête MongoDB géographique
   * @returns {Promise<Array>} Liste des restaurants
   */
  getRestaurantsWithGeoQuery: async (geoQuery) => {
    try {
      // Utiliser le modèle Producer pour les restaurants
      const restaurantModel = restaurationDb.model(
        'Restaurant',
        new mongoose.Schema({}, { strict: false }),
        'restaurants'
      );
      
      // Exécuter la requête
      return await restaurantModel.find(geoQuery).limit(50);
    } catch (error) {
      console.error('Erreur lors de la recherche géographique de restaurants:', error);
      throw error;
    }
  },

  /**
   * Récupère les intérêts et les choix des followings pour un lieu de loisir spécifique
   * @route GET /api/leisure/venues/:venueId/following-interests
   */
  getFollowingInterestsForVenue: async (req, res) => {
    try {
      const { venueId } = req.params;
      
      // Vérifier si l'utilisateur est authentifié
      if (!req.user) {
        return res.status(401).json({ message: 'Utilisateur non authentifié' });
      }
      
      const userId = req.user._id;
      
      // Récupérer la liste des followings de l'utilisateur
      const user = await User.findById(userId).select('following');
      
      if (!user || !user.following || user.following.length === 0) {
        return res.json({
          interests: [],
          choices: [],
          followings: []
        });
      }
      
      // Récupérer les utilisateurs suivis avec leurs informations de base
      const followings = await User.find({
        _id: { $in: user.following }
      }).select('_id name photo_url interests choices');
      
      // Récupérer les intérêts des followings pour ce lieu
      const interests = [];
      const choices = [];
      
      // Parcourir les followings pour trouver ceux qui ont un intérêt ou un choix pour ce lieu
      for (const following of followings) {
        // Vérifier les intérêts
        if (following.interests && following.interests.length > 0) {
          for (const interest of following.interests) {
            if (interest.toString() === venueId || 
                (interest.targetId && interest.targetId.toString() === venueId)) {
              interests.push({
                userId: following._id,
                venueId: venueId,
                timestamp: interest.timestamp || new Date()
              });
              break;
            }
          }
        }
        
        // Vérifier les choix
        if (following.choices && following.choices.length > 0) {
          for (const choice of following.choices) {
            if (choice.toString() === venueId || 
                (choice.targetId && choice.targetId.toString() === venueId)) {
              choices.push({
                userId: following._id,
                venueId: venueId,
                timestamp: choice.timestamp || new Date()
              });
              break;
            }
          }
        }
      }
      
      // Filtrer les followings pour ne garder que ceux qui ont un intérêt ou un choix
      const relevantFollowings = followings.filter(following => 
        interests.some(i => i.userId.toString() === following._id.toString()) ||
        choices.some(c => c.userId.toString() === following._id.toString())
      );
      
      res.json({
        interests,
        choices,
        followings: relevantFollowings.map(f => ({
          id: f._id,
          name: f.name,
          photo_url: f.photo_url
        }))
      });
      
    } catch (error) {
      console.error('❌ Erreur dans getFollowingInterestsForVenue:', error);
      res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
  },

  /**
   * Récupère les restaurants à proximité
   * @route GET /api/map/restaurants/nearby
   */
  getNearbyRestaurants: async (req, res) => {
    try {
      const { latitude, longitude, radius = 5000 } = req.query;
      
      if (!latitude || !longitude) {
        return res.status(400).json({ message: 'Les coordonnées (latitude, longitude) sont requises' });
      }
      
      // Logique de recherche des restaurants (utiliser la méthode existante si disponible)
      const restaurants = await mapController.searchRestaurantsOnMap({ 
        body: {
          location: { lat: parseFloat(latitude), lng: parseFloat(longitude) },
          radius: parseInt(radius),
          filters: req.query,
          limit: 50
        }
      }, { json: (data) => data });
      
      res.status(200).json(restaurants.restaurants || []);
    } catch (error) {
      console.error('❌ Erreur dans getNearbyRestaurants:', error);
      res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
  },

  /**
   * Récupère les items de restaurant à proximité
   * @route GET /api/map/restaurant-items/nearby
   */
  getNearbyRestaurantItems: async (req, res) => {
    try {
      const { latitude, longitude, radius = 5000 } = req.query;
      
      if (!latitude || !longitude) {
        return res.status(400).json({ message: 'Les coordonnées (latitude, longitude) sont requises' });
      }
      
      // Exemple simple de recherche (à adapter selon votre modèle de données)
      const restaurantItems = []; // Remplacer par votre logique de recherche
      
      res.status(200).json(restaurantItems);
    } catch (error) {
      console.error('❌ Erreur dans getNearbyRestaurantItems:', error);
      res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
  },

  /**
   * Récupère les établissements de bien-être à proximité
   * @route GET /api/map/wellness/nearby
   */
  getNearbyWellnessPlaces: async (req, res) => {
    try {
      const { latitude, longitude, radius = 5000 } = req.query;
      
      if (!latitude || !longitude) {
        return res.status(400).json({ message: 'Les coordonnées (latitude, longitude) sont requises' });
      }
      
      // Logique de recherche des lieux de bien-être (utiliser la méthode existante si disponible)
      const wellnessPlaces = await mapController.searchWellnessPlacesOnMap({ 
        body: {
          location: { lat: parseFloat(latitude), lng: parseFloat(longitude) },
          radius: parseInt(radius),
          filters: req.query,
          limit: 50
        }
      }, { json: (data) => data });
      
      res.status(200).json(wellnessPlaces.places || []);
    } catch (error) {
      console.error('❌ Erreur dans getNearbyWellnessPlaces:', error);
      res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
  },

  /**
   * Récupère les lieux de loisir
   * @route GET /api/map/leisure/venues
   */
  getLeisureVenues: async (req, res) => {
    try {
      const { latitude, longitude, radius = 5000, ...filters } = req.query;
      
      if (!latitude || !longitude) {
        return res.status(400).json({ message: 'Les coordonnées (latitude, longitude) sont requises' });
      }
      
      // Logique de recherche des lieux de loisir (utiliser la méthode existante si disponible)
      const leisureVenues = await mapController.searchLeisureVenuesOnMap({ 
        body: {
          location: { lat: parseFloat(latitude), lng: parseFloat(longitude) },
          radius: parseInt(radius),
          filters: filters,
          limit: 50
        }
      }, { json: (data) => data });
      
      res.status(200).json(leisureVenues.venues || []);
    } catch (error) {
      console.error('❌ Erreur dans getLeisureVenues:', error);
      res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
  },

  /**
   * Récupère les événements de loisir
   * @route GET /api/map/leisure/events
   */
  getLeisureEvents: async (req, res) => {
    try {
      const { latitude, longitude, radius = 5000, ...filters } = req.query;
      
      if (!latitude || !longitude) {
        return res.status(400).json({ message: 'Les coordonnées (latitude, longitude) sont requises' });
      }
      
      // Logique de recherche des événements de loisir (utiliser la méthode existante si disponible)
      const leisureEvents = await mapController.searchLeisureEventsOnMap({ 
        body: {
          location: { lat: parseFloat(latitude), lng: parseFloat(longitude) },
          radius: parseInt(radius),
          filters: filters,
          limit: 50
        }
      }, { json: (data) => data });
      
      res.status(200).json(leisureEvents.events || []);
    } catch (error) {
      console.error('❌ Erreur dans getLeisureEvents:', error);
      res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
  },

  /**
   * Récupère les catégories de loisir
   * @route GET /api/map/leisure/categories
   */
  getLeisureCategories: async (req, res) => {
    try {
      // Liste des catégories disponibles (à adapter selon vos données réelles)
      const categories = [
        'Musée', 'Théâtre', 'Cinéma', 'Exposition', 'Festival', 
        'Concert', 'Spectacle', 'Galerie d\'art', 'Parc d\'attractions'
      ];
      
      res.status(200).json(categories);
    } catch (error) {
      console.error('❌ Erreur dans getLeisureCategories:', error);
      res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
  },

  /**
   * Récupère les émotions associées aux loisirs
   * @route GET /api/map/leisure/emotions
   */
  getLeisureEmotions: async (req, res) => {
    try {
      // Liste des émotions disponibles (à adapter selon vos données réelles)
      const emotions = [
        'Joie', 'Surprise', 'Nostalgie', 'Fascination', 'Inspiration',
        'Émerveillement', 'Détente', 'Excitation', 'Créativité'
      ];
      
      res.status(200).json(emotions);
    } catch (error) {
      console.error('❌ Erreur dans getLeisureEmotions:', error);
      res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
  },

  /**
   * Récupère les critères d'évaluation pour les lieux de loisir
   * @route GET /api/map/leisure/rating-criteria
   */
  getLeisureRatingCriteria: async (req, res) => {
    try {
      const { category } = req.query;
      
      // Critères par défaut
      let criteria = {
        ambiance: 'Ambiance',
        qualite_service: 'Qualité du service',
        rapport_qualite_prix: 'Rapport qualité/prix'
      };
      
      // Critères spécifiques selon la catégorie
      if (category) {
        switch(category.toLowerCase()) {
          case 'théâtre':
          case 'theatre':
            criteria = {
              mise_en_scene: 'Mise en scène',
              jeu_acteurs: 'Jeu des acteurs',
              scenario: 'Scénario',
              decors: 'Décors'
            };
            break;
          case 'musée':
          case 'musee':
            criteria = {
              collections: 'Collections',
              presentation: 'Présentation',
              information: 'Information',
              accessibilite: 'Accessibilité'
            };
            break;
          case 'concert':
            criteria = {
              qualite_sonore: 'Qualité sonore',
              performance: 'Performance',
              ambiance: 'Ambiance',
              organisation: 'Organisation'
            };
            break;
        }
      }
      
      res.status(200).json(criteria);
    } catch (error) {
      console.error('❌ Erreur dans getLeisureRatingCriteria:', error);
      res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
  },

  /**
   * Récupère les données de la heatmap
   * @route GET /api/map/heatmap
   */
  getHeatmapData: async (req, res) => {
    try {
      // Exemple simple de points pour une heatmap (à adapter selon vos données réelles)
      const heatmapPoints = [
        { lat: 48.8566, lng: 2.3522, weight: 10 }, // Paris
        { lat: 48.8606, lng: 2.3376, weight: 8 },  // Louvre
        { lat: 48.8584, lng: 2.2945, weight: 7 },  // Tour Eiffel
        { lat: 48.8738, lng: 2.2950, weight: 6 },  // Arc de Triomphe
      ];
      
      res.status(200).json(heatmapPoints);
    } catch (error) {
      console.error('❌ Erreur dans getHeatmapData:', error);
      res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
  },

  /**
   * Récupère les signets de loisir de l'utilisateur
   * @route GET /api/map/bookmarks/leisure
   */
  getUserLeisureBookmarks: async (req, res) => {
    try {
      // Vérifier si l'utilisateur est authentifié
      if (!req.user) {
        return res.status(401).json({ message: 'Utilisateur non authentifié' });
      }
      
      const userId = req.user._id;
      
      // Récupérer l'utilisateur avec ses signets
      const user = await User.findById(userId).select('bookmarks.leisure');
      
      if (!user || !user.bookmarks || !user.bookmarks.leisure) {
        return res.json({ bookmarks: [] });
      }
      
      // Récupérer les détails des lieux signets
      const bookmarkIds = user.bookmarks.leisure;
      const bookmarks = [];
      
      // Si vous avez un modèle LeisureVenue, vous pourriez faire quelque chose comme:
      // const bookmarks = await LeisureVenue.find({ _id: { $in: bookmarkIds } });
      
      // Pour l'exemple, nous retournons juste des données fictives
      for (const id of bookmarkIds) {
        bookmarks.push({
          id: id,
          name: `Lieu de loisir ${id}`,
          category: 'Loisir',
          address: 'Adresse du lieu',
          rating: 4.5,
          image: 'https://example.com/image.jpg'
        });
      }
      
      res.json({ bookmarks });
    } catch (error) {
      console.error('❌ Erreur dans getUserLeisureBookmarks:', error);
      res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
  },

  /**
   * Ajoute un signet de loisir
   * @route POST /api/map/bookmarks/leisure
   */
  addLeisureBookmark: async (req, res) => {
    try {
      // Vérifier si l'utilisateur est authentifié
      if (!req.user) {
        return res.status(401).json({ message: 'Utilisateur non authentifié' });
      }
      
      const userId = req.user._id;
      const { venueId } = req.body;
      
      if (!venueId) {
        return res.status(400).json({ message: 'ID du lieu requis' });
      }
      
      // Mettre à jour l'utilisateur
      const updateResult = await User.findByIdAndUpdate(
        userId,
        { $addToSet: { 'bookmarks.leisure': venueId } },
        { new: true }
      );
      
      if (!updateResult) {
        return res.status(404).json({ message: 'Utilisateur non trouvé' });
      }
      
      res.status(201).json({ 
        message: 'Signet ajouté avec succès',
        bookmark: venueId
      });
    } catch (error) {
      console.error('❌ Erreur dans addLeisureBookmark:', error);
      res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
  },

  /**
   * Supprime un signet de loisir
   * @route DELETE /api/map/bookmarks/leisure/:venueId
   */
  removeLeisureBookmark: async (req, res) => {
    try {
      // Vérifier si l'utilisateur est authentifié
      if (!req.user) {
        return res.status(401).json({ message: 'Utilisateur non authentifié' });
      }
      
      const userId = req.user._id;
      const { venueId } = req.params;
      
      if (!venueId) {
        return res.status(400).json({ message: 'ID du lieu requis' });
      }
      
      // Mettre à jour l'utilisateur
      const updateResult = await User.findByIdAndUpdate(
        userId,
        { $pull: { 'bookmarks.leisure': venueId } },
        { new: true }
      );
      
      if (!updateResult) {
        return res.status(404).json({ message: 'Utilisateur non trouvé' });
      }
      
      res.status(200).json({ 
        message: 'Signet supprimé avec succès'
      });
    } catch (error) {
      console.error('❌ Erreur dans removeLeisureBookmark:', error);
      res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
  },
};

module.exports = mapController;