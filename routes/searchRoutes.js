const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');
const mongoose = require('mongoose');
const { createModel, databases } = require('../utils/modelCreator');

// Initialiser les modèles directement avec notre utilitaire
const User = createModel(
  databases.CHOICE_APP,
  'User',
  'Users'
);

const Producer = createModel(
  databases.RESTAURATION,
  'Producer',
  'Producers'
);

const LeisureProducer = createModel(
  databases.LOISIR,
  'LeisureProducer',
  'LeisureProducers'
);

const BeautyProducer = createModel(
  databases.BEAUTY_WELLNESS,
  'BeautyProducer',
  'BeautyProducers'
);

const Event = createModel(
  databases.LOISIR,
  'Event',
  'Events'
);

const Post = createModel(
  databases.CHOICE_APP,
  'Post',
  'Posts'
);

/**
 * Routes pour la recherche unifiée
 */

// POST /api/search - Effectuer une recherche globale
router.post('/', searchController.search);

// GET /api/search/restaurants - Rechercher des restaurants
router.get('/restaurants', searchController.searchRestaurants);

// GET /api/search/leisure/places - Rechercher des lieux de loisirs
router.get('/leisure/places', searchController.searchLeisurePlaces);

// GET /api/search/leisure/events - Rechercher des événements de loisirs
router.get('/leisure/events', searchController.searchLeisureEvents);

// GET /api/search/wellness - Rechercher des établissements de bien-être
router.get('/wellness', searchController.searchWellnessPlaces);

// GET /api/search/users - Rechercher des utilisateurs
router.get('/users', searchController.searchUsers);

// GET /api/search/nearby - Rechercher des lieux à proximité (tous types)
router.get('/nearby', searchController.searchNearby);

// GET /api/search/trending - Obtenir les recherches tendances
router.get('/trending', searchController.getTrendingSearches);

// Middleware d'authentification (à importer si nécessaire)
const auth = async (req, res, next) => {
  // Votre logique d'authentification ici
  next();
};

// GET /api/search - Recherche unifiée dans toutes les collections
router.get('/', async (req, res) => {
  try {
    const { query, type, limit = 10, location } = req.query;
    
    if (!query && !location) {
      return res.status(400).json({ error: 'Un critère de recherche est requis (query ou location)' });
    }
    
    const searchLimit = parseInt(limit);
    const results = {};
    
    // Préparation des filtres de recherche basés sur location si fournie
    const locationFilter = {};
    if (location && location.lat && location.lng && location.radius) {
      const lat = parseFloat(location.lat);
      const lng = parseFloat(location.lng);
      const radius = parseInt(location.radius);
      
      if (!isNaN(lat) && !isNaN(lng) && !isNaN(radius)) {
        locationFilter.gpsFilter = {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [lng, lat]
            },
            $maxDistance: radius
          }
        };
      }
    }
    
    // Fonction pour construire les filtres de texte
    const buildTextFilter = (queryText) => {
      return { $regex: queryText, $options: 'i' };
    };
    
    // Si aucun type spécifique n'est demandé ou si "users" est demandé
    if (!type || type === 'users' || type === 'all') {
      const userFilter = query ? {
        $or: [
          { name: buildTextFilter(query) },
          { username: buildTextFilter(query) },
          { email: buildTextFilter(query) }
        ]
      } : {};
      
      const users = await User.find(userFilter)
        .select('_id name username profilePicture bio')
        .limit(searchLimit);
      
      results.users = users;
    }
    
    // Si aucun type spécifique n'est demandé ou si "restaurants" est demandé
    if (!type || type === 'restaurants' || type === 'all') {
      const restaurantTextFilter = query ? {
        $or: [
          { name: buildTextFilter(query) },
          { category: buildTextFilter(query) },
          { description: buildTextFilter(query) }
        ]
      } : {};
      
      const restaurantQuery = { ...restaurantTextFilter };
      
      // Ajouter le filtre de localisation si présent
      if (locationFilter.gpsFilter) {
        restaurantQuery.gps_coordinates = locationFilter.gpsFilter;
      }
      
      const restaurants = await Producer.find(restaurantQuery)
        .select('_id name photo address category rating price_level description')
        .limit(searchLimit);
      
      results.restaurants = restaurants;
    }
    
    // Si aucun type spécifique n'est demandé ou si "leisure" est demandé
    if (!type || type === 'leisure' || type === 'all') {
      const leisureTextFilter = query ? {
        $or: [
          { lieu: buildTextFilter(query) },
          { name: buildTextFilter(query) },
          { catégorie: buildTextFilter(query) },
          { category: buildTextFilter(query) },
          { description: buildTextFilter(query) }
        ]
      } : {};
      
      const leisureQuery = { ...leisureTextFilter };
      
      // Ajouter les filtres de localisation si présents
      if (locationFilter.gpsFilter) {
        leisureQuery.$or = leisureQuery.$or || [];
        leisureQuery.$or.push(
          { localisation: locationFilter.gpsFilter },
          { location: locationFilter.gpsFilter },
          { gps_coordinates: locationFilter.gpsFilter }
        );
      }
      
      const leisurePlaces = await LeisureProducer.find(leisureQuery)
        .select('_id lieu name photo adresse address catégorie category description')
        .limit(searchLimit);
      
      results.leisure = leisurePlaces;
    }
    
    // Si aucun type spécifique n'est demandé ou si "beauty" est demandé
    if (!type || type === 'beauty' || type === 'wellness' || type === 'all') {
      const beautyTextFilter = query ? {
        $or: [
          { name: buildTextFilter(query) },
          { category: buildTextFilter(query) },
          { description: buildTextFilter(query) },
          { service_type: buildTextFilter(query) },
          { specialties: buildTextFilter(query) }
        ]
      } : {};
      
      const beautyQuery = { ...beautyTextFilter };
      
      // Ajouter le filtre de localisation si présent
      if (locationFilter.gpsFilter) {
        beautyQuery.gps_coordinates = locationFilter.gpsFilter;
      }
      
      const beautyPlaces = await BeautyProducer.find(beautyQuery)
        .select('_id name photo address category rating price_level description service_type')
        .limit(searchLimit);
      
      results.beauty = beautyPlaces;
    }
    
    // Si aucun type spécifique n'est demandé ou si "events" est demandé
    if (!type || type === 'events' || type === 'all') {
      const eventTextFilter = query ? {
        $or: [
          { intitulé: buildTextFilter(query) },
          { title: buildTextFilter(query) },
          { name: buildTextFilter(query) },
          { catégorie: buildTextFilter(query) },
          { category: buildTextFilter(query) },
          { description: buildTextFilter(query) },
          { détail: buildTextFilter(query) }
        ]
      } : {};
      
      const eventQuery = { ...eventTextFilter };
      
      // Ajouter le filtre de localisation si présent
      if (locationFilter.gpsFilter) {
        eventQuery.$or = eventQuery.$or || [];
        eventQuery.$or.push(
          { localisation: locationFilter.gpsFilter },
          { location: locationFilter.gpsFilter },
          { gps_coordinates: locationFilter.gpsFilter }
        );
      }
      
      const events = await Event.find(eventQuery)
        .select('_id intitulé title détail detail type date lieu name localisation location')
        .limit(searchLimit);
      
      results.events = events;
    }
    
    // Si aucun type spécifique n'est demandé ou si "posts" est demandé
    if (!type || type === 'posts' || type === 'all') {
      const postTextFilter = query ? {
        $or: [
          { text: buildTextFilter(query) },
          { content: buildTextFilter(query) },
          { title: buildTextFilter(query) },
          { tags: buildTextFilter(query) }
        ]
      } : {};
      
      const posts = await Post.find(postTextFilter)
        .select('_id content text title userId createdAt media tags')
        .limit(searchLimit);
      
      results.posts = posts;
    }
    
    res.status(200).json(results);
  } catch (error) {
    console.error('❌ Erreur lors de la recherche unifiée:', error);
    res.status(500).json({ error: 'Erreur lors de la recherche', details: error.message });
  }
});

module.exports = router;
