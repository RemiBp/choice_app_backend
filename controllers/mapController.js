const mongoose = require('mongoose');
const { Producer } = require('../models/Producer');
const BeautyPlace = require('../models/BeautyPlace');
const WellnessPlace = require('../models/WellnessPlace');
const { restaurationDb, loisirCultureDb, beautyWellnessDb } = require('../index');

// Modèles pour les différentes collections
const Restaurant = restaurationDb.model('Producer', new mongoose.Schema({}), 'producers');
const LeisureProducer = loisirCultureDb.model('LeisureProducer', new mongoose.Schema({}), 'Loisir_Paris_Producers');
const LeisureEvent = loisirCultureDb.model('LeisureEvent', new mongoose.Schema({}), 'Loisir_Paris_Evenements');

/**
 * Contrôleur pour les fonctionnalités cartographiques
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
      const restaurantsPromise = Restaurant.find({
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
        })));

      const leisureVenuesPromise = LeisureProducer.find({
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
        })));

      const leisureEventsPromise = LeisureEvent.find({
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
        })));

      const wellnessPlacesPromise = WellnessPlace.find({
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
        })));

      // Exécuter toutes les requêtes en parallèle
      const [restaurants, leisureVenues, leisureEvents, wellnessPlaces] = await Promise.all([
        restaurantsPromise,
        leisureVenuesPromise,
        leisureEventsPromise,
        wellnessPlacesPromise
      ]);

      // Formater les données pour la carte
      const markers = [
        ...restaurants,
        ...leisureVenues,
        ...leisureEvents,
        ...wellnessPlaces
      ];

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
  }
};

module.exports = mapController;