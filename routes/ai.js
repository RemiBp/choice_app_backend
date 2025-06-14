/**
 * Routes API pour les requêtes IA avec accès MongoDB en temps réel
 * Ces routes permettent aux utilisateurs et producteurs d'interroger l'IA
 * qui a un accès direct et en temps réel aux bases de données MongoDB.
 */

const express = require('express');
const router = express.Router();
const db = require('../config/db');
// Import middleware
const { requireAuth, checkProducerAccess } = require('../middleware/authMiddleware');
// Check for missing middleware
if (!requireAuth) {
  console.error('❌ Missing requireAuth middleware! Check exports in authMiddleware.js');
}
if (!checkProducerAccess) {
  console.error('❌ Missing checkProducerAccess middleware! Check exports in authMiddleware.js');
}
// Import AI service functions
const { 
  processUserQuery, 
  processProducerQuery, 
  getFriendsChoices, 
  getPlacesWithMostChoices,
  getUserSocialData, 
  extractEntities, 
  getTrendingAmongFriends, 
  formatSocialResponse, 
  extractProfiles,
  scoreAndFilterResults,
  generateGeoResponse,
  logUserQuery
} = require('../services/aiDataService');
const aiController = require('../controllers/aiController');
const aiService = require('../services/aiService'); // Assurez-vous que ce service est importé

// DEFENSIVE CHECKS - Before using aiController in routes
if (!aiController.getRecommendations) {
  console.error('❌ aiController.getRecommendations is undefined! Check your export in aiController.js');
}
if (!aiController.handleProducerQuery) {
  console.error('❌ aiController.handleProducerQuery is undefined! Check your export in aiController.js');
}
if (!aiController.handleGetInsights) {
  console.error('❌ aiController.handleGetInsights is undefined! Check your export in aiController.js');
}

// --- Correct Model Loading ---
let User, Restaurant, LeisureProducer, Event, WellnessPlace;

async function initializeModels() {
  try {
    // S'assurer que les connexions MongoDB sont disponibles
    const isConnected = await db.ensureConnected();
    if (!isConnected) {
      throw new Error('Cannot establish MongoDB connections. DB might be down.');
    }
    
    // Utiliser les fonctions de connexion synchrones pour la compatibilité
    const usersDb = db.getChoiceAppConnection();
    const restaurationDb = db.getRestoConnection();
    const loisirsDb = db.getLoisirsConnection();
    const beautyWellnessDb = db.getBeautyConnection();
    
  if (!usersDb || !restaurationDb || !loisirsDb || !beautyWellnessDb) {
    throw new Error('One or more DB connections are undefined! Make sure connectDB() has completed.');
  }
    
  User = require('../models/User')(usersDb);
  Restaurant = require('../models/Restaurant')(restaurationDb);
  LeisureProducer = require('../models/leisureProducer')(loisirsDb);
  Event = require('../models/event')(loisirsDb);
  WellnessPlace = require('../models/WellnessPlace')(beautyWellnessDb);
    // BeautyPlace is the same as WellnessPlace
  console.log('✅ Models loaded successfully.');
  } catch (error) {
    console.error('❌ Error initializing models:', error.message);
    throw error; // Re-throw to be handled by the caller
  }
}

// Middleware to check AI service availability (e.g., OpenAI key)
const checkAIService = (req, res, next) => {
  if (!process.env.OPENAI_API_KEY) {
    console.warn("⚠️ OpenAI API Key is missing. AI features might be limited or simulated.");
  }
  next();
};

/**
 * @route POST /api/ai/query (OBSOLETE/TESTING?)
 * @description Endpoint générique pour tester les requêtes utilisateur via l'IA
 */
router.post('/query', async (req, res) => {
  try {
    const { query, options } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Le paramètre query est requis'
      });
    }
    
    console.log(`🧪 TEST: Traitement de la requête: "${query}" (sans authentification)`);
    const result = await processUserQuery(query, null, options || {});
    console.log(`📊 TEST: Résultats - ${result.resultCount || 0} résultats trouvés (type: ${result.intent || 'inconnu'})`);
    if (result.profiles && result.profiles.length > 0) {
      console.log(`🔍 TEST: ${result.profiles.length} profils extraits`);
    }
    return res.json({
      success: true,
      query: result.query,
      intent: result.intent,
      entities: result.entities,
      resultCount: result.resultCount || 0,
      executionTimeMs: result.executionTimeMs,
      response: result.response,
      profiles: result.profiles || []
    });
  } catch (error) {
    console.error('❌ TEST: Erreur lors du traitement de la requête:', error);
    return res.status(500).json({
      success: false,
      query: req.body.query,
      error: "Erreur lors du traitement de la requête",
      response: "Désolé, une erreur s'est produite lors du traitement de votre requête. Veuillez réessayer.",
      profiles: []
    });
  }
});

/**
 * @route POST /api/ai/complex-query
 * @description Traite une requête utilisateur complexe avec contexte utilisateur et social
 */
router.post('/complex-query', async (req, res) => {
   try {
    const { query, userId, options } = req.body;
    
    if (!query) {
      return res.status(400).json({ success: false, message: 'Le paramètre query est requis' });
    }
    console.log(`🔍 Traitement de requête complexe: "${query}" (userId: ${userId || 'anonyme'})`);
    const enhancedOptions = { checkSocial: true, includeFollowing: true, includeFriends: true, includeChoices: true, geoAware: true, ...options };
    const result = await processUserQuery(query, userId, enhancedOptions);
    console.log(`📊 Résultats complexes - ${result.resultCount || 0} résultats trouvés`);
    console.log(`📊 Contexte social: ${result.hasSocialContext}, Séquence: ${result.hasSequence}`);
    return res.json({
      success: true,
      query: result.query,
      intent: result.intent,
      entities: result.entities,
      resultCount: result.resultCount || 0,
      executionTimeMs: result.executionTimeMs,
      response: result.response,
      profiles: result.profiles || [],
      hasSocialContext: result.hasSocialContext,
      hasSequence: result.hasSequence,
      socialData: result.socialData || null
    });
  } catch (error) {
    console.error('❌ Erreur lors du traitement de la requête complexe:', error);
    // Improved error handling for complex queries
    let statusCode = 500;
    let errorMessage = "Erreur lors du traitement de la requête complexe.";
    if (error.name && (error.name.includes('TimeoutError') || error.name.includes('MongoServerSelectionError'))) {
        statusCode = 503; // Service Unavailable
        errorMessage = "Le service est temporairement indisponible en raison de problèmes de base de données.";
        console.error("❗ MongoDB connection error during complex query.");
    } else if (error.code === 'invalid_api_key') {
        statusCode = 503;
        errorMessage = "Erreur de configuration du service AI.";
        console.error("❗ Invalid OpenAI API Key detected.");
    }
    return res.status(statusCode).json({
      success: false,
      query: req.body.query,
      error: errorMessage,
      response: "Désolé, une erreur majeure s'est produite. Veuillez réessayer plus tard.",
      profiles: []
    });
  }
});

/**
 * @route POST /api/ai/social/query
 * @description Traite spécifiquement les requêtes sociales (amis, followings)
 */
router.post('/social/query', async (req, res) => {
  try {
    const { userId, query, category } = req.body;
    if (!userId || !query) {
      return res.status(400).json({ success: false, message: 'Les paramètres userId et query sont requis' });
    }
    console.log(`🔍 Traitement de requête sociale: "${query}" (userId: ${userId})`);
    const socialData = await getUserSocialData(userId);
    if (!socialData || (!socialData.following.length && !socialData.friends.length)) {
      return res.json({ success: true, query: query, intent: 'social_search', resultCount: 0, response: "Je n'ai pas trouvé de relations sociales dans votre profil pour répondre à cette requête.", profiles: [] });
    }
    let socialIntent = 'friends_choices';
    if (query.toLowerCase().includes('meilleur') || query.toLowerCase().includes('top')) socialIntent = 'best_choices';
    else if (query.toLowerCase().includes('récent') || query.toLowerCase().includes('dernier')) socialIntent = 'recent_choices';
    else if (query.toLowerCase().includes('populaire')) socialIntent = 'popular_choices';
    const filters = category ? { category } : {};
    const trendingData = await getTrendingAmongFriends(userId, socialIntent, filters);
    const response = formatSocialResponse(query, socialIntent, trendingData, socialData);
    const profiles = extractProfiles(trendingData.items || []);
    return res.json({
      success: true,
      query: query,
      intent: 'social_search',
      socialIntent: socialIntent,
      resultCount: profiles.length,
      response: response,
      profiles: profiles,
      socialData: { friendsCount: socialData.friends.length, followingCount: socialData.following.length, choicesCount: trendingData.count || 0 }
    });
  } catch (error) {
    console.error('❌ Erreur lors du traitement de la requête sociale:', error);
    // Handle potential DB errors during social data fetch
    let statusCode = 500;
    let errorMessage = "Erreur lors du traitement de la requête sociale.";
    if (error.name && (error.name.includes('TimeoutError') || error.name.includes('MongoServerSelectionError'))) {
        statusCode = 503;
        errorMessage = "Impossible de récupérer les données sociales en raison de problèmes de base de données.";
    }
    return res.status(statusCode).json({
      success: false,
      query: req.body.query,
      error: errorMessage,
      response: "Désolé, une erreur s'est produite lors de la recherche sociale. Veuillez réessayer.",
      profiles: []
    });
  }
});

/**
 * @route POST /api/ai/geo/query
 * @description Traite les requêtes géographiques (autour de moi, à proximité)
 */
router.post('/geo/query', async (req, res) => {
  // Check if models are loaded before proceeding
  if (!User || !Restaurant || !LeisureProducer || !WellnessPlace) {
      console.error("‼️ Geo query cannot proceed: One or more models failed to load.");
      return res.status(500).json({ error: "Server configuration error: Models not available." });
  }
  
  try {
    const { userId, query, coordinates } = req.body;
    if (!query) {
      return res.status(400).json({ success: false, message: 'Le paramètre query est requis' });
    }
    console.log(`🔍 Traitement de requête géographique: "${query}"`);

    let userCoordinates = coordinates;
    // Retrieve coords from user profile if needed
    if ((!userCoordinates || typeof userCoordinates.latitude !== 'number' || typeof userCoordinates.longitude !== 'number') && userId) {
      try {
        const user = await User.findById(userId).select('location.coordinates').lean();
        if (user && user.location && user.location.coordinates && typeof user.location.coordinates.latitude === 'number' && typeof user.location.coordinates.longitude === 'number') {
          userCoordinates = { latitude: user.location.coordinates.latitude, longitude: user.location.coordinates.longitude };
          console.log(`📍 Coordonnées récupérées depuis le profil: ${JSON.stringify(userCoordinates)}`);
          } else {
          console.log(`📍 Pas de coordonnées valides trouvées pour l'utilisateur ${userId}, utilisation des coordonnées par défaut.`);
        }
      } catch (userError) {
        console.error('❌ Erreur lors de la récupération des coordonnées utilisateur:', userError);
      }
    }
    // Fallback to default if still no valid coordinates
    if (!userCoordinates || typeof userCoordinates.latitude !== 'number' || typeof userCoordinates.longitude !== 'number') {
      userCoordinates = { latitude: 48.8566, longitude: 2.3522 }; // Paris default
      console.log(`📍 Utilisation des coordonnées par défaut (Paris): ${JSON.stringify(userCoordinates)}`);
    }

    // --- Determine producer type and model ---
    const beautyTerms = ['manucure', 'pédicure', 'massage', 'spa', 'bien-être', 'coiffeur', 'coiffure', 'beauté', 'esthétique', 'ongles'];
    const isBeautyQuery = beautyTerms.some(term => query.toLowerCase().includes(term));
    const restaurantTerms = ['restaurant', 'cuisine', 'manger', 'dîner', 'déjeuner', 'nourriture', 'gastronomie', 'brunch', 'café', 'bistro', 'pizzeria'];
    const isRestaurantQuery = restaurantTerms.some(term => query.toLowerCase().includes(term));
    const leisureTerms = ['loisir', 'musée', 'cinéma', 'théâtre', 'parc', 'activité', 'sortie', 'spectacle', 'concert', 'exposition', 'bar', 'pub', 'club'];
    const isLeisureQuery = leisureTerms.some(term => query.toLowerCase().includes(term));

    let TargetModel, producerType, locationField;
    if (isBeautyQuery) {
      const wellnessTerms = ['massage', 'spa', 'bien-être', 'relaxation', 'détente', 'yoga', 'meditation'];
      const isWellness = wellnessTerms.some(term => query.toLowerCase().includes(term));
      if (isWellness) { TargetModel = WellnessPlace; producerType = 'wellnessProducer'; locationField = 'location'; }
      else { TargetModel = WellnessPlace; producerType = 'beautyPlace'; locationField = 'location'; }
    } else if (isLeisureQuery) {
      TargetModel = LeisureProducer; producerType = 'leisureProducer'; locationField = 'gps_coordinates';
    } else {
      TargetModel = Restaurant; // Assumes Restaurant uses the Producer schema via require('../models/Restaurant')(restaurationDb)
      producerType = 'restaurant';
      // *** CORRECTED: Producer model uses 'gps_coordinates' based on Producer.js review ***
      locationField = 'gps_coordinates'; // Adjust if your setup differs 
    }
    console.log(`🎯 Type de producteur détecté: ${producerType}, Modèle: ${TargetModel.modelName}, Champ de localisation: ${locationField}`);

    // --- Build and execute query ---
    const geoQuery = {};
    // Utiliser soit location, soit gps_coordinates selon ce qui est disponible
    if (locationField === 'location') {
      geoQuery.$or = [
        { location: { $near: { $geometry: { type: "Point", coordinates: [userCoordinates.longitude, userCoordinates.latitude] }, $maxDistance: 5000 } } },
        { gps_coordinates: { $near: { $geometry: { type: "Point", coordinates: [userCoordinates.longitude, userCoordinates.latitude] }, $maxDistance: 5000 } } }
      ];
    } else {
      geoQuery.$or = [
        { gps_coordinates: { $near: { $geometry: { type: "Point", coordinates: [userCoordinates.longitude, userCoordinates.latitude] }, $maxDistance: 5000 } } },
        { location: { $near: { $geometry: { type: "Point", coordinates: [userCoordinates.longitude, userCoordinates.latitude] }, $maxDistance: 5000 } } }
      ];
    }
    const keywordFilters = extractEntities(query);
    let combinedQuery = { ...geoQuery };

    // Add keyword filters dynamically
    if (keywordFilters.category && keywordFilters.category.length > 0) {
      const categoryRegex = keywordFilters.category.map(c => new RegExp(c, 'i'));
      let orConditions = [{ category: { $in: categoryRegex } }, { tags: { $in: categoryRegex } }];
      if (producerType === 'leisureProducer') orConditions.push({ activities: { $in: categoryRegex } });
      else if (producerType === 'restaurant') orConditions.push({ cuisine_type: { $in: categoryRegex } });
      else if (producerType === 'wellnessProducer' || producerType === 'beautyPlace') orConditions.push({ services: { $elemMatch: { name: { $in: categoryRegex } } } });
      combinedQuery.$or = orConditions;
    }
    if (keywordFilters.rating) {
      if (producerType === 'wellnessProducer' || producerType === 'beautyPlace') combinedQuery['rating.average'] = { $gte: keywordFilters.rating };
      else combinedQuery.rating = { $gte: keywordFilters.rating };
    }
    if (keywordFilters.priceLevel) {
      combinedQuery.price_level = { $lte: keywordFilters.priceLevel };
    }

    console.log(`🔍 Exécution de la requête géographique pour ${producerType}: ${JSON.stringify(combinedQuery)}`);
    let finalResults = [];
    try {
      finalResults = await TargetModel.find(combinedQuery).limit(20).lean();
    } catch (dbError) {
      console.error(`❌ Erreur DB lors de la requête géo pour ${producerType}:`, dbError);
      if (dbError.code === 291 || (dbError.message && dbError.message.includes('unable to find index for $geoNear query'))) {
        console.error(`❗❗❗ INDEX GÉOSPATIAL MANQUANT ou INCORRECT sur le champ '${locationField}' pour la collection '${TargetModel.collection.name}' (${TargetModel.db.name})! Ajoutez un index '2dsphere'.`);
        return res.status(500).json({ success: false, query: query, error: "Configuration Error", response: `Erreur interne: Index géographique manquant pour rechercher ${producerType}.`, profiles: [] });
      }
      if (dbError.name && (dbError.name.includes('TimeoutError') || dbError.name.includes('MongoServerSelectionError'))) {
           console.error(`❗❗❗ Erreur de connexion MongoDB lors de la requête géo pour ${producerType}. Vérifiez la connexion.`);
           return res.status(503).json({ success: false, query: query, error: "Database Connection Error", response: "Le service est temporairement indisponible.", profiles: [] });
      }
      throw dbError; // Rethrow unexpected errors
    }

    // Fallback if no geo results with filters
    if (finalResults.length === 0 && Object.keys(combinedQuery).length > 1) {
      console.log('📍 Pas de résultats géographiques avec filtres, tentative sans géolocalisation mais avec filtres');
      const nonGeoQuery = { ...combinedQuery };
      delete nonGeoQuery[locationField];
      try {
        finalResults = await TargetModel.find(nonGeoQuery).limit(20).lean();
      } catch (fallbackDbError) {
        console.error(`❌ Erreur DB lors de la requête géo fallback pour ${producerType}:`, fallbackDbError);
        finalResults = []; // Proceed with empty results on fallback error
      }
    }

    // --- Process and Respond ---
    const processedResults = await scoreAndFilterResults(finalResults, keywordFilters);
    const response = await generateGeoResponse(query, { intent: 'geo_search', entities: keywordFilters }, processedResults, {}, producerType, { coordinates: userCoordinates });
    const profiles = extractProfiles(processedResults);
    
    return res.json({
      success: true,
      query: query,
      intent: 'geo_search',
      producerType: producerType,
      resultCount: profiles.length,
      response: response,
      profiles: profiles,
      geoContext: { coordinates: userCoordinates, searchRadius: '5km' }
    });
  } catch (error) {
    console.error('❌ Erreur globale lors du traitement de la requête géographique:', error);
    return res.status(500).json({
      success: false,
      query: req.body.query,
      error: "Erreur lors du traitement de la requête",
      response: "Désolé, une erreur majeure s'est produite lors du traitement de votre requête géographique. Veuillez réessayer.",
      profiles: []
    });
  }
});


// --- Other Routes (User/Producer specific queries, Insights, etc.) ---
// These routes should ideally use processUserQuery/processProducerQuery for consistency

/** @route POST /api/ai/user/query */
router.post('/user/query', async (req, res) => {
  // Check if models are loaded
  if (!User) return res.status(500).json({ error: "Server configuration error: User model not available." });

  try {
    const { userId, query } = req.body;
    if (!userId || !query) {
      return res.status(400).json({ success: false, message: 'Les paramètres userId et query sont requis' });
    }
    console.log(`🔍 Traitement de la requête utilisateur: "${query}" (userId: ${userId})`);
    const result = await processUserQuery(query, userId);
    console.log(`📊 Résultats - ${result.resultCount || 0} résultats trouvés (type: ${result.intent || 'inconnu'})`);
    if (result.profiles && result.profiles.length > 0) console.log(`🔍 ${result.profiles.length} profils extraits`);
    return res.json({
      success: true,
      query: result.query,
      intent: result.intent,
      entities: result.entities,
      resultCount: result.resultCount || 0,
      executionTimeMs: result.executionTimeMs,
      response: result.response,
      profiles: result.profiles || []
    });
  } catch (error) {
    console.error('❌ Erreur lors du traitement de la requête utilisateur:', error);
    // Consistent error handling
    let statusCode = 500;
    let errorMessage = "Erreur lors du traitement de la requête utilisateur.";
    if (error.name && (error.name.includes('TimeoutError') || error.name.includes('MongoServerSelectionError'))) {
        statusCode = 503; errorMessage = "Service indisponible (DB).";
    } else if (error.code === 'invalid_api_key') {
        statusCode = 503; errorMessage = "Erreur configuration AI.";
    }
    return res.status(statusCode).json({ success: false, query: req.body.query, error: errorMessage, response: "Désolé, une erreur s'est produite.", profiles: [] });
  }
});

/** @route POST /api/ai/producer-query */
router.post('/producer-query', requireAuth, checkProducerAccess, checkAIService, async (req, res) => {
  // --- Add unmistakable log --- 
  console.log("✅✅✅ EXECUTING LATEST /api/ai/producer-query HANDLER! ✅✅✅"); 
  try {
    // Utiliser l'ID du token (req.user.id) en priorité, sinon prendre celui du corps (req.body.producerId)
    const producerId = req.user?.id || req.body.producerId;
    // Extract query and optional producerType from req.body
    const { message, producerType } = req.body;

    // --- Log req.user and extracted ID ---
    console.log('[Route /producer-query] req.user object:', JSON.stringify(req.user)); // Added log
    console.log('[Route /producer-query] Extracted producerId:', producerId); // Added log
    console.log('[Route /producer-query] User account type:', req.user?.accountType); // Added log

    // Validate that producerId and message exist
    if (!producerId) {
      console.error(`❌ [Route /producer-query] Missing producerId (not in token or body)`);
      return res.status(400).json({ success: false, message: `Le paramètre producerId est requis` });
    }
    
    if (!message) {
      console.error(`❌ [Route /producer-query] Missing message from body`);
      return res.status(400).json({ success: false, message: `Le paramètre message est requis` });
    }

    console.log(`🔍 [Route] Traitement requête producteur: "${message}" (ID: ${producerId}, Type: ${producerType || 'auto'})`);

    // --- S'assurer que les connexions MongoDB sont disponibles ---
    const isConnected = await db.ensureConnected();
    if (!isConnected) {
      console.error('❌ [Route /producer-query] Impossible d\'établir les connexions MongoDB');
      return res.status(503).json({ 
        success: false, 
        error: "Database connection error", 
        response: "Le service est temporairement indisponible. Veuillez réessayer ultérieurement." 
      });
    }

    // --- Prepare les connections nécessaires pour TOUS les types de producteurs ---
    const connections = {
        choiceAppDb: db.getChoiceAppConnection(),
        restaurationDb: db.getRestoConnection(),
        loisirsDb: db.getLoisirsConnection(),
        beautyWellnessDb: db.getBeautyConnection()
    };
    
    // Check database connection status for detailed diagnostics
    try {
        const dbStatus = await aiService.checkDatabaseStatus(connections);
        console.log(`[Route /producer-query] Database connection status: ${dbStatus.success ? '✅ OK' : '❌ Issues detected'}`);
        
        // Log actual database names for debugging
        console.log(`[Route /producer-query] Restaurant DB: ${dbStatus.connections.restaurationDb?.name || 'unknown'} (actual: ${dbStatus.connections.restaurationDb?.actualName || 'unknown'})`);
        console.log(`[Route /producer-query] Leisure DB: ${dbStatus.connections.loisirsDb?.name || 'unknown'} (actual: ${dbStatus.connections.loisirsDb?.actualName || 'unknown'})`);
        console.log(`[Route /producer-query] Beauty DB: ${dbStatus.connections.beautyWellnessDb?.name || 'unknown'} (actual: ${dbStatus.connections.beautyWellnessDb?.actualName || 'unknown'})`);
    } catch (statusError) {
        console.error(`[Route /producer-query] Error checking database status:`, statusError);
    }
    
    // Vérification que toutes les connexions sont disponibles
    const missingConnections = [];
    if (!connections.choiceAppDb) missingConnections.push('choiceAppDb');
    if (!connections.restaurationDb) missingConnections.push('restaurationDb');
    if (!connections.loisirsDb) missingConnections.push('loisirsDb');
    if (!connections.beautyWellnessDb) missingConnections.push('beautyWellnessDb');
    
    if (missingConnections.length > 0) {
      console.error(`❌ [Route /producer-query] Missing connections: ${missingConnections.join(', ')}`);
      return res.status(500).json({ 
        success: false, 
        error: "Server configuration error", 
        response: "Impossible de traiter la requête (connexions manquantes)." 
      });
    }
    
    console.log('[Route /producer-query] Connections established successfully');
    
    // Appel avec message au lieu de query pour être cohérent avec le frontend
    const result = await aiService.processProducerQuery(producerId, message, producerType, connections);

    console.log(`📊 [Route] Résultats requête producteur - ${result.profiles?.length || 0} profils extraits (Intent: ${result.intent || 'N/A'})`);
    console.log(`⏱️ [Route] Temps d'exécution: ${result.executionTimeMs || 0}ms`);

    // Return the structured response from the service
    return res.json({
      success: true,
      query: result.query, // Use query from the result
      intent: result.intent,
      entities: result.entities,
      resultCount: result.profiles?.length || 0, // Base result count on profiles
      executionTimeMs: result.executionTimeMs,
      response: result.response,
      profiles: result.profiles || [],
      analysisResults: result.analysisResults || null // Include potential analysis data
    });

  } catch (error) {
    console.error('❌ [Route] Erreur lors du traitement de la requête producteur:', error);
    // Determine status code based on error type
    let statusCode = 500;
    let errorMessage = "Erreur lors du traitement de la requête producteur.";
    if (error.name && (error.name.includes('TimeoutError') || error.name.includes('MongoServerSelectionError'))) {
        statusCode = 503; errorMessage = "Service indisponible (DB).";
    } else if (error.code === 'invalid_api_key' || (error.message && error.message.includes('Incorrect API key'))) {
        statusCode = 503; errorMessage = "Erreur configuration AI (Clé API?).";
        console.error("❗ Possible OpenAI API Key issue.");
    } else if (error.message && error.message.includes("Producteur non trouvé")) {
        statusCode = 404; // Not Found
        errorMessage = error.message;
    } else if (error.message && error.message.includes("Type de producteur non supporté")) {
        statusCode = 400; // Bad Request
        errorMessage = error.message;
    }
    
    // Respond with structured error
    return res.status(statusCode).json({ 
      success: false, 
      query: req.body.message,
      error: errorMessage, 
      response: "Désolé, une erreur technique est survenue lors du traitement de votre demande.", 
      profiles: [] 
    });
  }
});

// --- Insight Routes (keep as is, they call the query services) ---
/** @route GET /api/ai/insights/user/:userId */
router.get('/insights/user/:userId', async (req, res) => {
  if (!User) return res.status(500).json({ error: "Server configuration error: User model not available." });
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ success: false, message: 'Le paramètre userId est requis' });
    console.log(`🔍 Génération d'insights pour l'utilisateur: ${userId}`);
    const query = "Recommande-moi des événements ou restaurants qui pourraient m'intéresser basés sur mes préférences";
    const result = await processUserQuery(query, userId);
    console.log(`📊 Insights générés avec ${result.profiles?.length || 0} profils extraits`);
    return res.json({ success: true, query: query, response: result.response, profiles: result.profiles || [], executionTimeMs: result.executionTimeMs || 0 });
  } catch (error) {
    console.error('❌ Erreur lors de la génération des insights utilisateur:', error);
    return res.status(500).json({ success: false, error: "Erreur lors de la génération des insights", response: "Désolé, une erreur s'est produite.", profiles: [] });
  }
});

/** @route GET /api/ai/insights/producer/:producerId */
router.get('/insights/producer/:producerId', async (req, res) => {
   if (!Restaurant || !LeisureProducer || !WellnessPlace) {
    console.error("‼️ Producer insights cannot proceed: One or more producer models failed to load.");
    return res.status(500).json({ error: "Server configuration error: Producer models not available." });
  }
  try {
    const { producerId } = req.params;
    if (!producerId) return res.status(400).json({ success: false, message: 'Le paramètre producerId est requis' });
    console.log(`🔍 Génération d'insights pour le producteur: ${producerId}`);
    const query = "Analyse ma performance commerciale par rapport aux concurrents et donne-moi des recommandations";
    const result = await processProducerQuery(query, producerId);
    console.log(`📊 Insights commerciaux générés avec ${result.profiles?.length || 0} profils extraits`);
    return res.json({ success: true, query: query, response: result.response, profiles: result.profiles || [], analysisResults: result.analysisResults || null, executionTimeMs: result.executionTimeMs || 0 });
  } catch (error) {
    console.error('❌ Erreur lors de la génération des insights producteur:', error);
    return res.status(500).json({ success: false, error: "Erreur lors de la génération des insights", response: "Désolé, une erreur s'est produite.", profiles: [] });
  }
});

// --- Health Check ---
router.get('/health', (req, res) => {
  // Add more checks later (DB connection, OpenAI connection)
  res.json({ success: true, status: 'operational', message: 'Service IA opérationnel' });
});

// --- Social & Popular Routes (keep as is) ---
/** @route GET /api/ai/social/friends-choices/:userId */
router.get('/social/friends-choices/:userId', async (req, res) => {
   if (!User) return res.status(500).json({ error: "Server configuration error: User model not available." });
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ success: false, message: 'L\'ID utilisateur est requis' });
    const friendsChoices = await getFriendsChoices(userId);
    return res.json({ success: true, count: friendsChoices.length, data: friendsChoices });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des choices des amis:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});

/** @route GET /api/ai/popular/places */
router.get('/popular/places', async (req, res) => {
  // Check models needed by getPlacesWithMostChoices are loaded
   if (!Restaurant || !LeisureProducer || !WellnessPlace) {
    console.error("‼️ Popular places cannot proceed: One or more models failed to load.");
    return res.status(500).json({ error: "Server configuration error: Models not available." });
  }
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const popularPlaces = await getPlacesWithMostChoices(limit);
    return res.json({ success: true, count: popularPlaces.length, data: popularPlaces });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des lieux populaires:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});

// --- Producer Dashboard Routes (Keep aiController usage) ---
// Defensive check before registering routes
if (requireAuth && checkProducerAccess && aiController.getRecommendations) {
  router.get('/:producerType/:producerId/recommendations', requireAuth, checkProducerAccess, aiController.getRecommendations);
} else {
  console.error('❌ SKIPPING route /:producerType/:producerId/recommendations due to missing dependencies:', 
    !requireAuth ? 'requireAuth middleware, ' : '',
    !checkProducerAccess ? 'checkProducerAccess middleware, ' : '',
    !aiController.getRecommendations ? 'aiController.getRecommendations handler' : ''
  );
}

// --- NEW: Route for Producer Insights ---
/**
 * @route GET /api/ai/producer-insights/:producerId
 * @description Récupère les insights générés par l'IA pour un producteur spécifique.
 * @access Private (Producer)
 */
router.get('/producer-insights/:producerId', 
  requireAuth, // Ensure user is logged in
  // Assuming the controller checks if req.user.id matches producerId
  // If more complex access checks needed, add middleware like checkProducerAccess
  aiController.handleGetInsights // Point to the new controller method
);

// --- NOUVELLE ROUTE: Détection du type de producteur par ID --- 
/**
 * @route GET /api/ai/detect-producer-type/:id
 * @description Détecte le type d'un producteur (restaurant, leisure, etc.) basé sur son ID.
 * @access Public (ou requireAuth si nécessaire)
 */
router.get('/detect-producer-type/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, message: "L'ID du producteur est requis." });
    }

    console.log(`🔍 Détection du type pour l'ID: ${id}`);

    // --- S'assurer que les connexions MongoDB sont disponibles ---
    const isConnected = await db.ensureConnected();
    if (!isConnected) {
      console.error('❌ [Route /detect-producer-type] Impossible d\'établir les connexions MongoDB');
      return res.status(503).json({ 
        success: false, 
        error: "Database connection error", 
        response: "Le service est temporairement indisponible. Veuillez réessayer ultérieurement." 
      });
    }

    // Assurez-vous que les connexions DB sont disponibles (en utilisant les bonnes fonctions)
    const connections = {
      choiceAppDb: db.getChoiceAppConnection(),
      restaurationDb: db.getRestoConnection(),
      loisirsDb: db.getLoisirsConnection(),
      beautyWellnessDb: db.getBeautyConnection()
    };
    
    // Check database connection status for detailed diagnostics
    try {
        const dbStatus = await aiService.checkDatabaseStatus(connections);
        console.log(`[Route /detect-producer-type] Database connection status: ${dbStatus.success ? '✅ OK' : '❌ Issues detected'}`);
        
        // Log actual database names for debugging
        console.log(`[Route /detect-producer-type] Restaurant DB: ${dbStatus.connections.restaurationDb?.name || 'unknown'} (actual: ${dbStatus.connections.restaurationDb?.actualName || 'unknown'})`);
        console.log(`[Route /detect-producer-type] Restaurant collection count: ${dbStatus.connections.restaurationDb?.producersCount || 'unknown'}`);
        console.log(`[Route /detect-producer-type] Leisure DB: ${dbStatus.connections.loisirsDb?.name || 'unknown'} (actual: ${dbStatus.connections.loisirsDb?.actualName || 'unknown'})`);
        console.log(`[Route /detect-producer-type] Beauty DB: ${dbStatus.connections.beautyWellnessDb?.name || 'unknown'} (actual: ${dbStatus.connections.beautyWellnessDb?.actualName || 'unknown'})`);
    } catch (statusError) {
        console.error(`[Route /detect-producer-type] Error checking database status:`, statusError);
    }
    
    if (!connections.restaurationDb || !connections.loisirsDb || !connections.beautyWellnessDb) {
         console.error("❌ Connexions DB manquantes pour detectProducerType route.");
         return res.status(500).json({ success: false, message: "Erreur interne du serveur (DB)." });
    }

    // Appel de la fonction de service pour détecter le type
    const detectedType = await aiService.detectProducerType(id, connections);

    if (detectedType) {
      console.log(`✅ Type détecté pour ${id}: ${detectedType}`);
      return res.json({ success: true, producerId: id, producerType: detectedType });
    } else {
      console.log(`⚠️ Aucun type trouvé pour ${id}`);
      return res.status(404).json({ success: false, producerId: id, message: "Type de producteur non trouvé pour cet ID." });
    }

  } catch (error) {
    console.error('❌ Erreur lors de la détection du type de producteur:', error);
    let statusCode = 500;
    let errorMessage = "Erreur lors de la détection du type.";
    // Gérer les erreurs spécifiques (ex: ID invalide)
    if (error.name === 'CastError') {
        statusCode = 400;
        errorMessage = "Format d'ID invalide.";
    }
    return res.status(statusCode).json({ 
      success: false, 
      producerId: req.params.id, 
      error: errorMessage, 
      message: "Une erreur est survenue lors de la détection du type." 
    });
  }
});

// Updated module exports to ensure router is properly exposed as Express middleware
module.exports = {
  router: router,  // This ensures router is accessible as aiRoutes.router
  initializeModels: initializeModels
};

// --- Helper function (example, move to utils if needed) ---
const normalizeLeisureProducerData = (producer) => {
  return {
    _id: producer._id,
    id: producer._id.toString(),
    name: producer.name,
    address: producer.formatted_address || producer.address,
    category: producer.category || [],
    activities: producer.activities || [],
    photo: producer.photo || (producer.photos && producer.photos.length > 0 ? producer.photos[0] : null),
    rating: producer.rating,
  };
};