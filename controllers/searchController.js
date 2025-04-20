const mongoose = require('mongoose');
const { createModel, databases } = require('../utils/modelCreator');

// Initialiser les modèles directement avec notre utilitaire
const Producer = createModel(
  databases.RESTAURATION,
  'Producer',
  'Producers'
);

const UserChoice = createModel(
  databases.CHOICE_APP,
  'User',
  'Users'
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

const User = createModel(
  databases.CHOICE_APP,
  'User',
  'Users'
);

const LeisureEvent = createModel(
  databases.LOISIR,
  'Event',
  'Events'
);

/**
 * Contrôleur pour les fonctionnalités de recherche
 */
const searchController = {
  /**
   * Recherche globale
   */
  search: async (req, res) => {
    try {
      const { query, types = [], lat, lng, radius, limit = 20 } = req.body;

      if (!query && !lat && !lng) {
        return res.status(400).json({ message: 'Veuillez fournir un mot-clé pour la recherche ou des coordonnées géographiques.' });
      }

      // Initialiser les résultats
      let results = {
        restaurants: [],
        leisurePlaces: [],
        leisureEvents: [],
        wellnessPlaces: [],
        beautyPlaces: [],
        users: []
      };

      // Déterminer quels types de résultats rechercher
      let typesToSearch = types.length ? types : ['restaurants', 'leisurePlaces', 'leisureEvents', 'wellnessPlaces', 'beautyPlaces', 'users'];

      // Créer les requêtes de recherche en fonction des paramètres
      const searchPromises = [];

      // Créer la condition géographique si lat et lng sont fournis
      let geoQuery = null;
      if (lat && lng) {
        geoQuery = {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: [parseFloat(lng), parseFloat(lat)]
            },
            $maxDistance: parseInt(radius) || 5000
          }
        };
      }

      // Créer la condition textuelle si query est fourni
      let textQuery = null;
      if (query) {
        // On crée une requête différente pour chaque collection à cause des différences de structure
        const restaurantTextQuery = {
          $or: [
            { name: { $regex: query, $options: 'i' } },
            { description: { $regex: query, $options: 'i' } },
            { tags: { $regex: query, $options: 'i' } },
            { category: { $regex: query, $options: 'i' } }
          ]
        };

        const leisurePlaceTextQuery = {
          $or: [
            { lieu: { $regex: query, $options: 'i' } },
            { adresse: { $regex: query, $options: 'i' } },
            { description: { $regex: query, $options: 'i' } },
            { catégorie: { $regex: query, $options: 'i' } }
          ]
        };

        const leisureEventTextQuery = {
          $or: [
            { intitulé: { $regex: query, $options: 'i' } },
            { lieu: { $regex: query, $options: 'i' } },
            { adresse: { $regex: query, $options: 'i' } },
            { description: { $regex: query, $options: 'i' } },
            { catégorie: { $regex: query, $options: 'i' } }
          ]
        };

        const wellnessTextQuery = {
          $or: [
            { name: { $regex: query, $options: 'i' } },
            { description: { $regex: query, $options: 'i' } },
            { tags: { $regex: query, $options: 'i' } },
            { service_types: { $regex: query, $options: 'i' } },
            { category: { $regex: query, $options: 'i' } }
          ]
        };

        const beautyTextQuery = {
          $or: [
            { name: { $regex: query, $options: 'i' } },
            { description: { $regex: query, $options: 'i' } },
            { tags: { $regex: query, $options: 'i' } },
            { specialties: { $regex: query, $options: 'i' } },
            { category: { $regex: query, $options: 'i' } }
          ]
        };

        const userTextQuery = {
          $or: [
            { name: { $regex: query, $options: 'i' } },
            { email: { $regex: query, $options: 'i' } },
            { username: { $regex: query, $options: 'i' } }
          ]
        };

        // Recherche dans les restaurants
        if (typesToSearch.includes('restaurants') && Producer) {
          let restaurantQuery = {};
          if (geoQuery) restaurantQuery.location = geoQuery;
          if (query) restaurantQuery = { ...restaurantQuery, ...restaurantTextQuery };

          searchPromises.push(
            Producer.find(restaurantQuery)
              .limit(parseInt(limit))
              .then(results => ({ type: 'restaurants', data: results }))
              .catch(error => {
                console.error('❌ Erreur dans la recherche de restaurants:', error);
                return { type: 'restaurants', data: [] };
              })
          );
        }

        // Recherche dans les lieux de loisirs
        if (typesToSearch.includes('leisurePlaces') && LeisureProducer) {
          let leisurePlaceQuery = {};
          if (geoQuery) leisurePlaceQuery.localisation = geoQuery;
          if (query) leisurePlaceQuery = { ...leisurePlaceQuery, ...leisurePlaceTextQuery };

          searchPromises.push(
            LeisureProducer.find(leisurePlaceQuery)
              .limit(parseInt(limit))
              .then(results => ({ type: 'leisurePlaces', data: results }))
              .catch(error => {
                console.error('❌ Erreur dans la recherche de lieux de loisirs:', error);
                return { type: 'leisurePlaces', data: [] };
              })
          );
        }

        // Recherche dans les événements de loisirs
        if (typesToSearch.includes('leisureEvents') && LeisureEvent) {
          let leisureEventQuery = {};
          if (geoQuery) leisureEventQuery.localisation = geoQuery;
          if (query) leisureEventQuery = { ...leisureEventQuery, ...leisureEventTextQuery };

          searchPromises.push(
            LeisureEvent.find(leisureEventQuery)
              .limit(parseInt(limit))
              .then(results => ({ type: 'leisureEvents', data: results }))
              .catch(error => {
                console.error('❌ Erreur dans la recherche d\'événements de loisirs:', error);
                return { type: 'leisureEvents', data: [] };
              })
          );
        }

        // Recherche dans les établissements de bien-être
        if (typesToSearch.includes('wellnessPlaces') && WellnessPlace) {
          let wellnessQuery = {};
          if (geoQuery) wellnessQuery.location = geoQuery;
          if (query) wellnessQuery = { ...wellnessQuery, ...wellnessTextQuery };

          searchPromises.push(
            WellnessPlace.find(wellnessQuery)
              .limit(parseInt(limit))
              .then(results => ({ type: 'wellnessPlaces', data: results }))
              .catch(error => {
                console.error('❌ Erreur dans la recherche d\'établissements de bien-être:', error);
                return { type: 'wellnessPlaces', data: [] };
              })
          );
        }

        // Recherche dans les établissements de beauté
        if (typesToSearch.includes('beautyPlaces') && BeautyPlace) {
          let beautyQuery = {};
          if (geoQuery) beautyQuery.location = geoQuery;
          if (query) beautyQuery = { ...beautyQuery, ...beautyTextQuery };

          searchPromises.push(
            BeautyPlace.find(beautyQuery)
              .limit(parseInt(limit))
              .then(results => ({ type: 'beautyPlaces', data: results }))
              .catch(error => {
                console.error('❌ Erreur dans la recherche d\'établissements de beauté:', error);
                return { type: 'beautyPlaces', data: [] };
              })
          );
        }

        // Recherche dans les utilisateurs
        if (typesToSearch.includes('users') && User) {
          let userQuery = { ...userTextQuery };

          searchPromises.push(
            User.find(userQuery)
              .select('_id name username email profilePicture')
              .limit(parseInt(limit))
              .then(results => ({ type: 'users', data: results }))
              .catch(error => {
                console.error('❌ Erreur dans la recherche d\'utilisateurs:', error);
                return { type: 'users', data: [] };
              })
          );
        }
      }

      // Attendre toutes les recherches et construire le résultat
      const searchResults = await Promise.all(searchPromises);
      
      // Formatage des résultats
      searchResults.forEach(result => {
        results[result.type] = result.data;
      });

      res.status(200).json(results);
    } catch (error) {
      console.error('❌ Erreur générale dans globalSearch:', error);
      res.status(500).json({ message: 'Erreur lors de la recherche globale', error: error.message });
    }
  },

  /**
   * Recherche spécifique aux restaurants
   */
  searchRestaurants: async (req, res) => {
    try {
      const { q, category, tags, lat, lng, radius, page = 1, limit = 20 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Construire la requête de recherche
      const searchQuery = {};

      // Recherche textuelle si query est fournie
      if (q) {
        searchQuery.$or = [
          { name: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } },
          { tags: { $regex: q, $options: 'i' } },
          { category: { $regex: q, $options: 'i' } }
        ];
      }

      // Filtres supplémentaires
      if (category) searchQuery.category = category;
      if (tags) searchQuery.tags = { $in: tags.split(',') };

      // Recherche géospatiale si lat et lng sont fournis
      if (lat && lng) {
        searchQuery.location = {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: [parseFloat(lng), parseFloat(lat)]
            },
            $maxDistance: parseInt(radius) || 5000
          }
        };
      }

      // Exécuter la recherche
      const restaurants = await Producer.find(searchQuery)
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ rating: -1 });

      const totalRestaurants = await Producer.countDocuments(searchQuery);

      res.status(200).json({
        restaurants,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalRestaurants / parseInt(limit)),
          totalItems: totalRestaurants,
          hasNextPage: parseInt(page) < Math.ceil(totalRestaurants / parseInt(limit)),
          hasPrevPage: parseInt(page) > 1
        }
      });
    } catch (error) {
      console.error('❌ Erreur dans searchRestaurants:', error);
      res.status(500).json({ message: 'Erreur lors de la recherche de restaurants', error: error.message });
    }
  },

  /**
   * Recherche spécifique aux lieux de loisirs
   */
  searchLeisurePlaces: async (req, res) => {
    try {
      const { q, category, tags, lat, lng, radius, page = 1, limit = 20 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Construire la requête de recherche
      const searchQuery = {};

      // Recherche textuelle si query est fournie
      if (q) {
        searchQuery.$or = [
          { lieu: { $regex: q, $options: 'i' } },
          { adresse: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } },
          { catégorie: { $regex: q, $options: 'i' } }
        ];
      }

      // Filtres supplémentaires
      if (category) searchQuery.catégorie = category;
      if (tags) searchQuery.tags = { $in: tags.split(',') };

      // Recherche géospatiale si lat et lng sont fournis
      if (lat && lng) {
        searchQuery.localisation = {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: [parseFloat(lng), parseFloat(lat)]
            },
            $maxDistance: parseInt(radius) || 5000
          }
        };
      }

      // Exécuter la recherche
      const leisurePlaces = await LeisureProducer.find(searchQuery)
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ note: -1 });

      const totalPlaces = await LeisureProducer.countDocuments(searchQuery);

      res.status(200).json({
        leisurePlaces,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalPlaces / parseInt(limit)),
          totalItems: totalPlaces,
          hasNextPage: parseInt(page) < Math.ceil(totalPlaces / parseInt(limit)),
          hasPrevPage: parseInt(page) > 1
        }
      });
    } catch (error) {
      console.error('❌ Erreur dans searchLeisurePlaces:', error);
      res.status(500).json({ message: 'Erreur lors de la recherche de lieux de loisirs', error: error.message });
    }
  },

  /**
   * Recherche spécifique aux événements de loisirs
   */
  searchLeisureEvents: async (req, res) => {
    try {
      const { q, category, tags, emotions, dateStart, dateEnd, lat, lng, radius, page = 1, limit = 20 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Construire la requête de recherche
      const searchQuery = {};

      // Recherche textuelle si query est fournie
      if (q) {
        searchQuery.$or = [
          { intitulé: { $regex: q, $options: 'i' } },
          { lieu: { $regex: q, $options: 'i' } },
          { adresse: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } },
          { catégorie: { $regex: q, $options: 'i' } }
        ];
      }

      // Filtres supplémentaires
      if (category) searchQuery.catégorie = category;
      if (tags) searchQuery.tags = { $in: tags.split(',') };
      if (emotions) searchQuery.émotions = { $in: emotions.split(',') };

      // Filtre de date
      if (dateStart || dateEnd) {
        searchQuery.date = {};
        if (dateStart) searchQuery.date.$gte = new Date(dateStart);
        if (dateEnd) searchQuery.date.$lte = new Date(dateEnd);
      }

      // Recherche géospatiale si lat et lng sont fournis
      if (lat && lng) {
        searchQuery.localisation = {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: [parseFloat(lng), parseFloat(lat)]
            },
            $maxDistance: parseInt(radius) || 5000
          }
        };
      }

      // Exécuter la recherche
      const leisureEvents = await LeisureEvent.find(searchQuery)
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ date: 1 });

      const totalEvents = await LeisureEvent.countDocuments(searchQuery);

      res.status(200).json({
        leisureEvents,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalEvents / parseInt(limit)),
          totalItems: totalEvents,
          hasNextPage: parseInt(page) < Math.ceil(totalEvents / parseInt(limit)),
          hasPrevPage: parseInt(page) > 1
        }
      });
    } catch (error) {
      console.error('❌ Erreur dans searchLeisureEvents:', error);
      res.status(500).json({ message: 'Erreur lors de la recherche d\'événements de loisirs', error: error.message });
    }
  },

  /**
   * Recherche spécifique aux établissements de bien-être
   */
  searchWellnessPlaces: async (req, res) => {
    try {
      const { q, category, tags, serviceTypes, benefits, lat, lng, radius, page = 1, limit = 20 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Construire la requête de recherche
      const searchQuery = {};

      // Recherche textuelle si query est fournie
      if (q) {
        searchQuery.$or = [
          { name: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } },
          { tags: { $regex: q, $options: 'i' } },
          { service_types: { $regex: q, $options: 'i' } },
          { benefits: { $regex: q, $options: 'i' } },
          { category: { $regex: q, $options: 'i' } }
        ];
      }

      // Filtres supplémentaires
      if (category) searchQuery.category = category;
      if (tags) searchQuery.tags = { $in: tags.split(',') };
      if (serviceTypes) searchQuery.service_types = { $in: serviceTypes.split(',') };
      if (benefits) searchQuery.benefits = { $in: benefits.split(',') };

      // Recherche géospatiale si lat et lng sont fournis
      if (lat && lng) {
        searchQuery.location = {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: [parseFloat(lng), parseFloat(lat)]
            },
            $maxDistance: parseInt(radius) || 5000
          }
        };
      }

      // Exécuter la recherche
      const wellnessPlaces = await WellnessPlace.find(searchQuery)
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ rating: -1 });

      const totalPlaces = await WellnessPlace.countDocuments(searchQuery);

      res.status(200).json({
        wellnessPlaces,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalPlaces / parseInt(limit)),
          totalItems: totalPlaces,
          hasNextPage: parseInt(page) < Math.ceil(totalPlaces / parseInt(limit)),
          hasPrevPage: parseInt(page) > 1
        }
      });
    } catch (error) {
      console.error('❌ Erreur dans searchWellnessPlaces:', error);
      res.status(500).json({ message: 'Erreur lors de la recherche d\'établissements de bien-être', error: error.message });
    }
  },

  /**
   * Recherche spécifique aux utilisateurs
   */
  searchUsers: async (req, res) => {
    try {
      const { q, page = 1, limit = 20 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      if (!q) {
        return res.status(400).json({ message: 'Un terme de recherche est requis' });
      }

      // Construire la requête de recherche
      const searchQuery = {
        $or: [
          { name: { $regex: q, $options: 'i' } },
          { email: { $regex: q, $options: 'i' } },
          { username: { $regex: q, $options: 'i' } }
        ]
      };

      // Exécuter la recherche
      const users = await UserChoice.find(searchQuery)
        .skip(skip)
        .limit(parseInt(limit));

      const totalUsers = await UserChoice.countDocuments(searchQuery);

      res.status(200).json({
        users,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalUsers / parseInt(limit)),
          totalItems: totalUsers,
          hasNextPage: parseInt(page) < Math.ceil(totalUsers / parseInt(limit)),
          hasPrevPage: parseInt(page) > 1
        }
      });
    } catch (error) {
      console.error('❌ Erreur dans searchUsers:', error);
      res.status(500).json({ message: 'Erreur lors de la recherche d\'utilisateurs', error: error.message });
    }
  },

  /**
   * Recherche d'entités à proximité (tous types)
   */
  searchNearby: async (req, res) => {
    try {
      const { lat, lng, radius = 5000, types = [], limit = 20 } = req.query;

      if (!lat || !lng) {
        return res.status(400).json({ message: 'Les coordonnées (lat, lng) sont requises' });
      }

      // Déterminer quels types de résultats rechercher
      let typesToSearch = types.length ? types.split(',') : ['restaurants', 'leisurePlaces', 'leisureEvents', 'wellnessPlaces', 'beautyPlaces'];

      // Initialiser les résultats
      let results = {
        restaurants: [],
        leisurePlaces: [],
        leisureEvents: [],
        wellnessPlaces: [],
        beautyPlaces: []
      };

      // Créer les promesses pour chaque type de recherche
      const searchPromises = [];

      // Recherche dans les restaurants
      if (typesToSearch.includes('restaurants')) {
        searchPromises.push(
          Producer.find({
            location: {
              $nearSphere: {
                $geometry: {
                  type: "Point",
                  coordinates: [parseFloat(lng), parseFloat(lat)]
                },
                $maxDistance: parseInt(radius)
              }
            }
          })
            .limit(parseInt(limit))
            .then(restaurants => ({ type: 'restaurants', data: restaurants }))
            .catch(error => {
              console.error('❌ Erreur dans la recherche de restaurants à proximité:', error);
              return { type: 'restaurants', data: [] };
            })
        );
      }

      // Recherche dans les lieux de loisirs
      if (typesToSearch.includes('leisurePlaces')) {
        searchPromises.push(
          LeisureProducer.find({
            localisation: {
              $nearSphere: {
                $geometry: {
                  type: "Point",
                  coordinates: [parseFloat(lng), parseFloat(lat)]
                },
                $maxDistance: parseInt(radius)
              }
            }
          })
            .limit(parseInt(limit))
            .then(leisurePlaces => ({ type: 'leisurePlaces', data: leisurePlaces }))
            .catch(error => {
              console.error('❌ Erreur dans la recherche de lieux de loisirs à proximité:', error);
              return { type: 'leisurePlaces', data: [] };
            })
        );
      }

      // Recherche dans les événements de loisirs
      if (typesToSearch.includes('leisureEvents')) {
        searchPromises.push(
          LeisureEvent.find({
            localisation: {
              $nearSphere: {
                $geometry: {
                  type: "Point",
                  coordinates: [parseFloat(lng), parseFloat(lat)]
                },
                $maxDistance: parseInt(radius)
              }
            }
          })
            .limit(parseInt(limit))
            .then(leisureEvents => ({ type: 'leisureEvents', data: leisureEvents }))
            .catch(error => {
              console.error('❌ Erreur dans la recherche d\'événements de loisirs à proximité:', error);
              return { type: 'leisureEvents', data: [] };
            })
        );
      }

      // Recherche dans les établissements de bien-être
      if (typesToSearch.includes('wellnessPlaces')) {
        searchPromises.push(
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
          })
            .limit(parseInt(limit))
            .then(wellnessPlaces => ({ type: 'wellnessPlaces', data: wellnessPlaces }))
            .catch(error => {
              console.error('❌ Erreur dans la recherche d\'établissements de bien-être à proximité:', error);
              return { type: 'wellnessPlaces', data: [] };
            })
        );
      }

      // Recherche dans les établissements de beauté
      if (typesToSearch.includes('beautyPlaces')) {
        searchPromises.push(
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
          })
            .limit(parseInt(limit))
            .then(beautyPlaces => ({ type: 'beautyPlaces', data: beautyPlaces }))
            .catch(error => {
              console.error('❌ Erreur dans la recherche d\'établissements de beauté à proximité:', error);
              return { type: 'beautyPlaces', data: [] };
            })
        );
      }

      // Attendre que toutes les requêtes soient terminées
      const searchResults = await Promise.all(searchPromises);

      // Organiser les résultats par type
      searchResults.forEach(result => {
        results[result.type] = result.data;
      });

      // Retourner les résultats
      res.status(200).json(results);
    } catch (error) {
      console.error('❌ Erreur dans searchNearby:', error);
      res.status(500).json({ message: 'Erreur lors de la recherche de lieux à proximité', error: error.message });
    }
  },

  /**
   * Obtenir les recherches tendances
   */
  getTrendingSearches: async (req, res) => {
    try {
      // Cette fonctionnalité dépend d'une collection pour stocker les recherches populaires
      // Pour l'instant, on renvoie des données statiques
      const trending = [
        { term: 'restaurant', count: 120 },
        { term: 'spa', count: 95 },
        { term: 'yoga', count: 88 },
        { term: 'concert', count: 75 },
        { term: 'massage', count: 68 },
        { term: 'exposition', count: 62 },
        { term: 'théatre', count: 54 },
        { term: 'bien-être', count: 45 },
        { term: 'italien', count: 42 },
        { term: 'festival', count: 38 }
      ];

      res.status(200).json(trending);
    } catch (error) {
      console.error('❌ Erreur dans getTrendingSearches:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des recherches tendances', error: error.message });
    }
  }
};

module.exports = searchController; 