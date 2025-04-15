/**
 * Routes API pour les requêtes IA avec accès MongoDB en temps réel
 * Ces routes permettent aux utilisateurs et producteurs d'interroger l'IA
 * qui a un accès direct et en temps réel aux bases de données MongoDB.
 */

const express = require('express');
const router = express.Router();
const { processUserQuery, processProducerQuery, getFriendsChoices, getPlacesWithMostChoices } = require('../services/aiDataService');
const mongoose = require('mongoose');
const { choiceAppDb, restaurationDb, loisirDb, beautyWellnessDb } = require('../index');
const aiController = require('../controllers/aiController');
const { requireAuth } = require('../middleware/authMiddleware');

// Middleware to check if the authenticated user has access to the requested producer AI features
// This needs to be defined BEFORE it's used in the routes below
const checkProducerAccess = (req, res, next) => {
    const { producerType, producerId } = req.params;
    const requestingUserId = req.user?.id; // Assuming authenticateToken attached user
    const requestingProducerId = req.producer?._id?.toString(); // Assuming authenticateToken attached producer

    // Allow access if the authenticated entity is the producer itself
    if (requestingProducerId && requestingProducerId === producerId) {
         return next();
    }

    // Allow access if the authenticated entity is a user linked to the producer (e.g., owner/manager)
    // TODO: Implement logic to check user-producer relationship (e.g., from a Producer model)
    // Example placeholder check:
    // const producer = await ProducerModel.findById(producerId).populate('managers');
    // if (producer && producer.managers.some(manager => manager._id.toString() === requestingUserId)) {
    //    return next();
    // }

    // Simplified check for now: Let's assume if req.user exists and matches producerId (e.g., producer logged in as user)
    // THIS IS LIKELY INSECURE AND NEEDS PROPER RELATIONSHIP CHECKING
    if (requestingUserId && requestingUserId === producerId) {
         return next();
    }

    console.warn(`Unauthorized AI access attempt for producer ${producerId} (${producerType}) by user ${requestingUserId} or producer ${requestingProducerId}`);
    res.status(403).json({ message: 'Forbidden: Access denied to this producer\'s AI features.' });
};

/**
 * @route POST /api/ai/query
 * @description Endpoint de test simple sans authentification
 * @example
 * // Requête: "Donne-moi les restaurants de la base qui font du saumon"
 * {
 *   "query": "Donne-moi les restaurants de la base qui font du saumon"
 * }
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
    
    // Traiter la requête avec accès complet aux données MongoDB
    // Note: nous passons query en premier, puis null comme userId (paramètre correct)
    const result = await processUserQuery(query, null, options || {});
    
    console.log(`📊 TEST: Résultats - ${result.resultCount || 0} résultats trouvés (type: ${result.intent || 'inconnu'})`);
    if (result.profiles && result.profiles.length > 0) {
      console.log(`🔍 TEST: ${result.profiles.length} profils extraits`);
    }
    
    // Format de réponse direct pour faciliter les tests
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
 * @route POST /api/ai/user/query
 * @description Traite une requête utilisateur en langage naturel
 * @example
 * // Requête: "Propose-moi un spectacle fun ce soir"
 * {
 *   "userId": "user123",
 *   "query": "Propose-moi un spectacle fun ce soir"
 * }
 */
router.post('/user/query', async (req, res) => {
  try {
    const { userId, query } = req.body;
    
    if (!userId || !query) {
      return res.status(400).json({
        success: false,
        message: 'Les paramètres userId et query sont requis'
      });
    }
    
    console.log(`🔍 Traitement de la requête utilisateur: "${query}" (userId: ${userId})`);
    
    // Traiter la requête avec accès complet aux données MongoDB
    const result = await processUserQuery(query, userId);
    
    console.log(`📊 Résultats - ${result.resultCount || 0} résultats trouvés (type: ${result.intent || 'inconnu'})`);
    if (result.profiles && result.profiles.length > 0) {
      console.log(`🔍 ${result.profiles.length} profils extraits`);
    }
    
    // Format de réponse direct
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
 * @route POST /api/ai/producer/query
 * @description Traite une requête producteur en langage naturel (analyses, comparaisons)
 * @example
 * // Requête: "Aide-moi à améliorer ma carte en comparaison des autres restaurants du quartier"
 * {
 *   "producerId": "prod456",
 *   "query": "Aide-moi à améliorer ma carte en comparaison des autres restaurants du quartier"
 * }
 */
router.post('/producer/query', async (req, res) => {
  try {
    const { producerId, query } = req.body;
    
    if (!producerId || !query) {
      return res.status(400).json({
        success: false,
        message: 'Les paramètres producerId et query sont requis'
      });
    }
    
    console.log(`🔍 Traitement de la requête producteur: "${query}" (producerId: ${producerId})`);
    
    // Traiter la requête avec accès complet aux données MongoDB
    const result = await processProducerQuery(query, producerId);
    
    console.log(`📊 Résultats - ${result.resultCount || 0} résultats trouvés (type: ${result.intent || 'inconnu'})`);
    
    // Format de réponse direct
    return res.json({
      success: true,
      query: result.query,
      intent: result.intent,
      entities: result.entities,
      resultCount: result.resultCount || 0,
      executionTimeMs: result.executionTimeMs,
      response: result.response,
      profiles: result.profiles || [],
      analysisResults: result.analysisResults || null
    });
  } catch (error) {
    console.error('❌ Erreur lors du traitement de la requête producteur:', error);
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
 * @route GET /api/ai/insights/user/:userId
 * @description Obtient des insights personnalisés pour un utilisateur
 */
router.get('/insights/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Le paramètre userId est requis'
      });
    }
    
    console.log(`🔍 Génération d'insights pour l'utilisateur: ${userId}`);
    
    // Exécute automatiquement une requête personnalisée basée sur les goûts de l'utilisateur
    const query = "Recommande-moi des événements ou restaurants qui pourraient m'intéresser basés sur mes préférences";
    const result = await processUserQuery(query, userId);
    
    console.log(`📊 Insights générés avec ${result.profiles?.length || 0} profils extraits`);
    
    // Format de réponse direct
    return res.json({
      success: true,
      query: query,
      response: result.response,
      profiles: result.profiles || [],
      executionTimeMs: result.executionTimeMs || 0
    });
  } catch (error) {
    console.error('❌ Erreur lors de la génération des insights utilisateur:', error);
    return res.status(500).json({
      success: false,
      error: "Erreur lors de la génération des insights",
      response: "Désolé, une erreur s'est produite lors de la génération des insights. Veuillez réessayer.",
      profiles: []
    });
  }
});

/**
 * @route GET /api/ai/insights/producer/:producerId
 * @description Obtient des insights commerciaux pour un producteur
 */
router.get('/insights/producer/:producerId', async (req, res) => {
  try {
    const { producerId } = req.params;
    
    if (!producerId) {
      return res.status(400).json({
        success: false,
        message: 'Le paramètre producerId est requis'
      });
    }
    
    console.log(`🔍 Génération d'insights pour le producteur: ${producerId}`);
    
    // Exécute automatiquement une requête d'analyse personnalisée
    const query = "Analyse ma performance commerciale par rapport aux concurrents de mon quartier et donne-moi les trois principales recommandations pour améliorer ma visibilité";
    const result = await processProducerQuery(query, producerId);
    
    console.log(`📊 Insights commerciaux générés avec ${result.profiles?.length || 0} profils extraits`);
    
    // Format de réponse direct
    return res.json({
      success: true,
      query: query,
      response: result.response,
      profiles: result.profiles || [],
      analysisResults: result.analysisResults || null,
      executionTimeMs: result.executionTimeMs || 0
    });
  } catch (error) {
    console.error('❌ Erreur lors de la génération des insights producteur:', error);
    return res.status(500).json({
      success: false,
      error: "Erreur lors de la génération des insights",
      response: "Désolé, une erreur s'est produite lors de la génération des insights. Veuillez réessayer.",
      profiles: []
    });
  }
});

/**
 * @route GET /api/ai/health
 * @description Vérifie l'état de santé du service IA
 */
router.get('/health', async (req, res) => {
  try {
    // Vérification simple de l'état du service
    res.json({
      success: true,
      status: 'operational',
      message: 'Le service IA est opérationnel'
    });
  } catch (error) {
    console.error('❌ Erreur lors de la vérification de l\'état du service IA:', error);
    return res.status(500).json({
      success: false,
      status: 'error',
      message: 'Le service IA rencontre des problèmes',
      error: error.message
    });
  }
});

/**
 * @route POST /api/ai/generate-vibe-map
 * @desc Générer une carte sensorielle basée sur un "vibe"
 * @access Public
 */
router.post('/generate-vibe-map', async (req, res) => {
  try {
    const { userId, vibe, location } = req.body;
    
    if (!vibe) {
      return res.status(400).json({ 
        success: false,
        message: 'Vibe (ambiance) requis pour la génération de la carte' 
      });
    }
    
    // Faire une requête interne à notre service de carte sensorielle
    const serviceResponse = await fetch(`${process.env.BASE_URL || 'http://localhost:3000'}/api/map/vibe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        vibe,
        location,
        limit: 15
      }),
    });
    
    if (!serviceResponse.ok) {
      throw new Error(`Service error: ${serviceResponse.status}`);
    }
    
    const vibeData = await serviceResponse.json();
    
    // Enregistrer cette requête pour l'historique utilisateur si userId fourni
    if (userId) {
      try {
        await UserQuery.create({
          userId,
          type: 'vibe_map',
          query: vibe,
          context: {
            location: location || 'global',
            timestamp: new Date()
          },
          result: {
            matchCount: vibeData.profiles.length,
            topMatch: vibeData.profiles.length > 0 ? vibeData.profiles[0].name : null
          }
        });
      } catch (historyError) {
        console.error('Erreur lors de l\'enregistrement de l\'historique:', historyError);
        // Ne pas échouer la requête principale si l'historique échoue
      }
    }
    
    res.status(200).json(vibeData);
  } catch (error) {
    console.error('❌ Erreur lors de la génération de la carte sensorielle:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la génération de la carte sensorielle', 
      error: error.message 
    });
  }
});

/**
 * @route GET /api/ai/detect-producer-type/:producerId
 * @desc Detect the type of a producer (restaurant, leisureProducer, wellnessProducer, etc.)
 * @access Public
 */
router.get('/detect-producer-type/:producerId', async (req, res) => {
  const { producerId } = req.params;
  
  if (!producerId) {
    return res.status(400).json({ success: false, message: 'ProducerId is required' });
  }
  
  try {
    // Try to find the producer in different collections
    const collections = [
      { name: 'restaurant', db: restaurationDb, collection: 'Lieux_Paris' },
      { name: 'leisureProducer', db: loisirDb, collection: 'leisure_producers' },
      { name: 'wellnessProducer', db: beautyWellnessDb, collection: 'wellness_producers' },
      { name: 'beautyPlace', db: beautyWellnessDb, collection: 'beauty_places' }
    ];
    
    let producerType = 'unknown';
    
    for (const { name, db, collection } of collections) {
      try {
        const model = db.model(collection, new mongoose.Schema({}, { strict: false }), collection);
        const producer = await model.findOne({ _id: producerId });
        
        if (producer) {
          producerType = name;
          break;
        }
      } catch (err) {
        console.error(`Error checking collection ${collection}: ${err.message}`);
        // Continue to the next collection
      }
    }
    
    // If we didn't find the producer in any collection, try a more general approach
    if (producerType === 'unknown') {
      try {
        // Try the producers collection in the main choice_app database
        const Producer = choiceAppDb.model('Producer');
        const producer = await Producer.findById(producerId);
        
        if (producer) {
          // Try to determine the type based on properties in the document
          if (producer.type) {
            producerType = producer.type;
          } else if (producer.producer_type) {
            producerType = producer.producer_type;
          } else {
            producerType = 'restaurant'; // Default if we can't determine
          }
        }
      } catch (err) {
        console.error(`Error checking main producer collection: ${err.message}`);
        // Fall back to default
        producerType = 'restaurant';
      }
    }
    
    res.status(200).json({
      success: true,
      producerType,
      message: producerType !== 'unknown' ? 
        `Producer identified as ${producerType}` : 
        'Could not determine producer type, defaulting to restaurant'
    });
  } catch (error) {
    console.error('Error detecting producer type:', error);
    res.status(500).json({
      success: false,
      message: 'Error detecting producer type',
      error: error.message
    });
  }
});

/**
 * @route POST /api/ai/leisure-query
 * @description Traite une requête pour producteur de loisirs
 * @access Public
 */
router.post('/leisure-query', async (req, res) => {
  try {
    const { producerId, query, producerType } = req.body;
    
    if (!producerId || !query) {
      return res.status(400).json({
        success: false,
        message: 'ProducerId et query sont requis'
      });
    }
    
    console.log(`🎮 Traitement de la requête loisirs: "${query}" (producerId: ${producerId})`);
    
    // Appel au service de traitement avec le type spécifique
    const result = await processProducerQuery(query, producerId, 'leisureProducer');
    
    // S'assurer que les profils sont bien normalisés
    if (result.profiles && Array.isArray(result.profiles)) {
      result.profiles = result.profiles.map(profile => {
        if (profile.type === 'leisureProducer') {
          return normalizeLeisureProducerData(profile);
        }
        return profile;
      });
    }
    
    console.log(`📊 Résultats - ${result.profiles?.length || 0} profils normalisés trouvés`);
    
    return res.json({
      success: true,
      response: result.response,
      profiles: result.profiles || [],
      analysisResults: result.analysisResults || null
    });
  } catch (error) {
    console.error('❌ Erreur lors du traitement de la requête loisir:', error);
    return res.status(500).json({
      success: false,
      error: "Erreur lors du traitement de la requête",
      response: "Désolé, une erreur s'est produite lors du traitement de votre requête. Veuillez réessayer.",
      profiles: []
    });
  }
});

/**
 * @route POST /api/ai/wellness-query
 * @description Traite une requête pour producteur de bien-être
 * @access Public
 */
router.post('/wellness-query', async (req, res) => {
  try {
    const { producerId, query, producerType } = req.body;
    
    if (!producerId || !query) {
      return res.status(400).json({
        success: false,
        message: 'ProducerId et query sont requis'
      });
    }
    
    console.log(`💆 Traitement de la requête bien-être: "${query}" (producerId: ${producerId})`);
    
    // Appel au service de traitement avec le type spécifique
    const result = await processProducerQuery(query, producerId, 'wellnessProducer');
    
    console.log(`📊 Résultats - ${result.profiles?.length || 0} profils trouvés`);
    
    return res.json({
      success: true,
      response: result.response,
      profiles: result.profiles || [],
      analysisResults: result.analysisResults || null
    });
  } catch (error) {
    console.error('❌ Erreur lors du traitement de la requête bien-être:', error);
    return res.status(500).json({
      success: false,
      error: "Erreur lors du traitement de la requête",
      response: "Désolé, une erreur s'est produite lors du traitement de votre requête. Veuillez réessayer.",
      profiles: []
    });
  }
});

/**
 * @route POST /api/ai/beauty-query
 * @description Traite une requête pour établissement de beauté
 * @access Public
 */
router.post('/beauty-query', async (req, res) => {
  try {
    const { producerId, query, producerType } = req.body;
    
    if (!producerId || !query) {
      return res.status(400).json({
        success: false,
        message: 'ProducerId et query sont requis'
      });
    }
    
    console.log(`💅 Traitement de la requête beauté: "${query}" (producerId: ${producerId})`);
    
    // Appel au service de traitement avec le type spécifique
    const result = await processProducerQuery(query, producerId, 'beautyPlace');
    
    console.log(`📊 Résultats - ${result.profiles?.length || 0} profils trouvés`);
    
    return res.json({
      success: true,
      response: result.response,
      profiles: result.profiles || [],
      analysisResults: result.analysisResults || null
    });
  } catch (error) {
    console.error('❌ Erreur lors du traitement de la requête beauté:', error);
    return res.status(500).json({
      success: false,
      error: "Erreur lors du traitement de la requête",
      response: "Désolé, une erreur s'est produite lors du traitement de votre requête. Veuillez réessayer.",
      profiles: []
    });
  }
});

/**
 * @route POST /api/ai/user/producer-query
 * @description Traite une requête pour restaurant (compatibilité avec le type par défaut)
 * @access Public
 */
router.post('/user/producer-query', async (req, res) => {
  try {
    const { producerId, query } = req.body;
    
    if (!producerId || !query) {
      return res.status(400).json({
        success: false,
        message: 'ProducerId et query sont requis'
      });
    }
    
    console.log(`🍽️ Traitement de la requête restaurant: "${query}" (producerId: ${producerId})`);
    
    // Appel au service de traitement avec le type par défaut
    const result = await processProducerQuery(query, producerId, 'restaurant');
    
    console.log(`📊 Résultats - ${result.profiles?.length || 0} profils trouvés`);
    
    return res.json({
      success: true,
      response: result.response,
      profiles: result.profiles || [],
      analysisResults: result.analysisResults || null
    });
  } catch (error) {
    console.error('❌ Erreur lors du traitement de la requête restaurant:', error);
    return res.status(500).json({
      success: false,
      error: "Erreur lors du traitement de la requête",
      response: "Désolé, une erreur s'est produite lors du traitement de votre requête. Veuillez réessayer.",
      profiles: []
    });
  }
});

/**
 * @route POST /api/ai/leisure-insights
 * @description Obtient des insights pour un producteur de loisirs
 * @access Public
 */
router.post('/leisure-insights', async (req, res) => {
  try {
    const { producerId, producerType } = req.body;
    
    if (!producerId) {
      return res.status(400).json({
        success: false,
        message: 'ProducerId est requis'
      });
    }
    
    console.log(`🎮 Génération d'insights pour producteur de loisirs: ${producerId}`);
    
    // Récupérer le producteur
    const producer = await LeisureProducer.findById(producerId);
    
    if (!producer) {
      return res.status(404).json({
        success: false,
        message: 'Producteur de loisirs non trouvé'
      });
    }
    
    // Normaliser les données du producteur
    const normalizedProducer = normalizeLeisureProducerData(producer.toObject());
    
    // Trouver des lieux similaires ou des concurrents
    const similars = await LeisureProducer.find({
      _id: { $ne: producerId },
      $or: [
        { category: { $in: normalizedProducer.category } },
        { activities: { $in: normalizedProducer.activities } }
      ]
    }).limit(5);
    
    // Normaliser les résultats similaires
    const normalizedSimilars = similars.map(similar => 
      normalizeLeisureProducerData(similar.toObject())
    );
    
    // Construire les profils pour l'interface
    const profiles = [
      {
        id: normalizedProducer._id.toString(),
        type: 'leisureProducer',
        name: normalizedProducer.name || normalizedProducer.lieu || 'Sans nom',
        address: normalizedProducer.address || normalizedProducer.adresse,
        category: normalizedProducer.category || [],
        image: normalizedProducer.photo || normalizedProducer.image
      },
      ...normalizedSimilars.map(similar => ({
        id: similar._id.toString(),
        type: 'leisureProducer',
        name: similar.name || similar.lieu || 'Sans nom',
        address: similar.address || similar.adresse,
        category: similar.category || [],
        image: similar.photo || similar.image
      }))
    ];
    
    // Construire la réponse textuelle
    const response = `Voici une analyse de votre établissement de loisirs "${normalizedProducer.name || normalizedProducer.lieu || 'Sans nom'}". ` + 
                    `Vous proposez des activités dans ${normalizedProducer.category ? normalizedProducer.category.join(', ') : 'divers domaines'}. ` +
                    `J'ai également identifié ${normalizedSimilars.length} établissements similaires qui pourraient représenter votre concurrence directe.`;
    
    return res.json({
      success: true,
      response,
      profiles
    });
  } catch (error) {
    console.error('❌ Erreur lors de la génération d\'insights pour producteur de loisirs:', error);
    return res.status(500).json({
      success: false,
      error: "Erreur lors de la génération d'insights",
      response: "Désolé, une erreur s'est produite lors de la génération des insights. Veuillez réessayer.",
      profiles: []
    });
  }
});

/**
 * @route POST /api/ai/wellness-insights
 * @description Obtient des insights pour un producteur de bien-être
 * @access Public
 */
router.post('/wellness-insights', async (req, res) => {
  try {
    const { producerId, producerType } = req.body;
    
    if (!producerId) {
      return res.status(400).json({
        success: false,
        message: 'ProducerId est requis'
      });
    }
    
    console.log(`💆 Génération d'insights bien-être pour le producteur: ${producerId}`);
    
    // Requête d'analyse automatique pour le bien-être
    const query = "Analyse ma performance en tant qu'établissement de bien-être par rapport aux concurrents similaires et donne-moi les principales recommandations pour améliorer ma visibilité et mon taux de réservation";
    const result = await processProducerQuery(query, producerId, 'wellnessProducer');
    
    console.log(`📊 Insights bien-être générés avec ${result.profiles?.length || 0} profils extraits`);
    
    return res.json({
      success: true,
      response: result.response,
      profiles: result.profiles || [],
      analysisResults: result.analysisResults || null
    });
  } catch (error) {
    console.error('❌ Erreur lors de la génération des insights bien-être:', error);
    return res.status(500).json({
      success: false,
      error: "Erreur lors de la génération des insights",
      response: "Désolé, une erreur s'est produite lors de la génération des insights. Veuillez réessayer.",
      profiles: []
    });
  }
});

/**
 * @route POST /api/ai/beauty-insights
 * @description Obtient des insights pour un établissement de beauté
 * @access Public
 */
router.post('/beauty-insights', async (req, res) => {
  try {
    const { producerId, producerType } = req.body;
    
    if (!producerId) {
      return res.status(400).json({
        success: false,
        message: 'ProducerId est requis'
      });
    }
    
    console.log(`💅 Génération d'insights beauté pour le producteur: ${producerId}`);
    
    // Requête d'analyse automatique pour la beauté
    const query = "Analyse ma performance en tant qu'établissement de beauté par rapport aux concurrents similaires et donne-moi les principales recommandations pour améliorer ma visibilité et mon taux de réservation";
    const result = await processProducerQuery(query, producerId, 'beautyPlace');
    
    console.log(`📊 Résultats - ${result.profiles?.length || 0} profils trouvés`);
    
    return res.json({
      success: true,
      response: result.response,
      profiles: result.profiles || [],
      analysisResults: result.analysisResults || null
    });
  } catch (error) {
    console.error('❌ Erreur lors du traitement de la requête beauté:', error);
    return res.status(500).json({
      success: false,
      error: "Erreur lors du traitement de la requête",
      response: "Désolé, une erreur s'est produite lors du traitement de votre requête. Veuillez réessayer.",
      profiles: []
    });
  }
});

/**
 * @route POST /api/ai/complex-query
 * @description Traite une requête utilisateur complexe avec contexte utilisateur
 * @example
 * // Requête: "Restaurant japonais puis spectacle ce soir"
 * {
 *   "userId": "user123",
 *   "query": "Restaurant japonais puis spectacle ce soir"
 * }
 */
router.post('/complex-query', async (req, res) => {
  try {
    const { query, userId, options } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Le paramètre query est requis'
      });
    }
    
    console.log(`🔍 Traitement de requête complexe: "${query}" (userId: ${userId || 'anonyme'})`);
    
    // Always call the service with the parameters in the correct order
    const result = await processUserQuery(query, userId, {
      checkSocial: true,
      ...options
    });
    
    console.log(`📊 Résultats complexes - ${result.resultCount || 0} résultats trouvés`);
    console.log(`📊 Contexte social: ${result.hasSocialContext}, Séquence: ${result.hasSequence}`);
    
    // Format de réponse direct
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
      hasSequence: result.hasSequence
    });
  } catch (error) {
    console.error('❌ Erreur lors du traitement de la requête complexe:', error);
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
 * @route GET /api/ai/social/friends-choices/:userId
 * @description Récupère les choices récents des amis d'un utilisateur
 */
router.get('/social/friends-choices/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'L\'ID utilisateur est requis'
      });
    }
    
    // Utiliser le service AI pour récupérer les choices des amis
    const friendsChoices = await getFriendsChoices(userId);
    
    return res.json({
      success: true,
      count: friendsChoices.length,
      data: friendsChoices
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des choices des amis:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des choices des amis',
      error: error.message
    });
  }
});

/**
 * @route GET /api/ai/popular/places
 * @description Récupère les lieux avec le plus de choices
 */
router.get('/popular/places', async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    
    // Utiliser le service AI pour récupérer les lieux populaires
    const popularPlaces = await getPlacesWithMostChoices(limit);
    
    return res.json({
      success: true,
      count: popularPlaces.length,
      data: popularPlaces
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des lieux populaires:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des lieux populaires',
      error: error.message
    });
  }
});

// DEBUGGING: Log the controller and function before defining the route
console.log('🔍 aiController:', aiController);
console.log('🔍 aiController.getRecommendations:', aiController.getRecommendations);

// DEBUGGING: Log middleware and handler before defining the GET route
console.log('\n🔍 Before GET /:producerType/:producerId/recommendations:');
console.log('🔍 authenticateToken:', requireAuth);
console.log('🔍 checkProducerAccess:', checkProducerAccess);
console.log('🔍 aiController.getRecommendations:', aiController.getRecommendations);

// Fetches AI-generated recommendations for the producer dashboard
// Temporarily removed middleware for debugging
router.get('/:producerType/:producerId/recommendations', requireAuth, checkProducerAccess, aiController.getRecommendations);

// DEBUGGING: Log middleware and handler before defining the POST route
console.log('\n🔍 Before POST /producer-query:');
console.log('🔍 authenticateToken:', requireAuth);
console.log('🔍 checkProducerAccess:', checkProducerAccess);
console.log('🔍 aiController.handleProducerQuery:', aiController.handleProducerQuery);

// POST /api/ai/producer-query
// Handles natural language queries from the producer via the dashboard chat
router.post('/producer-query', requireAuth, checkProducerAccess, aiController.handleProducerQuery);

// Make sure the router is properly exported
module.exports = router;