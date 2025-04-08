/**
 * Script de démarrage simplifié pour tester l'API IA avec accès MongoDB
 * Permet de tester rapidement les améliorations apportées à la recherche de plats
 */

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

// Charger les variables d'environnement
dotenv.config();

if (!process.env.MONGO_URI) {
  console.error('❌ La variable MONGO_URI est manquante dans le fichier .env');
  console.error('Exemple: MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/database');
  process.exit(1);
}

// Initialiser l'application Express
const app = express();
const PORT = 5001;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`📝 ${timestamp} | ${req.method} ${req.url}`);
  if (req.method === 'POST' && req.body) {
    console.log(`📦 Body: ${JSON.stringify(req.body, null, 2)}`);
  }
  next();
});

// Connexion à MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log(`✅ Connexion au cluster MongoDB réussie`))
  .catch((err) => {
    console.error('❌ Erreur de connexion MongoDB :', err.message);
    process.exit(1);
  });

// Importer les services et routes
const { processUserQuery } = require('./services/aiDataService');

// Page d'accueil avec documentation
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Test de l'API IA avec MongoDB</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          h1 { color: #333; }
          pre { background: #f5f5f5; padding: 15px; border-radius: 5px; overflow: auto; }
          .endpoint { margin-bottom: 30px; }
          .url { font-weight: bold; color: #0066cc; }
          .method { background: #4CAF50; color: white; padding: 3px 8px; border-radius: 3px; }
        </style>
      </head>
      <body>
        <h1>Test de l'API IA avec accès MongoDB en temps réel</h1>
        <p>Ce serveur permet de tester l'API IA avec les améliorations de recherche en profondeur dans les menus et plats.</p>
        
        <div class="endpoint">
          <h3><span class="method">POST</span> <span class="url">/test/query</span></h3>
          <p>Test simple sans authentification</p>
          <pre>
// Requête
{
  "query": "Donne-moi les restaurants qui proposent du saumon"
}

// Variantes à essayer
{
  "query": "Restaurants avec saumon au menu"
}

{
  "query": "Où manger du saumon"
}

{
  "query": "Quels restaurants ont du saumon dans leurs plats"
}
          </pre>
        </div>
      </body>
    </html>
  `);
});

// Endpoint de test amélioré
app.post('/test/query', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Le paramètre query est requis'
      });
    }
    
    console.log(`🧪 TEST: Traitement de la requête: "${query}"`);
    
    // Force la recherche récursive dans les menus pour les plats spécifiques
    const forceMenuSearch = query.toLowerCase().includes('saumon') || 
                            query.toLowerCase().includes('poisson') ||
                            query.toLowerCase().includes('menu') ||
                            query.toLowerCase().includes('plat');
    
    // Traiter la requête avec accès complet aux données MongoDB
    const result = await processUserQuery(query, null, { forceDeepSearch: true, forceMenuSearch });
    
    console.log(`📊 TEST: Résultats - ${result.resultCount || 0} résultats trouvés (type: ${result.intent || 'inconnu'})`);
    if (result.profiles && result.profiles.length > 0) {
      console.log(`🔍 TEST: ${result.profiles.length} profils extraits`);
      result.profiles.forEach(p => console.log(`- ${p.name} (${p._id})`));
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

// Lancement du serveur
app.listen(PORT, () => {
  console.log(`\n🚀 Serveur de test pour l'API IA démarré sur http://localhost:${PORT}`);
  console.log(`\n📝 DOCUMENTATION POSTMAN:\n-------------------------`);
  console.log(`1. Test simple:\n   POST http://localhost:${PORT}/test/query\n   Body (JSON): { "query": "Donne-moi les restaurants qui proposent du saumon" }`);
  console.log(`\nEssayez plusieurs variantes de la requête:\n- "Restaurants avec saumon au menu"\n- "Où manger du saumon"\n- "Quels restaurants ont du saumon dans leurs plats"`);
});