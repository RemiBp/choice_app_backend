/**
 * Script de diagnostic pour le service AI avec accès MongoDB en temps réel
 * Ce script teste individuellement chaque composant du système pour identifier les problèmes
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
require('dotenv').config();
const { OpenAI } = require('openai');
const aiService = require('./services/aiDataService');

// Configuration pour les logs
const enableDetailedLogs = true;
const log = (message, object = null) => {
  console.log(`🔍 ${message}`);
  if (object && enableDetailedLogs) {
    console.dir(object, { depth: null, colors: true });
  }
};

const error = (message, err) => {
  console.error(`❌ ${message}`);
  console.error(err);
};

// Tests à exécuter
async function runDiagnostics() {
  log("🚀 Démarrage du diagnostic du service AI avec accès MongoDB en temps réel");
  
  // 1. Vérifier la configuration environnement
  log("\n📋 TEST #1: Vérification des variables d'environnement");
  const envCheck = checkEnvironmentVariables();
  if (!envCheck.success) {
    error("Configuration d'environnement incomplète! Corrigez les variables manquantes:", envCheck.missing);
    return;
  }
  log("✅ Variables d'environnement correctement configurées");
  
  // 2. Tester la connexion OpenAI
  log("\n📋 TEST #2: Vérification de la connexion OpenAI");
  try {
    const openaiResult = await testOpenAIConnection();
    log("✅ Connexion OpenAI réussie", openaiResult);
  } catch (err) {
    error("Échec de la connexion OpenAI:", err);
    return;
  }
  
  // 3. Tester les connexions MongoDB
  log("\n📋 TEST #3: Vérification des connexions MongoDB");
  try {
    const mongoResult = await testMongoDBConnections();
    log("✅ Connexions MongoDB réussies", mongoResult);
  } catch (err) {
    error("Échec de la connexion MongoDB:", err);
    return;
  }
  
  // 4. Tester l'analyse de requête
  log("\n📋 TEST #4: Test de l'analyse de requête");
  try {
    const query = "Donne-moi les restaurants avec du saumon près de Montmartre";
    const analysisResult = await testQueryAnalysis(query);
    log(`✅ Analyse de la requête "${query}" réussie`, analysisResult);
  } catch (err) {
    error("Échec de l'analyse de la requête:", err);
    return;
  }
  
  // 5. Tester une requête utilisateur complète
  log("\n📋 TEST #5: Test d'une requête utilisateur complète");
  try {
    const query = "Donne-moi les restaurants avec du saumon près de Montmartre";
    const userId = null; // Test sans ID utilisateur spécifique
    const userQueryResult = await testUserQuery(query, userId);
    log(`✅ Traitement de la requête utilisateur "${query}" réussi`, userQueryResult);
  } catch (err) {
    error("Échec du traitement de la requête utilisateur:", err);
    if (err.stack) console.error(err.stack);
    return;
  }
  
  log("\n🎉 DIAGNOSTIC TERMINÉ: Tous les tests ont réussi!");
}

// Vérifier si toutes les variables d'environnement nécessaires sont définies
function checkEnvironmentVariables() {
  const requiredVars = ['MONGO_URI', 'OPENAI_API_KEY'];
  const missing = [];
  
  requiredVars.forEach(varName => {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  });
  
  return {
    success: missing.length === 0,
    missing
  };
}

// Tester la connexion à l'API OpenAI
async function testOpenAIConnection() {
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    // Test simple pour vérifier que l'API répond
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "user", content: "Dis bonjour en une phrase courte." }
      ],
      max_tokens: 15
    });
    
    return {
      success: true,
      model: "gpt-4o-mini",
      response: response.choices[0].message.content
    };
  } catch (err) {
    throw new Error(`Erreur OpenAI: ${err.message}`);
  }
}

// Tester les connexions aux bases de données MongoDB
async function testMongoDBConnections() {
  try {
    // Configuration de la connexion principale
    const mainConnection = await mongoose.createConnection(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    // Tester la connexion en listant les collections
    const collections = await mainConnection.db.listCollections().toArray();
    const dbName = mainConnection.db.databaseName;
    
    // Tester les connexions aux autres bases de données
    const dbNames = ['choice_app', 'Restauration_Officielle', 'Loisir&Culture'];
    const connectionResults = [];
    
    for (const name of dbNames) {
      try {
        const conn = await mongoose.createConnection(process.env.MONGO_URI, {
          dbName: name,
          useNewUrlParser: true,
          useUnifiedTopology: true
        });
        
        const dbCollections = await conn.db.listCollections().toArray();
        connectionResults.push({
          dbName: name,
          success: true,
          collectionCount: dbCollections.length,
          collections: dbCollections.map(c => c.name)
        });
        
        await conn.close();
      } catch (err) {
        connectionResults.push({
          dbName: name,
          success: false,
          error: err.message
        });
      }
    }
    
    await mainConnection.close();
    
    return {
      success: true,
      mainDb: {
        name: dbName,
        collectionCount: collections.length,
        collections: collections.map(c => c.name)
      },
      databases: connectionResults
    };
  } catch (err) {
    throw new Error(`Erreur MongoDB: ${err.message}`);
  }
}

// Tester l'analyse de requête
async function testQueryAnalysis(query) {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Vous êtes un assistant spécialisé dans l'analyse de requêtes liées aux restaurants, événements et lieux de loisir. 
          Extrayez précisément l'intention et les entités d'une requête. Répondez UNIQUEMENT au format JSON:
          {
            "intent": "restaurant_search|event_search|leisure_search|producer_analytics",
            "entities": {
              "location": "quartier ou lieu mentionné",
              "cuisine_type": "type de cuisine recherché",
              "price_level": "niveau de prix (1-4)",
              "event_type": "type d'événement",
              "date": "date mentionnée",
              "time": "heure mentionnée",
              "comparison_target": "cible de comparaison pour les analyses producteur",
              "metrics": ["liste des métriques à analyser"]
            }
          }`
        },
        { role: "user", content: query }
      ],
      response_format: { type: "json_object" }
    });
    
    return JSON.parse(response.choices[0].message.content);
  } catch (err) {
    throw new Error(`Erreur analyse de la requête: ${err.message}`);
  }
}

// Tester une requête utilisateur complète
async function testUserQuery(query, userId) {
  try {
    const startTime = Date.now();
    
    // Pour éviter d'avoir à modifier le code de aiDataService.js, nous allons créer une wrapper function
    // qui capture toutes les erreurs et les affiche en détail
    const processUserQueryWithDebug = async (query, userId) => {
      try {
        return await aiService.processUserQuery(query, userId);
      } catch (err) {
        console.error("Erreur dans processUserQuery:", err);
        // Afficher la pile d'appels pour mieux comprendre l'origine de l'erreur
        if (err.stack) console.error(err.stack);
        throw err;
      }
    };
    
    const result = await processUserQueryWithDebug(query, userId);
    
    return {
      success: !result.error,
      executionTime: Date.now() - startTime,
      result
    };
  } catch (err) {
    throw new Error(`Erreur requête utilisateur: ${err.message}`);
  }
}

// Exécuter les diagnostics
runDiagnostics().catch(err => {
  console.error("❌ Erreur lors du diagnostic:", err);
  process.exit(1);
});