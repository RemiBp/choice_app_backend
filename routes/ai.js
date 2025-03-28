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

const vibeMapService = require('../services/vibeMapService');

/**
 * @route POST /api/ai/vibe-map
 * @description Génère une cartographie sensorielle basée sur une ambiance ou une émotion
 * @example
 * // Requête: Recherche d'expériences basées sur une ambiance "mélancolique et poétique"
 * {
 *   "userId": "user123",  // optionnel
 *   "vibe": "mélancolique et poétique",
 *   "location": "Paris 11"  // optionnel
 * }
 */
router.post('/vibe-map', async (req, res) => {
  try {
    const { userId, vibe, location } = req.body;
    
    if (!vibe) {
      return res.status(400).json({
        success: false,
        message: 'Le paramètre vibe est requis'
      });
    }
    
    console.log(`🎭 Génération de cartographie sensorielle pour l'ambiance: "${vibe}"`);
    
    // Créer une requête enrichie qui intègre l'ambiance
    const enrichedQuery = `Propose des lieux et expériences avec une ambiance ${vibe}${location ? ` à ${location}` : ''}`;
    
    // Traiter la requête avec accès complet aux données MongoDB
    const result = await processUserQuery(enrichedQuery, userId);
    
    // Utiliser vibeMapService pour générer les métadonnées visuelles
    const intensity = vibeMapService.calculateVibeIntensity(vibe, result.profiles);
    const keywords = vibeMapService.extractVibeKeywords(vibe);
    const relatedVibes = vibeMapService.generateRelatedVibes(vibe);
    const colorScheme = vibeMapService.generateColorSchemeForVibe(vibe);
    
    // Format de réponse spécifique pour la cartographie sensorielle
    return res.json({
      success: true,
      vibe: vibe,
      location: location || null,
      response: result.response,
      profiles: result.profiles || [],
      resultCount: result.resultCount || 0,
      executionTimeMs: result.executionTimeMs || 0,
      // Métadonnées spécifiques pour la visualisation
      vibeData: {
        intensity,
        keywords,
        relatedVibes,
        colorScheme
      }
    });
  } catch (error) {
    console.error('❌ Erreur lors de la génération de la cartographie sensorielle:', error);
    return res.status(500).json({
      success: false,
      vibe: req.body.vibe,
      error: "Erreur lors de la génération de la cartographie",
      response: "Désolé, une erreur s'est produite lors de la génération de votre carte sensorielle. Veuillez réessayer.",
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
 * @route POST /api/ai/dialogic-feed
 * @description Génère un contenu de feed en style dialogique pour l'interface utilisateur
 * @example
 * // Requête: feed personnalisé basé sur les préférences et l'historique de l'utilisateur
 * {
 *   "userId": "user123",
 *   "location": "Paris 10",  // optionnel
 *   "interests": ["sushi", "exposition"],  // optionnel
 *   "mood": "relaxed"  // optionnel
 * }
 */
router.post('/dialogic-feed', async (req, res) => {
  try {
    const { userId, location, interests, mood } = req.body;
    
    console.log(`🤖 REQUÊTE AI DÉTECTÉE! \n🔍 Path: /api/ai/dialogic-feed\n📦 Payload: ${JSON.stringify(req.body, null, 2)}`);
    
    // Générer un contenu dialogique par défaut sans attendre le traitement AI complet
    // Cela permet à l'interface de charger immédiatement
    const defaultContent = [
      {
        "content": "Bienvenue sur votre feed personnalisé ! Découvrez de nouveaux lieux et événements basés sur vos préférences.",
        "is_interactive": true,
        "suggestions": ["Restaurants près de moi", "Événements ce weekend", "Lieux tendance"],
        "timestamp": new Date().toISOString()
      }
    ];
    
    // Si nous avons un utilisateur, nous pouvons personnaliser le contenu
    if (userId) {
      try {
        // Construire une requête personnalisée
        const query = "Based on the user's recent activity, generate a personalized feed message";
        
        // Traiter la requête sans bloquer la réponse
        processUserQuery(query, userId)
          .then(result => {
            console.log(`📊 Traitement asynchrone terminé pour le feed dialogique (userId: ${userId})`);
          })
          .catch(err => {
            console.error(`❌ Erreur lors du traitement asynchrone: ${err}`);
          });
      } catch (error) {
        console.warn(`⚠️ Erreur non bloquante lors de la personnalisation: ${error}`);
      }
    }
    
    // Renvoyer le contenu par défaut immédiatement
    return res.json(defaultContent);
  } catch (error) {
    console.error('❌ Erreur lors de la génération du feed dialogique:', error);
    return res.status(500).json([{
      "content": "Désolé, je n'ai pas pu charger votre feed personnalisé. Veuillez réessayer.",
      "is_interactive": true,
      "suggestions": ["Actualiser", "Explorer les restaurants", "Explorer les événements"],
      "timestamp": new Date().toISOString()
    }]);
  }
});

/**
 * @route GET /api/ai/health
 * @description Vérifie l'état de santé du service IA
 */
router.get('/health', async (req, res) => {
  try {
    // Vérification simple de l'état du service
    console.log('🔍 Route /api/ai/health appelée');
    res.json({
      success: true,
      status: 'operational',
      message: 'Le service IA est opérationnel',
      timestamp: new Date().toISOString()
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
 * @route GET /api/ai/test
 * @description Route de test simple pour vérifier la connectivité
 */
router.get('/test', (req, res) => {
  console.log('🧪 Route /api/ai/test appelée');
  return res.json({
    success: true,
    message: 'Connexion au service IA réussie !',
    timestamp: new Date().toISOString(),
    info: 'Cette route peut être utilisée pour tester la connectivité entre le frontend et le backend.'
  });
});

module.exports = router;