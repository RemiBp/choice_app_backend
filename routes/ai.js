/**
 * Routes API pour les requêtes IA avec accès MongoDB en temps réel
 * Ces routes permettent aux utilisateurs et producteurs d'interroger l'IA
 * qui a un accès direct et en temps réel aux bases de données MongoDB.
 */

const express = require('express');
const { processUserQuery, processProducerQuery } = require('../services/aiDataService');
const router = express.Router();
const mongoose = require('mongoose');
const { choiceAppDb, restaurationDb, loisirDb, beautyWellnessDb } = require('../index');

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
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Le paramètre query est requis'
      });
    }
    
    console.log(`🧪 TEST: Traitement de la requête: "${query}" (sans authentification)`);
    
    // Traiter la requête avec accès complet aux données MongoDB
    const result = await processUserQuery(query);
    
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

module.exports = router;