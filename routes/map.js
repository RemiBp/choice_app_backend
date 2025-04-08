const express = require('express');
const router = express.Router();
const mapController = require('../controllers/mapController');

/**
 * Routes pour les fonctionnalités cartographiques
 */

// GET /api/map/markers - Obtenir tous les marqueurs pour la carte
router.get('/markers', mapController.getAllMarkers);

// GET /api/map/restaurants - Obtenir les restaurants pour la carte
router.get('/restaurants', mapController.getRestaurantsForMap);

// GET /api/map/leisure/venues - Obtenir les lieux de loisirs pour la carte
router.get('/leisure/venues', mapController.getLeisureVenuesForMap);

// GET /api/map/leisure/events - Obtenir les événements de loisirs pour la carte
router.get('/leisure/events', mapController.getLeisureEventsForMap);

// GET /api/map/wellness - Obtenir les établissements de bien-être pour la carte
router.get('/wellness', mapController.getWellnessPlacesForMap);

// GET /api/map/friends - Obtenir les amis et leurs activités pour la carte
router.get('/friends', mapController.getFriendsForMap);

// POST /api/map/restaurants/search - Rechercher des restaurants sur la carte
router.post('/restaurants/search', mapController.searchRestaurantsOnMap);

// POST /api/map/leisure/venues/search - Rechercher des lieux de loisirs sur la carte
router.post('/leisure/venues/search', mapController.searchLeisureVenuesOnMap);

// POST /api/map/leisure/events/search - Rechercher des événements de loisirs sur la carte
router.post('/leisure/events/search', mapController.searchLeisureEventsOnMap);

// POST /api/map/wellness/search - Rechercher des établissements de bien-être sur la carte
router.post('/wellness/search', mapController.searchWellnessPlacesOnMap);

// POST /api/map/friends/search - Rechercher des activités d'amis sur la carte
router.post('/friends/search', mapController.searchFriendsActivitiesOnMap);

/**
 * @route GET /api/map/restaurants/nearby
 * @desc Obtenir les restaurants à proximité avec des filtres avancés
 * @access Public
 */
router.get('/restaurants/nearby', async (req, res) => {
  try {
    const { 
      lat, 
      lng, 
      radius = 5000, 
      categories, 
      minRating, 
      minPrice, 
      maxPrice, 
      keyword,
      openNow,
      minServiceRating,
      minLocationRating,
      minPortionRating,
      minAmbianceRating,
      choice,
      minFavorites,
      minCalories,
      maxCalories,
      maxCarbonFootprint,
      minItemRating
    } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({ message: 'Les coordonnées (lat, lng) sont requises' });
    }
    
    console.log(`🗺️ Recherche de restaurants à proximité: ${lat}, ${lng}, rayon: ${radius}m`);
    
    // Conversion des coordonnées
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    
    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({ message: 'Coordonnées invalides' });
    }
    
    // Construire la requête géographique pour MongoDB
    const geoQuery = {
      gps_coordinates: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [longitude, latitude]
          },
          $maxDistance: parseInt(radius)
        }
      }
    };
    
    // Ajout des filtres de catégorie si spécifiés
    if (categories) {
      const categoryList = Array.isArray(categories) 
        ? categories 
        : categories.split(',');
        
      geoQuery.category = { $in: categoryList };
    }
    
    // Filtre sur la note minimale
    if (minRating) {
      geoQuery.rating = { $gte: parseFloat(minRating) };
    }
    
    // Filtres sur la fourchette de prix
    if (minPrice || maxPrice) {
      geoQuery.price_level = {};
      
      if (minPrice) {
        geoQuery.price_level.$gte = parseInt(minPrice);
      }
      
      if (maxPrice) {
        geoQuery.price_level.$lte = parseInt(maxPrice);
      }
    }
    
    // Recherche par mot-clé
    if (keyword) {
      geoQuery.$or = [
        { name: { $regex: keyword, $options: 'i' } },
        { description: { $regex: keyword, $options: 'i' } },
        { menu_items: { $elemMatch: { name: { $regex: keyword, $options: 'i' } } } }
      ];
    }
    
    // Option d'ouverture en ce moment
    if (openNow === 'true') {
      // Logique pour vérifier si le restaurant est ouvert maintenant
      // (Cette logique dépend de la structure de vos données)
      const now = new Date();
      const day = now.getDay(); // 0 = dimanche, 1 = lundi, etc.
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const time = hours * 60 + minutes; // temps en minutes depuis minuit
      
      geoQuery.opening_hours = {
        $elemMatch: {
          day: day,
          open: { $lte: time },
          close: { $gte: time }
        }
      };
    }
    
    // Filtres sur les notes spécifiques
    if (minServiceRating) {
      geoQuery['ratings.service'] = { $gte: parseFloat(minServiceRating) };
    }
    
    if (minLocationRating) {
      geoQuery['ratings.location'] = { $gte: parseFloat(minLocationRating) };
    }
    
    if (minPortionRating) {
      geoQuery['ratings.portion'] = { $gte: parseFloat(minPortionRating) };
    }
    
    if (minAmbianceRating) {
      geoQuery['ratings.ambiance'] = { $gte: parseFloat(minAmbianceRating) };
    }
    
    // Filtre sur le choix (choix populaire, coup de cœur, etc.)
    if (choice) {
      geoQuery.choice_type = choice;
    }
    
    // Filtre sur le nombre minimum de favoris
    if (minFavorites) {
      geoQuery.favorites_count = { $gte: parseInt(minFavorites) };
    }
    
    // Recherche dans les items du menu si des filtres spécifiques sont appliqués
    if (minCalories || maxCalories || maxCarbonFootprint || minItemRating) {
      let itemFilters = {};
      
      if (minCalories) {
        itemFilters.calories = { $gte: parseInt(minCalories) };
      }
      
      if (maxCalories) {
        itemFilters.calories = { ...itemFilters.calories, $lte: parseInt(maxCalories) };
      }
      
      if (maxCarbonFootprint) {
        itemFilters.carbon_footprint = { $lte: parseFloat(maxCarbonFootprint) };
      }
      
      if (minItemRating) {
        itemFilters.rating = { $gte: parseFloat(minItemRating) };
      }
      
      geoQuery.menu_items = { $elemMatch: itemFilters };
    }
    
    console.log('🔍 Requête de recherche:', JSON.stringify(geoQuery, null, 2));
    
    // Exécuter la requête
    const restaurants = await mapController.getRestaurantsWithGeoQuery(geoQuery);
    
    console.log(`📍 ${restaurants.length} restaurants trouvés dans un rayon de ${radius}m`);
    
    res.status(200).json({
      success: true,
      count: restaurants.length,
      data: restaurants
    });
  } catch (error) {
    console.error('❌ Erreur lors de la recherche de restaurants:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route GET /api/geocode
 * @desc Convertir des coordonnées GPS en adresse lisible (geocoding inversé)
 * @access Public
 */
router.get('/geocode', async (req, res) => {
  try {
    const { lat, lng } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({ 
        success: false,
        message: 'Les paramètres lat et lng sont requis' 
      });
    }
    
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    
    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({ 
        success: false,
        message: 'Coordonnées invalides' 
      });
    }
    
    // Utiliser l'API Google Maps pour le géocodage inversé
    const API_KEY = process.env.GOOGLE_MAPS_API_KEY || 'your_google_maps_api_key';
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${API_KEY}`;
    
    try {
      // Faire la requête HTTP à l'API Google
      const axios = require('axios');
      const response = await axios.get(url);
      
      if (response.data.status === 'OK' && response.data.results.length > 0) {
        // Récupérer la première adresse formatée
        const address = response.data.results[0].formatted_address;
        
        return res.status(200).json({
          success: true,
          address: address,
          coordinates: {
            latitude: latitude,
            longitude: longitude
          }
        });
      } else {
        return res.status(404).json({
          success: false,
          message: 'Adresse non trouvée pour ces coordonnées',
          error: response.data.status
        });
      }
    } catch (apiError) {
      console.error('❌ Erreur API Google Maps:', apiError);
      
      // Fournir une réponse de repli si l'API échoue
      return res.status(200).json({
        success: true,
        address: `Coordonnées: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
        coordinates: {
          latitude: latitude,
          longitude: longitude
        },
        note: 'Format de secours - échec de l\'API de géocodage'
      });
    }
  } catch (error) {
    console.error('❌ Erreur lors du géocodage inversé:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur serveur lors du géocodage inversé', 
      error: error.message 
    });
  }
});

module.exports = router; 