/**
 * Script de test simplifié pour l'API IA avec accès MongoDB
 * Ce script expose une version simplifiée de l'API pour faciliter les tests avec Postman
 */

const express = require('express');
const cors = require('cors');
const { processUserQuery, processProducerQuery } = require('./services/aiDataService');
const dotenv = require('dotenv');

// Charger les variables d'environnement
dotenv.config();

// Créer une application Express dédiée aux tests
const app = express();

// Middleware pour le parsing du JSON
app.use(express.json());

// Middleware CORS pour autoriser les requêtes de Postman
app.use(cors());

// Middleware de log pour déboguer les requêtes
app.use((req, res, next) => {
  console.log(`📝 ${new Date().toISOString()} | ${req.method} ${req.url}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('📦 Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// Middleware de gestion des erreurs détaillé
const errorHandler = (error, req, res, next) => {
  console.error('❌ Erreur dans le middleware:', error);
  res.status(500).json({
    success: false,
    error: 'Erreur lors du traitement de la requête',
    details: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
};

/**
 * @route GET /
 * @description Page d'accueil avec instructions pour les tests
 */
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>API de test pour IA avec MongoDB</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          pre { background: #f5f5f5; padding: 10px; border-radius: 5px; }
          .endpoint { margin-bottom: 20px; }
          h3 { color: #333; }
        </style>
      </head>
      <body>
        <h1>📊 API de test pour IA avec accès MongoDB</h1>
        <p>Utilisez Postman pour tester les endpoints suivants:</p>
        
        <div class="endpoint">
          <h3>1. Test simple (sans userId)</h3>
          <pre>
POST http://localhost:5001/test/query
Content-Type: application/json

{
  "query": "Donne-moi les restaurants autour de moi qui sont réputés pour leur saumon"
}
          </pre>
        </div>
        
        <div class="endpoint">
          <h3>2. Test avec userId</h3>
          <pre>
POST http://localhost:5001/test/user-query
Content-Type: application/json

{
  "userId": "VOTRE_USER_ID",
  "query": "Donne-moi les restaurants autour de moi qui sont réputés pour leur saumon"
}
          </pre>
        </div>
        
        <div class="endpoint">
          <h3>3. Test avec producerId</h3>
          <pre>
POST http://localhost:5001/test/producer-query
Content-Type: application/json

{
  "producerId": "VOTRE_PRODUCER_ID",
  "query": "Comment se compare mon établissement avec les autres restaurants du quartier?"
}
          </pre>
        </div>
        
        <div class="endpoint">
          <h3>4. Test de santé de l'API</h3>
          <pre>
GET http://localhost:5001/test/health
          </pre>
        </div>
        
        <p><strong>Note:</strong> Ces endpoints sont simplifiés pour faciliter les tests.</p>
      </body>
    </html>
  `);
});

/**
 * @route GET /test/health
 * @description Endpoint de test pour vérifier l'état de l'API
 */
app.get('/test/health', (req, res) => {
  res.json({
    success: true,
    status: 'operational',
    environment: {
      node: process.version,
      mongodb: process.env.MONGO_URI ? 'Configuré' : 'Non configuré',
      openai: process.env.OPENAI_API_KEY ? 'Configuré' : 'Non configuré'
    }
  });
});

/**
 * @route POST /test/query
 * @description Version simplifiée de l'API pour les tests sans userId
 */
app.post('/test/query', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Le paramètre query est requis',
        query: null
      });
    }
    
    console.log(`🔍 Test de requête simple: "${query}"`);
    
    // Version simplifiée sans userId requis
    const result = await processUserQuery(query);
    
    // Format de réponse compatible avec ce qui est attendu par l'utilisateur
    return res.json({
      success: true,
      query,
      ...result
    });
  } catch (error) {
    console.error('❌ Erreur lors du test de requête:', error);
    return res.status(500).json({
      success: false,
      query: req.body.query,
      error: 'Erreur lors du traitement de la requête',
      response: 'Désolé, une erreur s\'est produite lors du traitement de votre requête. Veuillez réessayer.',
      profiles: []
    });
  }
});

/**
 * @route POST /test/user-query
 * @description Version complète avec userId pour les tests
 */
app.post('/test/user-query', async (req, res) => {
  try {
    const { userId, query } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Le paramètre query est requis',
        query: null
      });
    }
    
    console.log(`🔍 Test de requête utilisateur: "${query}" (userId: ${userId || 'non fourni'})`);
    
    // Test avec userId optionnel
    const result = await processUserQuery(query, userId || null);
    
    return res.json({
      success: true,
      query,
      ...result
    });
  } catch (error) {
    console.error('❌ Erreur lors du test de requête utilisateur:', error);
    return res.status(500).json({
      success: false,
      query: req.body.query,
      error: 'Erreur lors du traitement de la requête',
      response: 'Désolé, une erreur s\'est produite lors du traitement de votre requête. Veuillez réessayer.',
      profiles: []
    });
  }
});

/**
 * @route POST /test/producer-query
 * @description Version complète avec producerId pour les tests
 */
app.post('/test/producer-query', async (req, res) => {
  try {
    const { producerId, query } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Le paramètre query est requis',
        query: null
      });
    }
    
    if (!producerId) {
      return res.status(400).json({
        success: false,
        error: 'Le paramètre producerId est requis pour ce type de requête',
        query
      });
    }
    
    console.log(`🔍 Test de requête producteur: "${query}" (producerId: ${producerId})`);
    
    const result = await processProducerQuery(query, producerId);
    
    return res.json({
      success: true,
      query,
      ...result
    });
  } catch (error) {
    console.error('❌ Erreur lors du test de requête producteur:', error);
    return res.status(500).json({
      success: false,
      query: req.body.query,
      error: 'Erreur lors du traitement de la requête',
      response: 'Désolé, une erreur s\'est produite lors du traitement de votre requête. Veuillez réessayer.',
      profiles: []
    });
  }
});

// Ajouter le middleware d'erreur
app.use(errorHandler);

// Démarrer le serveur sur un port différent pour éviter les conflits
const PORT = process.env.TEST_PORT || 5001;
app.listen(PORT, () => {
  console.log(`
🚀 Serveur de test pour l'API IA démarré sur http://localhost:${PORT}

📝 DOCUMENTATION POSTMAN:
-------------------------
1. Test simple:
   POST http://localhost:${PORT}/test/query
   Body (JSON): { "query": "Donne-moi les restaurants autour de moi qui sont réputés pour leur saumon" }

2. Test avec userId:
   POST http://localhost:${PORT}/test/user-query
   Body (JSON): { "userId": "VOTRE_USER_ID", "query": "Propose-moi un spectacle fun ce soir" }

3. Test avec producerId:
   POST http://localhost:${PORT}/test/producer-query
   Body (JSON): { "producerId": "VOTRE_PRODUCER_ID", "query": "Comment se compare mon établissement avec les autres?" }

4. Vérification de l'état:
   GET http://localhost:${PORT}/test/health
  `);
});