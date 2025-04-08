/**
 * Routes API pour les requêtes IA avec accès MongoDB en temps réel
 * Ces routes permettent aux utilisateurs et producteurs d'interroger l'IA
 * qui a un accès direct et en temps réel aux bases de données MongoDB.
 */

const express = require('express');
const { processUserQuery, processProducerQuery } = require('../services/aiDataService');
const router = express.Router();

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

module.exports = router;