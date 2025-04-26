const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Conversation = require('../models/conversation');
const producerController = require('../controllers/producerController');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const getInteractionModel = require('../models/Interaction');
const { getModel } = require('../models');

/**
 * IMPORTANT: L'ordre des routes est crucial!
 * Les routes spécifiques comme "/advanced-search" doivent être définies AVANT
 * les routes génériques avec paramètres comme "/:id" pour éviter les conflits.
 * Express lit les routes de haut en bas et utilise la première qui correspond.
 */

// Middleware d'authentification (à importer si nécessaire)
const auth = async (req, res, next) => {
  // Votre logique d'authentification ici
  next();
};

/**
 * Routes pour les producteurs (restaurants)
 */

// Placer en premier la route de recherche avancée pour éviter les conflits
/**
 * @route   GET /api/producers/advanced-search
 * @desc    Recherche avancée de restaurants avec filtres multiples
 * @access  Public
 */
router.get('/advanced-search', async (req, res) => {
  const ProducerModel = getModel('Producer');
  if (!ProducerModel) return res.status(500).json({ success: false, message: 'Producer model not initialized.'});
  try {
    // Vérifier si les index géospatiaux sont disponibles
    let hasGeoIndexes = false;
    try {
      const indexes = await ProducerModel.collection.indexes();
      hasGeoIndexes = indexes.some(index => 
        index.key && (
          (index.key['gps_coordinates'] === '2dsphere') || 
          (index.key['geometry.location'] === '2dsphere')
        )
      );
      console.log(`ℹ️ Index géospatiaux disponibles: ${hasGeoIndexes}`);
    } catch (indexError) {
      console.error(`⚠️ Erreur lors de la vérification des index: ${indexError.message}`);
    }
    
    // Paramètres de pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // Récupération de tous les paramètres de filtrage
    const {
      // Coordonnées géographiques
      lat,                 // Latitude
      lng,                 // Longitude
      radius,              // Rayon de recherche en mètres
      
      // Filtres pour restaurants
      searchKeyword,       // Recherche textuelle (nom, description)
      cuisine_type,        // Type de cuisine
      specialties,         // Spécialités
      business_status,     // Statut du business
      min_followers,       // Popularité minimale (abonnés)
      promotion_active,    // Promotions actives (boolean)
      min_promotion,       // Pourcentage minimum de réduction
      min_rating,          // Note minimale
      max_price_level,     // Niveau de prix maximum
      minPrice,            // Prix minimum
      maxPrice,            // Prix maximum
      
      // Filtres pour items (plats/menus)
      itemKeywords,        // Recherche dans les noms/descriptions d'items
      min_calories,        // Calories minimum
      max_calories,        // Calories maximum
      max_carbon_footprint,// Bilan carbone maximum
      nutri_scores,        // Nutri-scores (A,B,C,D,E)
      min_item_rating,     // Note minimale d'un plat
      max_item_price       // Prix maximum d'un plat
    } = req.query;
    
    // Tableau pour stocker toutes les conditions de filtrage
    const queryConditions = [];
    
    // Filtre géographique si les coordonnées sont fournies
    if (lat && lng && radius) {
      // Convertir les paramètres en nombres
      const latitude = parseFloat(lat);
      const longitude = parseFloat(lng);
      const searchRadius = parseInt(radius);
      
      // Vérifier si les coordonnées sont valides
      if (!isNaN(latitude) && !isNaN(longitude) && !isNaN(searchRadius)) {
        console.log(`🌍 Recherche géospatiale: lat=${latitude}, lng=${longitude}, radius=${searchRadius}m`);
        
        // Déterminer les critères géographiques à utiliser (avec gestion des erreurs)
        let geoQueryApplied = false;
        
        // N'essayer les requêtes géospatiales que si nous avons des index
        if (hasGeoIndexes) {
          // Essayer d'abord avec gps_coordinates
          try {
            const testQuery = {
              gps_coordinates: {
                $geoWithin: {
                  $centerSphere: [
                    [longitude, latitude],
                    searchRadius / 6371000  // Convertir en radians (rayon de la Terre = 6371km)
                  ]
                }
              }
            };
            
            // Tester si la requête est valide en exécutant une requête limitée à 1 résultat
            const testResult = await ProducerModel.find(testQuery).limit(1);
            console.log(`✅ Test avec gps_coordinates réussi`);
            
            // Si aucune erreur n'est levée, ajouter la condition à la requête
            queryConditions.push(testQuery);
            geoQueryApplied = true;
          } catch (gpsError) {
            console.error(`⚠️ Erreur avec gps_coordinates: ${gpsError.message}`);
            
            // Essayer avec geometry.location
            try {
              const geometryQuery = {
                "geometry.location": {
                  $geoWithin: {
                    $centerSphere: [
                      [longitude, latitude],
                      searchRadius / 6371000  // Convertir en radians
                    ]
                  }
                }
              };
              
              // Tester cette approche
              const geometryTest = await ProducerModel.find(geometryQuery).limit(1);
              console.log(`✅ Test avec geometry.location réussi`);
              
              queryConditions.push(geometryQuery);
              geoQueryApplied = true;
            } catch (geometryError) {
              console.error(`⚠️ Erreur avec geometry.location: ${geometryError.message}`);
            }
          }
        } else {
          console.log(`⚠️ Aucun index géospatial disponible, utilisation du fallback uniquement`);
        }
        
        // Si aucune des requêtes géospatiales n'a fonctionné, utiliser un fallback
        if (!geoQueryApplied) {
          console.log(`ℹ️ Utilisation du fallback non-géospatial (zone approximative)`);
          
          // Fallback sur une boîte géographique approximative
          // Utiliser une boîte plus petite pour une meilleure précision
          const boxSize = 0.05; // environ 5km à cette latitude
          queryConditions.push({
            $or: [
              {
                $and: [
                  { 'geometry.location.lat': { $gte: latitude - boxSize, $lte: latitude + boxSize } },
                  { 'geometry.location.lng': { $gte: longitude - boxSize, $lte: longitude + boxSize } }
                ]
              },
              {
                $and: [
                  { 'gps_coordinates.coordinates.1': { $gte: latitude - boxSize, $lte: latitude + boxSize } },
                  { 'gps_coordinates.coordinates.0': { $gte: longitude - boxSize, $lte: longitude + boxSize } }
                ]
              }
            ]
          });
        }
      }
    }
    
    // Filtres de base pour restaurants
    if (searchKeyword) {
      queryConditions.push({
        $or: [
          { name: { $regex: searchKeyword, $options: 'i' } },
          { description: { $regex: searchKeyword, $options: 'i' } }
        ]
      });
    }
    
    if (cuisine_type) {
      const cuisineTypes = Array.isArray(cuisine_type) 
        ? cuisine_type 
        : cuisine_type.includes(',') 
          ? cuisine_type.split(',').map(c => c.trim()) 
          : [cuisine_type];
      queryConditions.push({ cuisine_type: { $in: cuisineTypes } });
    }
    
    if (specialties) {
      const specialtiesList = Array.isArray(specialties) 
        ? specialties 
        : specialties.includes(',') 
          ? specialties.split(',').map(s => s.trim())
          : [specialties];
      queryConditions.push({ specialties: { $in: specialtiesList } });
    }
    
    if (business_status) {
      queryConditions.push({ business_status: business_status });
    }
    
    if (min_followers && !isNaN(parseInt(min_followers))) {
      queryConditions.push({ abonnés: { $gte: parseInt(min_followers) } });
    }
    
    if (promotion_active === 'true') {
      queryConditions.push({ 'promotion.active': true });
    }
    
    if (min_promotion && !isNaN(parseInt(min_promotion))) {
      queryConditions.push({ 'promotion.discountPercentage': { $gte: parseInt(min_promotion) } });
    }
    
    if (min_rating && !isNaN(parseFloat(min_rating))) {
      queryConditions.push({ rating: { $gte: parseFloat(min_rating) } });
    }
    
    if (max_price_level && !isNaN(parseInt(max_price_level))) {
      queryConditions.push({ price_level: { $lte: parseInt(max_price_level) } });
    }
    
    // Filtres de prix (pour compatiblité avec l'ancienne API)
    if (minPrice && !isNaN(parseFloat(minPrice))) {
      // Chercher dans les items avec un prix minimum
      const minPriceValue = parseFloat(minPrice);
      const minPriceConditions = [
        // Vérifier le prix au niveau des menus
        { 'structured_data.Menus Globaux.items.prix': { $gte: minPriceValue } },
        // Vérifier le prix au niveau des items indépendants
        { 'structured_data.Items Indépendants.prix': { $gte: minPriceValue } }
      ];
      
      // Also check root-level independent items
      minPriceConditions.push({ 'Items Indépendants.items.prix': { $gte: minPriceValue } });

      queryConditions.push({ $or: minPriceConditions });
    }
    
    if (maxPrice && !isNaN(parseFloat(maxPrice))) {
      // Chercher dans les items avec un prix maximum
      const maxPriceValue = parseFloat(maxPrice);
      const maxPriceConditions = [
        // Vérifier le prix au niveau des menus
        { 'structured_data.Menus Globaux.items.prix': { $lte: maxPriceValue } },
        // Vérifier le prix au niveau des items indépendants
        { 'structured_data.Items Indépendants.prix': { $lte: maxPriceValue } }
      ];
      
      // Also check root-level independent items
      maxPriceConditions.push({ 'Items Indépendants.items.prix': { $lte: maxPriceValue } });

      queryConditions.push({ $or: maxPriceConditions });
    }
    
    // Revised function to create conditions for a single item element
    const createItemElementConditions = (filters) => {
      const conditions = {};
      const { 
        itemKeywords, min_calories, max_calories, max_carbon_footprint, 
        nutri_scores, min_item_rating, max_item_price 
      } = filters;
    
      // Keyword search (name OR description)
      if (itemKeywords) {
        conditions[`$or`] = [
          { 'nom': { $regex: itemKeywords, $options: 'i' } },
          { 'description': { $regex: itemKeywords, $options: 'i' } }
        ];
      }
    
      // Nutritional filters
      if (min_calories && !isNaN(parseFloat(min_calories))) {
        conditions['nutrition.calories'] = { $gte: parseFloat(min_calories) };
      }
      if (max_calories && !isNaN(parseFloat(max_calories))) {
        conditions['nutrition.calories'] = { 
          ...(conditions['nutrition.calories'] || {}),
          $lte: parseFloat(max_calories) 
        };
      }
      if (max_carbon_footprint && !isNaN(parseFloat(max_carbon_footprint))) {
        conditions['carbon_footprint'] = { $lte: parseFloat(max_carbon_footprint) };
      }
      if (nutri_scores) {
        const scoresList = Array.isArray(nutri_scores) 
          ? nutri_scores 
          : nutri_scores.includes(',') 
            ? nutri_scores.split(',').map(s => s.trim().toUpperCase())
            : [nutri_scores.toUpperCase()];
        conditions['nutri_score'] = { $in: scoresList };
      }
    
      // Other item filters
      if (min_item_rating && !isNaN(parseFloat(min_item_rating))) {
        conditions['note'] = { $gte: parseFloat(min_item_rating) };
      }
      if (max_item_price && !isNaN(parseFloat(max_item_price))) {
        conditions['prix'] = { $lte: parseFloat(max_item_price) };
      }
      
      // Only return conditions if at least one item filter is active
      return Object.keys(conditions).length > 0 ? conditions : null;
    };
    
    // Generate the item element conditions based on query parameters
    const itemElementConditions = createItemElementConditions(req.query);
    
    // Ajouter les filtres d'items seulement s'ils existent
    if (itemElementConditions) {
      // Define all possible paths where items might exist
      const itemPathsToSearch = [
        'structured_data.Menus Globaux.inclus.items', // Nested menus
        'Menus Globaux.inclus.items',                 // Root-level menus
        'structured_data.Items Indépendants.items', // Nested independent items
        'Items Indépendants.items'                   // Root-level independent items
      ];
    
      // Create an $or condition to check $elemMatch across all paths
      const itemFilterQuery = {
        $or: itemPathsToSearch.map(path => ({
          [path]: { $elemMatch: itemElementConditions }
        }))
      };
      
      // Add this combined item filter to the main query conditions
      queryConditions.push(itemFilterQuery);
    }
    
    // Construire la requête finale
    const finalQuery = queryConditions.length > 0 ? { $and: queryConditions } : {};
    
    console.log('🔍 Requête avancée avec paramètres:', req.query);
    
    const userId = req.query.userId;
    let userFollowing = [];
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      const User = require('../models/User');
      const currentUser = await User.findById(userId).select('following').lean();
      if (currentUser) {
        userFollowing = currentUser.following || [];
        userFollowing = userFollowing.map(id => id.toString());
      }
    }
    
    // Exécuter la requête avec pagination
    const producers = await ProducerModel.find(finalQuery)
      .skip(skip)
      .limit(limit)
      .lean();
    
    const total = await ProducerModel.countDocuments(finalQuery);
    
    // Enrich results
    const enrichedResults = await Promise.all(producers.map(async (producer) => {
      let distance = null;
      let relevanceScore = 0;
      // 1. Distance
      const producerCoords = getProducerCoords(producer);
      let geoScore = 0;
      if (req.query.lat && req.query.lng && producerCoords) {
        const userLat = parseFloat(req.query.lat);
        const userLng = parseFloat(req.query.lng);
        distance = calculateDistance(userLat, userLng, producerCoords.lat, producerCoords.lng);
        // Score géographique (20% du score total)
        // 0m = 20, 5km = 0
        geoScore = Math.max(0, 1 - Math.min(distance, 5000) / 5000) * 20;
      }
      // 2. Score de correspondance aux filtres (80%)
      let filterScore = 0;
      // Exemples :
      if (req.query.min_rating && producer.rating) {
        const minRating = parseFloat(req.query.min_rating);
        if (producer.rating >= minRating) {
          // Plus la note est haute, plus le score est élevé
          filterScore += Math.min(40, (producer.rating - minRating) * 10 + 20);
        }
      }
      if (req.query.business_status === 'OPERATIONAL' && producer.business_status === 'OPERATIONAL') {
        filterScore += 10;
      }
      if (req.query.cuisine_type && producer.cuisine_type) {
        const types = req.query.cuisine_type.split(',').map(s => s.trim().toLowerCase());
        if (producer.cuisine_type.some(t => types.includes(t.toLowerCase()))) {
          filterScore += 10;
        }
      }
      // Ajoutez d'autres critères selon vos besoins...
      // Cap à 80
      filterScore = Math.min(80, filterScore);
      relevanceScore = Math.round(geoScore + filterScore);
      // 3. Fetch REAL Counts
      let totalChoices = 0;
      let totalInterests = 0;
      let followingInterestsCount = 0;
      let followingChoicesCount = 0;
      const producerIdStr = String(producer._id);
      try {
        // Count total interests for this producer (type: 'save')
        totalInterests = await getInteractionModel(choiceAppDb).countDocuments({
          producerId: producerIdStr,
          producerType: 'restaurant',
          type: 'save'
        });
      } catch (interestErr) {
        console.error(`Erreur comptage Interests pour ${producer._id}: ${interestErr.message}`);
      }
      try {
        // Count total choices for this producer (type: 'click')
        totalChoices = await getInteractionModel(choiceAppDb).countDocuments({
          producerId: producerIdStr,
          producerType: 'restaurant',
          type: 'click'
        });
      } catch (choiceErr) {
        console.error(`Erreur comptage Choices pour ${producer._id}: ${choiceErr.message}`);
      }
      // Count interests from users the current user is following
      if (userId && userFollowing.length > 0) {
        try {
          followingInterestsCount = await getInteractionModel(choiceAppDb).countDocuments({
            producerId: producerIdStr,
            producerType: 'restaurant',
            type: 'save',
            userId: { $in: userFollowing }
          });
        } catch (followingInterestErr) {
          console.error(`Erreur comptage Following Interests pour ${producer._id}: ${followingInterestErr.message}`);
        }
        try {
          followingChoicesCount = await getInteractionModel(choiceAppDb).countDocuments({
            producerId: producerIdStr,
            producerType: 'restaurant',
            type: 'click',
            userId: { $in: userFollowing }
          });
        } catch (followingChoiceErr) {
          console.error(`Erreur comptage Following Choices pour ${producer._id}: ${followingChoiceErr.message}`);
        }
      }
      return {
        ...producer,
        distance: distance !== null ? Math.round(distance) : null,
        relevanceScore,
        totalChoices,
        totalInterests,
        followingInterestsCount,
        followingChoicesCount
      };
    }));
    
    res.status(200).json({
      success: true,
      results: enrichedResults,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('❌ Erreur lors de la recherche avancée:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recherche avancée',
      error: error.message
    });
  }
});

// GET /api/producers - Obtenir tous les restaurants avec pagination
router.get('/', async (req, res) => {
  const ProducerModel = getModel('Producer');
  if (!ProducerModel) return res.status(500).send("Producer model not initialized");
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const producers = await ProducerModel.find()
      .skip(skip)
      .limit(limit);
    
    const total = await ProducerModel.countDocuments();
    
    res.status(200).json({
      producers,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Erreur de récupération des restaurants:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des restaurants' });
  }
});

// GET /api/producers/search - Rechercher des restaurants
router.get('/search', async (req, res) => {
  try {
    const { query, category, price_level, rating } = req.query;
    const searchQuery = {};
    
    if (query) {
      searchQuery.$or = [
        { name: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } }
      ];
    }
    
    if (category) {
      searchQuery.category = { $in: Array.isArray(category) ? category : [category] };
    }
    
    if (price_level) {
      searchQuery.price_level = parseInt(price_level);
    }
    
    if (rating) {
      searchQuery.rating = { $gte: parseFloat(rating) };
    }
    
    const producers = await getModel('Producer').find(searchQuery).limit(50);
    
    res.status(200).json(producers);
  } catch (error) {
    console.error('Erreur de recherche des restaurants:', error);
    res.status(500).json({ error: 'Erreur lors de la recherche des restaurants' });
  }
});

// GET /api/producers/featured - Obtenir les restaurants mis en avant
router.get('/featured', async (req, res) => {
  try {
    const featured = await getModel('Producer').find({ featured: true }).limit(10);
    res.status(200).json(featured);
  } catch (error) {
    console.error('Erreur de récupération des restaurants en vedette:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des restaurants en vedette' });
  }
});

// GET /api/producers/by-place-id/:placeId - Obtenir un restaurant par place_id (Google Maps)
router.get('/by-place-id/:placeId', async (req, res) => {
  try {
    const producer = await getModel('Producer').findOne({ place_id: req.params.placeId });
    
    if (!producer) {
      return res.status(404).json({ error: 'Restaurant non trouvé' });
    }
    
    res.status(200).json(producer);
  } catch (error) {
    console.error('Erreur de récupération du restaurant:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du restaurant' });
  }
});

// GET /api/producers/category/:category - Obtenir les restaurants par catégorie
router.get('/category/:category', async (req, res) => {
  try {
    const producers = await getModel('Producer').find({
      category: { $in: [req.params.category] }
    }).limit(50);
    
    res.status(200).json(producers);
  } catch (error) {
    console.error('Erreur de récupération des restaurants par catégorie:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des restaurants par catégorie' });
  }
});

// GET /api/producers/nearby - Obtenir les restaurants à proximité
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, radius = 5000, limit = 20 } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({ error: 'Les coordonnées GPS sont requises (lat, lng)' });
    }
    
    const producers = await getModel('Producer').find({
      gps_coordinates: {
        $geoWithin: {
          $centerSphere: [
            [parseFloat(lng), parseFloat(lat)],
            parseInt(radius) / 6371000  // Convertir en radians (rayon de la Terre = 6371km)
          ]
        }
      }
    }).limit(parseInt(limit));
    
    res.status(200).json(producers);
  } catch (error) {
    console.error('Erreur de récupération des restaurants à proximité:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des restaurants à proximité' });
  }
});

/**
 * @route GET /api/producers/:producerId/events
 * @desc Get events for a specific producer
 * @access Public
 */
router.get('/:producerId/events', async (req, res) => {
  try {
    const { producerId } = req.params;

    // Find producer to validate it exists
    const producer = await getModel('Producer').findById(producerId);
    
    if (!producer) {
      return res.status(404).json({ message: 'Producer not found' });
    }
    
    // Query events from the events collection
    // First try to get events where this producer is marked as producerId
    const EventModel = mongoose.model('Event');
    let events = await EventModel.find({ producerId: producerId })
      .sort({ startTime: 1 })
      .limit(50);
    
    // If no events found, also try to find by venueId
    if (!events || events.length === 0) {
      events = await EventModel.find({ venueId: producerId })
        .sort({ startTime: 1 })
        .limit(50);
    }
    
    // If the producer has embedded events in their data, include those too
    let combinedEvents = [...events];
    
    if (producer.events && Array.isArray(producer.events) && producer.events.length > 0) {
      // Add any events that aren't already included (check by ID)
      const existingIds = events.map(e => e._id.toString());
      
      for (const event of producer.events) {
        // Check if this embedded event is already included
        if (event._id && !existingIds.includes(event._id.toString())) {
          combinedEvents.push(event);
        } else if (!event._id) {
          // If no ID, just add it
          combinedEvents.push(event);
        }
      }
    }
    
    // Sort all events by date
    combinedEvents.sort((a, b) => {
      const dateA = new Date(a.startTime || a.date || 0);
      const dateB = new Date(b.startTime || b.date || 0);
      return dateA - dateB;
    });
    
    // Retourner toujours un tableau (même vide) pour éviter les erreurs de type
    res.status(200).json(combinedEvents);
  } catch (error) {
    console.error('Error fetching producer events:', error);
    // En cas d'erreur, retourner un tableau vide
    res.status(200).json([]);
  }
});

// GET /api/producers/:producerId/relations - Obtenir les relations d'un producteur
router.get('/:producerId/relations', producerController.getProducerRelations);

// POST /api/producers/user/:userId/favorites - Ajouter un producteur aux favoris
// router.post('/user/:userId/favorites', producerController.addToFavorites); // Likely missing too

// DELETE /api/producers/user/:userId/favorites - Retirer un producteur des favoris
// router.delete('/user/:userId/favorites', producerController.removeFromFavorites);

// Endpoint : Recherche de producteurs par mots-clés
router.get('/search', async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim() === '') {
      return res.status(400).json({ message: 'Veuillez fournir un mot-clé pour la recherche.' });
    }

    console.log('🔍 Recherche pour le mot-clé :', query);

    const producers = await getModel('Producer').find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { address: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
      ],
    }).select('name address photo description category structured_data');

    console.log(`🔍 ${producers.length} producteur(s) trouvé(s)`);

    if (producers.length === 0) {
      return res.status(404).json({ message: 'Aucun producteur trouvé.' });
    }

    res.json(producers);
  } catch (err) {
    console.error('❌ Erreur lors de la recherche des producteurs :', err);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// --- ADDED: Route for getting only producer location ---
/**
 * @route   GET /api/producers/:id/location
 * @desc    Obtenir uniquement la localisation géographique d'un producteur
 * @access  Public (ou ajuster selon les besoins)
 */
router.get('/:id/location', producerController.getProducerLocationById);
// --- END ADDED ---

// GET /api/producers/:id - Obtenir un producteur par ID
/**
 * @route   GET /api/producers/:id
 * @desc    Obtenir un producteur par son ID MongoDB
 * @access  Public
 */
router.get('/:id', async (req, res) => {
  const ProducerModel = getModel('Producer');
  if (!ProducerModel) return res.status(500).send("Producer model not initialized");
  try {
    const producer = await ProducerModel.findById(req.params.id);
    if (!producer) return res.status(404).json({ message: 'Producer not found' });
    res.json(producer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/producers/:id/follow - Suivre un restaurant (nécessite authentification)
router.post('/:id/follow', auth, async (req, res) => {
  try {
    // Vérifier si l'ID est valide
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'ID de restaurant invalide' });
    }
    
    const producer = await getModel('Producer').findById(req.params.id);
    
    if (!producer) {
      return res.status(404).json({ error: 'Restaurant non trouvé' });
    }
    
    // Si l'utilisateur suit déjà ce restaurant, le retirer de la liste
    const userIndex = producer.followers.indexOf(req.user.id);
    
    if (userIndex > -1) {
      producer.followers.splice(userIndex, 1);
      producer.abonnés = Math.max(0, producer.abonnés - 1);
      await producer.save();
      
      res.status(200).json({ message: 'Vous ne suivez plus ce restaurant', isFollowing: false });
    } else {
      // Sinon, ajouter l'utilisateur à la liste des abonnés
      producer.followers.push(req.user.id);
      producer.abonnés += 1;
      await producer.save();
      
      res.status(200).json({ message: 'Vous suivez désormais ce restaurant', isFollowing: true });
    }
  } catch (error) {
    console.error('Erreur lors du suivi du restaurant:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du suivi' });
  }
});

// Endpoint : Créer une conversation et envoyer un message avec un producteur
router.post('/conversations/new-message', async (req, res) => {
  const { senderId, recipientIds, content } = req.body;

  if (!senderId || !recipientIds || recipientIds.length === 0 || !content) {
    return res.status(400).json({
      message: 'Le senderId, au moins un recipientId, et le contenu sont obligatoires.',
    });
  }

  try {
    // Combine senderId et recipientIds pour créer la liste des participants
    const participants = [senderId, ...recipientIds];

    // Vérifie si une conversation existe déjà pour ces participants
    let conversation = await getModel('Conversation').findOne({
      participants: { $all: participants, $size: participants.length },
    });

    // Si elle n'existe pas, la créer
    if (!conversation) {
      conversation = new getModel('Conversation')({
        participants,
        messages: [],
        lastUpdated: Date.now(),
      });
    }

    // Vérifie si participants est défini, sinon initialise-le
    if (!Array.isArray(conversation.participants)) {
      conversation.participants = [];
    }

    // Ajoute le message initial
    const newMessage = {
      senderId,
      content,
      timestamp: Date.now(),
    };

    conversation.messages.push(newMessage);
    conversation.lastUpdated = Date.now();

    // Sauvegarde de la conversation
    await conversation.save();

    // Mettre à jour le champ `conversations` des producteurs concernés
    const updateProducerConversations = async (producerId) => {
      await getModel('Producer').findByIdAndUpdate(
        producerId,
        { $addToSet: { conversations: conversation._id } }, // $addToSet évite les doublons
        { new: true }
      );
    };

    await Promise.all(participants.map((producerId) => updateProducerConversations(producerId)));

    res.status(201).json({
      message: 'Message envoyé avec succès.',
      conversationId: conversation._id,
      newMessage,
    });
  } catch (error) {
    console.error(
      'Erreur lors de la création de la conversation ou de l\'envoi du message :',
      error.message
    );
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Add initialize function to make it compatible with other route modules
router.initialize = function(db) {
  console.log('✅ producersRoutes.initialize called - providing compatibility');
  // Any initialization with the db connection could happen here
  return router;
};

// module.exports = router;
// Replace the simple export with this more flexible export:
module.exports = router;

// Helper function to calculate distance (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const d = R * c;
  return d;
}

// Helper to get coords from producer
function getProducerCoords(producer) {
  let lat, lng;
  if (producer?.geometry?.location?.lat && producer?.geometry?.location?.lng) {
    lat = producer.geometry.location.lat;
    lng = producer.geometry.location.lng;
  } else if (producer?.gps_coordinates?.coordinates?.length >= 2) {
    lng = producer.gps_coordinates.coordinates[0];
    lat = producer.gps_coordinates.coordinates[1];
  }
  lat = typeof lat === 'number' ? lat : parseFloat(lat);
  lng = typeof lng === 'number' ? lng : parseFloat(lng);
  if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
  return null;
}

// --- Nouvelle route pour voir la liste des users ayant fait un interest/choice sur un lieu ---
router.get('/:producerId/interactions', async (req, res) => {
  try {
    const { producerId } = req.params;
    const { type = 'save', onlyFollowings = false, userId } = req.query;
    if (!producerId) return res.status(400).json({ success: false, message: 'producerId requis' });
    let userFollowing = [];
    if (onlyFollowings === 'true' && userId && mongoose.Types.ObjectId.isValid(userId)) {
      const User = require('../models/User');
      const currentUser = await User.findById(userId).select('following').lean();
      if (currentUser) {
        userFollowing = currentUser.following || [];
        userFollowing = userFollowing.map(id => id.toString());
      }
    }
    // Construire la query
    const query = {
      producerId: producerId,
      producerType: 'restaurant',
      type: type
    };
    if (userFollowing.length > 0) {
      query.userId = { $in: userFollowing };
    }
    // Récupérer les interactions
    const interactions = await Interaction.find(query).lean();
    const userIds = interactions.map(i => i.userId);
    // Récupérer les infos users
    const User = require('../models/User');
    const users = await User.find({ _id: { $in: userIds } }).select('_id name photo_url profilePicture').lean();
    // Formater la liste
    const formatted = users.map(u => ({
      id: u._id,
      name: u.name,
      photo: u.photo_url || u.profilePicture || '',
    }));
    res.status(200).json({ success: true, users: formatted });
  } catch (error) {
    console.error('Erreur interactions users:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route   POST /api/producers/:id/menu_items
 * @desc    Ajouter un nouvel élément de menu (plat) pour un producteur
 * @access  Private
 */
router.post('/:id/menu_items', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      description, 
      price, 
      category, 
      photo_url, 
      nutri_score, 
      calories, 
      carbon_footprint 
    } = req.body;

    if (!name || !price || !category) {
      return res.status(400).json({ message: 'Name, price and category are required' });
    }

    const producer = await ProducerModel.findById(id);
    if (!producer) {
      return res.status(404).json({ message: 'Producer not found' });
    }

    // Initialize structured_data if it doesn't exist
    if (!producer.structured_data) {
      producer.structured_data = {};
    }

    // Initialize Items Indépendants if it doesn't exist
    if (!producer.structured_data['Items Indépendants']) {
      producer.structured_data['Items Indépendants'] = [];
    }

    // Create new item
    const newItem = {
      _id: new mongoose.Types.ObjectId(),
      name,
      description: description || '',
      price,
      category,
      photo_url: photo_url || '',
      nutritional_info: {
        nutri_score: nutri_score || 'E',
        calories: calories || 0,
        carbon_footprint: carbon_footprint || 0
      },
      ratings: [],
      avg_rating: 0,
      created_at: new Date(),
      updated_at: new Date()
    };

    // Add item to the collection
    producer.structured_data['Items Indépendants'].push(newItem);
    await producer.save();

    res.status(201).json({ 
      message: 'Item added successfully', 
      item: newItem 
    });
  } catch (error) {
    console.error('Error adding menu item:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

/**
 * @route   POST /api/producers/:id/menu
 * @desc    Créer un nouveau menu (ensemble de plats) pour un producteur
 * @access  Private
 */
router.post('/:id/menu', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      title, 
      description, 
      items,  // array of item IDs or complete items
      price,
      photo_url
    } = req.body;

    if (!title || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Title and at least one item are required' });
    }

    const producer = await ProducerModel.findById(id);
    if (!producer) {
      return res.status(404).json({ message: 'Producer not found' });
    }

    // Initialize structured_data if it doesn't exist
    if (!producer.structured_data) {
      producer.structured_data = {};
    }

    // Initialize Menus Globaux if it doesn't exist
    if (!producer.structured_data['Menus Globaux']) {
      producer.structured_data['Menus Globaux'] = [];
    }

    // Process items - they could be IDs or complete item objects
    const processedItems = items.map(item => {
      if (typeof item === 'string' || item instanceof mongoose.Types.ObjectId) {
        // This is an ID reference
        return { _id: item };
      } else {
        // This is a complete item object
        return {
          _id: item._id || new mongoose.Types.ObjectId(),
          name: item.name,
          description: item.description || '',
          price: item.price,
          photo_url: item.photo_url || '',
          nutritional_info: item.nutritional_info || {}
        };
      }
    });

    // Create new menu
    const newMenu = {
      _id: new mongoose.Types.ObjectId(),
      title,
      description: description || '',
      items: processedItems,
      price: price || processedItems.reduce((sum, item) => sum + (item.price || 0), 0),
      photo_url: photo_url || '',
      created_at: new Date(),
      updated_at: new Date()
    };

    // Add menu to the collection
    producer.structured_data['Menus Globaux'].push(newMenu);
    await producer.save();

    res.status(201).json({ 
      message: 'Menu created successfully', 
      menu: newMenu 
    });
  } catch (error) {
    console.error('Error creating menu:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

/**
 * @route   POST /api/producers/:id/photos
 * @desc    Ajouter une photo au producteur
 * @access  Private
 */
router.post('/:id/photos', async (req, res) => {
  try {
    const { id } = req.params;
    const { photo_url, caption, is_profile_photo } = req.body;

    if (!photo_url) {
      return res.status(400).json({ message: 'Photo URL is required' });
    }

    const producer = await ProducerModel.findById(id);
    if (!producer) {
      return res.status(404).json({ message: 'Producer not found' });
    }

    // Initialize photos array if it doesn't exist
    if (!producer.photos) {
      producer.photos = [];
    }

    // Add new photo
    producer.photos.push(photo_url);

    // If it's a profile photo, update the main photo field
    if (is_profile_photo) {
      producer.photo = photo_url;
    }

    await producer.save();

    res.status(201).json({ 
      message: 'Photo added successfully', 
      photo_url,
      photos: producer.photos 
    });
  } catch (error) {
    console.error('Error adding photo:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

/**
 * @route   POST /api/producers/:id/posts
 * @desc    Créer un nouveau post pour un producteur
 * @access  Private
 */
router.post('/:id/posts', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      content, 
      media_urls, 
      mentioned_users,
      tagged_items,
      event_details
    } = req.body;

    if (!content && (!media_urls || media_urls.length === 0)) {
      return res.status(400).json({ 
        message: 'Post must include content or at least one media item' 
      });
    }

    const producer = await ProducerModel.findById(id);
    if (!producer) {
      return res.status(404).json({ message: 'Producer not found' });
    }

    // --- MODIFIED: Use getModel to fetch the Post model ---
    const Post = getModel('Post'); // Assumes getModel is available and configured
    if (!Post) {
      console.error('Post model is not initialized');
      return res.status(500).json({ message: 'Internal server error: Post model not available' });
    }
    
    // --- EXISTING: Create new post ---
    const newPostData = {
      author: { // Assuming the producer is the author
        id: producer._id,
        authorModel: 'Producer', // Match the enum in Post.js
        name: producer.name,
        avatar: producer.photo // Or another appropriate field
      },
      producer_id: id,
      producerType: 'Producer', // Assuming 'restaurant' producers use the 'Producer' model type
      producer_name: producer.name,
      producer_photo: producer.photo,
      title: req.body.title || 'Post from ' + producer.name, // Added title, default if not provided
      content: content || '',
      media: media_urls ? media_urls.map(url => ({ type: 'image', url })) : [], // Adjusted media structure
      mentioned_users: mentioned_users || [],
      tagged_items: tagged_items || [],
      event_details: event_details || null,
      // likes: 0, // These are usually handled by interactions, not set on creation
      // comments: [],
      created_at: new Date(),
      updated_at: new Date(),
      isProducerPost: true, // Set flag
      isRestaurationProducer: true // Set flag based on producerType
      // Add other necessary fields from Post.js schema
    };

    // --- ADJUSTED: Check if title and content are provided ---
    // A post usually needs a title or content. Let's ensure at least one exists,
    // unless it's purely a media post which might be okay depending on requirements.
    if (!newPostData.title && !newPostData.content && newPostData.media.length === 0) {
       return res.status(400).json({ message: 'Post requires a title, content, or media.' });
    }


    const newPost = new Post(newPostData);
    await newPost.save();

    // --- ADDED: Link post to producer ---
    if (!producer.posts) {
      producer.posts = []; // Initialize if it doesn't exist
    }
    producer.posts.push(newPost._id);
    await producer.save(); // Save the updated producer document
    // --- END ADDED ---

    res.status(201).json({
      message: 'Post created successfully',
      post: newPost // Return the full post object
    });
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

/**
 * @route   POST /api/upload/media
 * @desc    Uploader un média (image ou vidéo)
 * @access  Private
 */
router.post('/upload/media', async (req, res) => {
  try {
    // Note: This is a placeholder. In a real implementation, you would:
    // 1. Use a middleware like multer to handle file uploads
    // 2. Process the file (resize, compress, etc.)
    // 3. Upload to cloud storage (AWS S3, Google Cloud Storage, etc.)
    // 4. Return the public URL

    // Mock implementation:
    const mockUrl = `https://storage.example.com/uploads/${Date.now()}-${req.body.filename || 'unnamed'}`;
    
    res.status(200).json({
      message: 'File uploaded successfully',
      url: mockUrl
    });
  } catch (error) {
    console.error('Error uploading media:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// === NOUVELLES ROUTES POUR LA GESTION DU PROFIL PRODUCTEUR ===

// Ajouter un plat au menu d'un producteur
router.post('/api/producers/:id/menu_items', async (req, res) => {
  await producerController.addMenuItem(req, res);
});

// Créer un nouveau menu (ensemble de plats)
router.post('/api/producers/:id/menu', async (req, res) => {
  await producerController.createMenu(req, res);
});

// Ajouter une photo au profil d'un producteur
router.post('/api/producers/:id/photos', async (req, res) => {
  await producerController.addPhoto(req, res);
});

// Créer un post pour un producteur
router.post('/api/producers/:id/posts', async (req, res) => {
  await producerController.createPost(req, res);
});

// Uploader un média (image ou vidéo)
router.post('/api/upload/media', async (req, res) => {
  await producerController.uploadMedia(req, res);
});
