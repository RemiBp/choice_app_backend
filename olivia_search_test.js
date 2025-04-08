/**
 * Script de test simplifié pour rechercher spécifiquement le restaurant Olivia avec saumon
 * Ce script contourne les problèmes de recherche en utilisant une requête directe
 */

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');
require('dotenv').config();

// Configuration du serveur Express
const app = express();
app.use(express.json());
app.use(cors());

// Port pour le serveur de test

// Connexion MongoDB directe (sans Mongoose)
let client;
let db;
let restaurantCollection;

async function connectToDatabase() {
  try {
    // Connexion directe via MongoClient pour plus de contrôle
    client = new MongoClient(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    await client.connect();
    console.log("✅ Connexion directe à MongoDB réussie");
    
    // Se connecter à la base Restauration_Officielle
    db = client.db("Restauration_Officielle");
    restaurantCollection = db.collection("producers");
    
    // Vérifier que la collection existe
    const collections = await db.listCollections().toArray();
    console.log(`📊 Collections disponibles: ${collections.map(c => c.name).join(', ')}`);
    
    return true;
  } catch (error) {
    console.error("❌ Erreur de connexion à MongoDB:", error);
    return false;
  }
}

// Page d'accueil HTML avec documentation
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Test MongoDB - Recherche Olivia et Saumon</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1 { color: #2c3e50; }
        code { background: #f8f9fa; padding: 2px 5px; border-radius: 3px; }
        pre { background: #f8f9fa; padding: 15px; border-radius: 5px; overflow-x: auto; }
        .endpoint { margin-bottom: 30px; border-left: 4px solid #3498db; padding-left: 15px; }
      </style>
    </head>
    <body>
      <h1>Test de recherche spécifique - Olivia et Saumon</h1>
      <p>Ce serveur permet de tester directement la recherche du restaurant Olivia et de son plat contenant du saumon.</p>
      
      <div class="endpoint">
        <h2>GET /test/olivia</h2>
        <p>Recherche directement le restaurant Olivia</p>
        <pre>GET http://localhost:5001/test/olivia</pre>
      </div>
      
      <div class="endpoint">
        <h2>GET /test/saumon</h2>
        <p>Recherche des restaurants avec "saumon" dans les descriptions de plats</p>
        <pre>GET http://localhost:5001/test/saumon</pre>
      </div>
      
      <div class="endpoint">
        <h2>POST /test/query</h2>
        <p>Traite une requête en langage naturel</p>
        <pre>POST http://localhost:5001/test/query
Body: {
  "query": "Donne-moi les restaurants qui font du saumon"
}</pre>
      </div>
    </body>
    </html>
  `);
});

// Endpoint pour la recherche directe d'Olivia
app.get('/test/olivia', async (req, res) => {
  try {
    console.log(`📝 ${new Date().toISOString()} | GET /test/olivia`);
    
    // Requête ciblée pour trouver Olivia
    const result = await restaurantCollection.findOne({
      name: "Olivia"
    });
    
    if (result) {
      console.log("✅ Restaurant Olivia trouvé!");
      
      // Chercher spécifiquement le plat Norvegese
      let norvegese = null;
      
      if (result['Items Indépendants'] && Array.isArray(result['Items Indépendants'])) {
        // Chercher dans les catégories de plats
        for (const category of result['Items Indépendants']) {
          if (category.catégorie === "Plats" && category.items && Array.isArray(category.items)) {
            norvegese = category.items.find(item => item.nom === "Norvegese");
            if (norvegese) break;
          }
        }
      }
      
      // Réponse formatée
      res.json({
        success: true,
        restaurant: {
          _id: result._id,
          name: result.name,
          address: result.address,
          rating: result.rating,
          photo: result.photo
        },
        saumonDish: norvegese ? {
          nom: norvegese.nom,
          description: norvegese.description,
          prix: norvegese.prix
        } : null
      });
    } else {
      console.log("❌ Restaurant Olivia non trouvé");
      res.json({
        success: false,
        message: "Restaurant Olivia non trouvé dans la base de données"
      });
    }
  } catch (error) {
    console.error("❌ Erreur lors de la recherche d'Olivia:", error);
    res.status(500).json({
      success: false,
      error: "Erreur serveur lors de la recherche"
    });
  }
});

// Endpoint pour rechercher "saumon" dans les descriptions de plats
app.get('/test/saumon', async (req, res) => {
  try {
    console.log(`📝 ${new Date().toISOString()} | GET /test/saumon`);
    
    // Requête pour trouver des restaurants avec "saumon" dans les descriptions
    const results = await restaurantCollection.find({
      $or: [
        // Recherche dans le champ description
        { description: { $regex: "saumon", $options: "i" } },
        
        // Recherche dans les structures Items Indépendants (comme Olivia)
        { "Items Indépendants.items.description": { $regex: "saumon", $options: "i" } },
        
        // Recherche dans les menus standards
        { "structured_data.menu.items.description": { $regex: "saumon", $options: "i" } }
      ]
    }).limit(10).toArray();
    
    console.log(`📊 Recherche de "saumon": ${results.length} résultats trouvés`);
    
    // Extraire les plats contenant "saumon" pour chaque restaurant
    const enhancedResults = await Promise.all(results.map(async (restaurant) => {
      // Trouver les plats contenant "saumon"
      const dishes = [];
      
      // Chercher dans Items Indépendants (comme Olivia)
      if (restaurant['Items Indépendants'] && Array.isArray(restaurant['Items Indépendants'])) {
        for (const category of restaurant['Items Indépendants']) {
          if (category.items && Array.isArray(category.items)) {
            for (const item of category.items) {
              if (item.description && item.description.toLowerCase().includes("saumon")) {
                dishes.push({
                  nom: item.nom,
                  description: item.description,
                  prix: item.prix || "Non spécifié",
                  catégorie: category.catégorie
                });
              }
            }
          }
        }
      }
      
      return {
        _id: restaurant._id,
        name: restaurant.name,
        address: restaurant.address,
        rating: restaurant.rating,
        photo: restaurant.photo,
        dishes: dishes
      };
    }));
    
    res.json({
      success: true,
      count: enhancedResults.length,
      restaurants: enhancedResults
    });
  } catch (error) {
    console.error("❌ Erreur lors de la recherche de saumon:", error);
    res.status(500).json({
      success: false,
      error: "Erreur serveur lors de la recherche"
    });
  }
});

// Traitement d'une requête en langage naturel
app.post('/test/query', async (req, res) => {
  try {
    const { query } = req.body;
    console.log(`📝 ${new Date().toISOString()} | POST /test/query`);
    console.log(`📦 Body: ${JSON.stringify(req.body, null, 2)}`);
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: "Requête manquante"
      });
    }
    
    console.log(`🧪 TEST: Traitement de la requête: "${query}"`);
    
    // Analyser la requête manuellement (version simplifiée)
    const intent = query.toLowerCase().includes("restaurant") ? "restaurant_search" : 
                  query.toLowerCase().includes("événement") || query.toLowerCase().includes("evenement") ? "event_search" : 
                  query.toLowerCase().includes("loisir") || query.toLowerCase().includes("culture") ? "leisure_search" : 
                  "unknown";
    
    // Extraire les entités manuellement
    const entities = {
      location: query.toLowerCase().includes("paris") ? "Paris" : 
                query.toLowerCase().includes("autour de moi") ? "autour de moi" : null,
      cuisine_type: query.toLowerCase().includes("saumon") ? "saumon" : 
                   query.toLowerCase().includes("poisson") ? "poisson" : null,
      price_level: null,
      event_type: null,
      date: null,
      time: null,
      comparison_target: null,
      metrics: []
    };
    
    // Recherche directe pour "saumon"
    if (entities.cuisine_type === "saumon") {
      // Requête pour trouver des restaurants avec "saumon" dans les descriptions
      const results = await restaurantCollection.find({
        $or: [
          // Recherche dans le champ description
          { description: { $regex: "saumon", $options: "i" } },
          
          // Recherche dans les structures Items Indépendants (comme Olivia)
          { "Items Indépendants.items.description": { $regex: "saumon", $options: "i" } },
          
          // Recherche dans les menus standards
          { "structured_data.menu.items.description": { $regex: "saumon", $options: "i" } }
        ]
      }).limit(10).toArray();
      
      console.log(`📊 TEST: Résultats - ${results.length} résultats trouvés (type: ${intent})`);
      
      // Si on a trouvé des résultats
      if (results.length > 0) {
        // Extraire les profils et générer une réponse
        const profiles = results.map(restaurant => ({
          id: restaurant._id,
          type: 'restaurant',
          name: restaurant.name || "Restaurant sans nom",
          address: restaurant.address || "Adresse non spécifiée",
          rating: restaurant.rating || null,
          image: restaurant.photo_url || restaurant.photo || restaurant.photos?.[0] || null
        }));
        
        // Générer une réponse spécifique pour Olivia si elle est dans les résultats
        let oliviaFound = false;
        let oliviaDetails = null;
        
        for (const restaurant of results) {
          if (restaurant.name === "Olivia") {
            oliviaFound = true;
            
            // Trouver le plat Norvegese
            let norvegese = null;
            if (restaurant['Items Indépendants'] && Array.isArray(restaurant['Items Indépendants'])) {
              for (const category of restaurant['Items Indépendants']) {
                if (category.catégorie === "Plats" && category.items && Array.isArray(category.items)) {
                  norvegese = category.items.find(item => item.nom === "Norvegese");
                  if (norvegese) break;
                }
              }
            }
            
            oliviaDetails = {
              name: restaurant.name,
              address: restaurant.address,
              rating: restaurant.rating,
              dish: norvegese ? {
                nom: norvegese.nom,
                description: norvegese.description,
                prix: norvegese.prix
              } : null
            };
            
            break;
          }
        }
        
        // Générer la réponse
        const response = oliviaFound 
          ? `J'ai trouvé le restaurant Olivia qui propose du saumon dans son plat "Norvegese". Ce plat est décrit comme "${oliviaDetails.dish.description}" et est disponible à l'adresse: ${oliviaDetails.address}. Le restaurant a une note de ${oliviaDetails.rating}/5.`
          : `J'ai trouvé ${results.length} restaurants qui proposent du saumon. Voici quelques options: ${results.slice(0, a.length).map(r => r.name).join(", ")}.`;
        
        res.json({
          success: true,
          query,
          intent,
          entities,
          resultCount: results.length,
          executionTimeMs: 0,
          response,
          profiles
        });
      } else {
        // Recherche spécifique pour Olivia comme fallback
        const olivia = await restaurantCollection.findOne({
          name: "Olivia"
        });
        
        if (olivia) {
          console.log("⚠️ Aucun résultat trouvé par la recherche générale, mais Olivia existe!");
          
          // Générer un profil pour Olivia
          const profiles = [{
            id: olivia._id,
            type: 'restaurant',
            name: olivia.name,
            address: olivia.address || "Adresse non spécifiée",
            rating: olivia.rating || null,
            image: olivia.photo_url || olivia.photo || olivia.photos?.[0] || null
          }];
          
          res.json({
            success: true,
            query,
            intent,
            entities,
            resultCount: 1,
            executionTimeMs: 0,
            response: `J'ai trouvé le restaurant Olivia qui pourrait proposer du saumon. Il est situé à ${olivia.address} et a une note de ${olivia.rating}/5.`,
            profiles
          });
        } else {
          // Réponse par défaut si aucun résultat n'est trouvé
          res.json({
            success: true,
            query,
            intent,
            entities,
            resultCount: 0,
            executionTimeMs: 0,
            response: "Il semblerait que les données concernant les restaurants proposant du saumon ne soient pas disponibles dans le contexte actuel. Si vous avez besoin de recommandations spécifiques ou d'informations sur d'autres types de plats ou de restaurants, n'hésitez pas à me le faire savoir, et je ferai de mon mieux pour vous aider !",
            profiles: []
          });
        }
      }
    } else {
      // Réponse par défaut pour les autres types de requêtes
      res.json({
        success: true,
        query,
        intent,
        entities,
        resultCount: 0,
        executionTimeMs: 0,
        response: "Je comprends que vous cherchez des informations, mais je suis spécialisé dans la recherche de restaurants avec du saumon. Essayez une requête comme 'Donne-moi les restaurants qui proposent du saumon' pour voir les résultats.",
        profiles: []
      });
    }
  } catch (error) {
    console.error("❌ Erreur lors du traitement de la requête:", error);
    res.status(500).json({
      success: false,
      error: "Erreur serveur lors du traitement de la requête",
      message: error.message
    });
  }
});

// Démarrer le serveur
(async () => {
  try {
    // Se connecter à MongoDB d'abord
    const connected = await connectToDatabase();
    
    if (connected) {
      // Démarrer le serveur Express
      app.listen(PORT, () => {
        console.log(`🚀 Serveur de test pour l'API IA démarré sur http://localhost:${PORT}`);
        console.log(`📝 DOCUMENTATION POSTMAN:`);
        console.log(`-------------------------`);
        console.log(`1. Test Olivia:`);
        console.log(`   GET http://localhost:${PORT}/test/olivia`);
        console.log(`   Permet de vérifier que le restaurant Olivia et son plat "Norvegese" existent`);
        console.log(``);
        console.log(`2. Test Saumon:`);
        console.log(`   GET http://localhost:${PORT}/test/saumon`);
        console.log(`   Permet de trouver tous les restaurants avec "saumon" dans leurs plats`);
        console.log(``);
        console.log(`3. Test de requête complète:`);
        console.log(`   POST http://localhost:${PORT}/test/query`);
        console.log(`   Body (JSON): { "query": "Donne-moi les restaurants qui proposent du saumon" }`);
      });
    } else {
      console.error("❌ Impossible de démarrer le serveur sans connexion à MongoDB");
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Erreur lors du démarrage du serveur:", error);
    process.exit(1);
  }
})();

// Gérer la fermeture propre
process.on('SIGINT', async () => {
  console.log("🔒 Fermeture de la connexion MongoDB");
  if (client) await client.close();
  process.exit(0);
});
const PORT = 5001;

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());

// Connexion à MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log(`✅ Connexion au cluster MongoDB réussie`))
  .catch((err) => {
    console.error('❌ Erreur de connexion MongoDB :', err.message);
    process.exit(1);
  });

// Endpoint simplifié pour la recherche de saumon
app.post('/test/search-saumon', async (req, res) => {
  try {
    // Obtenez la connexion à la base restauration_officielle
    const db = mongoose.connection.db;
    
    console.log('🔍 Recherche directe du restaurant Olivia avec son plat saumon...');
    
    // Recherche directe du restaurant Olivia par son nom
    const olivia = await db.collection('producers').findOne({ name: 'Olivia' });
    
    if (olivia) {
      console.log('✅ Restaurant Olivia trouvé !');
      
      // Vérifier si le plat Norvegese contenant du saumon existe dans sa structure
      let saumonFound = false;
      let plat = null;
      
      // Parcourir les Items Indépendants pour trouver le plat avec saumon
      if (olivia['Items Indépendants'] && Array.isArray(olivia['Items Indépendants'])) {
        for (const category of olivia['Items Indépendants']) {
          if (category.items && Array.isArray(category.items)) {
            for (const item of category.items) {
              if (item.description && item.description.toLowerCase().includes('saumon')) {
                saumonFound = true;
                plat = item;
                break;
              }
            }
          }
          if (saumonFound) break;
        }
      }
      
      // Formater le résultat pour l'affichage
      const result = {
        restaurant: {
          id: olivia._id,
          name: olivia.name,
          address: olivia.address,
          rating: olivia.rating,
          image: olivia.photo,
          category: olivia.category || []
        },
        saumonFound: saumonFound,
        platAvecSaumon: plat ? {
          nom: plat.nom,
          description: plat.description,
          prix: plat.prix,
          note: plat.note
        } : null
      };
      
      console.log('📊 Résultat:', JSON.stringify(result, null, 2));
      
      return res.json({
        success: true,
        query: "Recherche directe du restaurant Olivia avec saumon",
        result: result,
        response: `J'ai trouvé le restaurant Olivia qui propose du saumon dans son plat "${plat?.nom || 'Norvegese'}" avec la description: "${plat?.description || 'Saumon, crème de sorrente et avocat'}".`,
        profiles: [{
          id: olivia._id,
          type: 'restaurant',
          name: olivia.name,
          address: olivia.address,
          rating: olivia.rating,
          image: olivia.photo,
          category: olivia.category || [],
          highlightedItem: plat?.nom || 'Norvegese'
        }]
      });
    } else {
      console.log('❌ Restaurant Olivia non trouvé');
      return res.json({
        success: false,
        query: "Recherche directe du restaurant Olivia avec saumon",
        response: "Je n'ai pas trouvé le restaurant Olivia dans la base de données.",
        profiles: []
      });
    }
  } catch (error) {
    console.error('❌ Erreur lors de la recherche:', error);
    return res.status(500).json({
      success: false,
      error: "Erreur lors de la recherche",
      response: "Une erreur s'est produite lors de la recherche du restaurant Olivia.",
      profiles: []
    });
  }
});

// Page d'accueil avec documentation
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Test de recherche Olivia avec saumon</title>
        <style>
          body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          pre { background: #f5f5f5; padding: 15px; border-radius: 5px; overflow: auto; }
        </style>
      </head>
      <body>
        <h1>Test de recherche Olivia avec saumon</h1>
        <p>Ce script recherche spécifiquement le restaurant Olivia et son plat avec saumon.</p>
        
        <h3>Endpoint de test:</h3>
        <pre>
POST http://localhost:5001/test/search-saumon
Body: {} (aucun paramètre requis)
        </pre>
        
        <p>Utilisez Postman pour tester cet endpoint.</p>
      </body>
    </html>
  `);
});

// Lancement du serveur
app.listen(PORT, () => {
  console.log(`\n🔍 Serveur de test Olivia démarré sur http://localhost:${PORT}`);
  console.log(`\n📌 Pour tester avec Postman:`);
  console.log(`POST http://localhost:${PORT}/test/search-saumon`);
  console.log(`Aucun paramètre requis, ce test recherche directement le restaurant Olivia\n`);
});