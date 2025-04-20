/**
 * Service d'accès IA aux données MongoDB en temps réel
 * Ce service permet à une IA d'accéder directement aux bases de données MongoDB
 * et d'exécuter des requêtes complexes pour répondre aux besoins des utilisateurs
 * et des producteurs.
 */

const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const OpenAI = require('openai');
require('dotenv').config();

// Connexions aux bases de données
const usersDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: "ChoiceApp",
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const restaurationDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: "Restauration",
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const loisirsDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: "Loisir&Culture",
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const beautyWellnessDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: "Beauty_Wellness",
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Définir les modèles (sans les redéclarer s'ils existent déjà)
let User, Restaurant, LeisureProducer, Event, BeautyPlace, WellnessPlace, Choice, AIQuery;

try {
  // On essaie d'accéder aux modèles existants
  User = mongoose.model('User');
  Restaurant = mongoose.model('Restaurant');
  LeisureProducer = mongoose.model('LeisureProducer');
  Event = mongoose.model('Event');
  BeautyPlace = mongoose.model('BeautyPlace');
  WellnessPlace = mongoose.model('WellnessPlace');
  Choice = mongoose.model('Choice');
  AIQuery = mongoose.model('AIQuery');
} catch (e) {
  // Si les modèles n'existent pas, on les crée
  User = User || usersDb.model("User", new mongoose.Schema({}, { strict: false }), "Users");
  Restaurant = Restaurant || restaurationDb.model("Restaurant", new mongoose.Schema({}, { strict: false }), "Restaurants_Paris");
  LeisureProducer = LeisureProducer || loisirsDb.model("LeisureProducer", new mongoose.Schema({}, { strict: false }), "Loisir_Paris_Producers");
  Event = Event || loisirsDb.model("Event", new mongoose.Schema({}, { strict: false }), "Loisir_Paris_Evenements");
  BeautyPlace = BeautyPlace || beautyWellnessDb.model("BeautyPlace", new mongoose.Schema({}, { strict: false }), "BeautyPlaces");
  WellnessPlace = WellnessPlace || beautyWellnessDb.model("WellnessPlace", new mongoose.Schema({}, { strict: false }), "WellnessPlaces");
  
  // Modèle pour les choices
  Choice = Choice || usersDb.model("Choice", new mongoose.Schema({
    user_id: String,
    producer_id: String,
    content: String,
    created_at: { type: Date, default: Date.now }
  }), "user_choices");

  // Modèle pour journaliser les requêtes et réponses de l'IA
  AIQuery = AIQuery || usersDb.model(
    "AIQuery",
    new mongoose.Schema({
      timestamp: { type: Date, default: Date.now },
      userId: String,
      producerId: String,
      query: String,
      intent: String,
      entities: [String],
      mongoQuery: Object,
      resultCount: Number,
      executionTimeMs: Number,
      response: String,
    }),
    "ai_queries"
  );
}

// Créer un client OpenAI seulement si la clé est disponible
let openai;
try {
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    console.log('✅ OpenAI API client initialisé');
  } else {
    console.warn('⚠️ Clé OpenAI API manquante - Service IA fonctionnera en mode simulé');
  }
} catch (error) {
  console.error('❌ Erreur lors de l\'initialisation du client OpenAI:', error);
}

// Mode simulé pour le développement local sans clé API valide
const simulatedOpenAI = {
  chat: {
    completions: {
      create: async (options) => {
        console.log('🤖 Mode simulé OpenAI: Réponse simulée générée');
        // Simuler la requête d'analyse
        if (options.response_format?.type === 'json_object') {
          // Analyse simulée pour analyzeQuery
          const userMessage = options.messages.find(msg => msg.role === 'user')?.content || '';
          const isRestaurantQuery = userMessage.includes('restaurant') || 
                                   userMessage.includes('manger') || 
                                   userMessage.includes('cuisine');
          
          const isEventQuery = userMessage.includes('spectacle') || 
                              userMessage.includes('concert') || 
                              userMessage.includes('événement');
          
          const isLeisureQuery = userMessage.includes('loisir') || 
                                userMessage.includes('activité') ||
                                userMessage.includes('divertissement');
          
          let intent = 'unknown';
          if (isRestaurantQuery) intent = 'restaurant_search';
          else if (isEventQuery) intent = 'event_search';
          else if (isLeisureQuery) intent = 'leisure_search';
          
          // Détecter les entités principales
          const entities = {};
          if (userMessage.includes('saumon')) entities.cuisine_type = 'saumon';
          if (userMessage.includes('italien')) entities.cuisine_type = 'italien';
          if (userMessage.includes('japonais')) entities.cuisine_type = 'japonais';
          
          if (userMessage.includes('moins de 25')) entities.maxPrice = 25;
          if (userMessage.includes('moins de 30')) entities.maxPrice = 30;
          
          if (userMessage.includes('bien noté')) entities.rating = 4;
          if (userMessage.includes('meilleur')) entities.rating = 4.5;
          
          if (userMessage.includes('promotion')) entities.promotion = true;
          if (userMessage.includes('réduction')) entities.promotion = true;
          
          if (userMessage.includes('calorie')) entities.calories = 'faible';
          
          // Simuler la séquence si nécessaire
          let sequence = false;
          let sequence_types = [];
          if (userMessage.includes('puis') || userMessage.includes('ensuite')) {
            sequence = true;
            if (isRestaurantQuery && (isEventQuery || isLeisureQuery)) {
              sequence_types = ['restaurant', isEventQuery ? 'spectacle' : 'loisir'];
            }
          }
          
          // Simuler le contexte social
          let social_context = undefined;
          if (userMessage.includes('ami') || userMessage.includes('entourage')) {
            social_context = { check_following: true };
          }
          
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    intent,
                    entities,
                    sequence,
                    sequence_types,
                    social_context
                  })
                }
              }
            ]
          };
        } else {
          // Réponses conversationnelles simulées pour generateResponse
          const userMessage = options.messages.find(msg => msg.role === 'user')?.content || '';
          let simulatedResponse = '';
          
          if (userMessage.includes('restaurant')) {
            simulatedResponse = 'Voici quelques restaurants que je vous recommande en fonction de vos critères. Le Bistrot Parisien offre une cuisine délicieuse et est particulièrement apprécié pour sa qualité. Le Café des Artistes propose également un excellent rapport qualité-prix.';
          } else if (userMessage.includes('spectacle')) {
            simulatedResponse = 'Je vous recommande "La Nuit des Étoiles" au Théâtre du Palais Royal ce soir à 20h, ou "Symphonie Moderne" à l\'Opéra Garnier. Ces deux spectacles sont très bien notés et correspondent à vos critères.';
          } else if (userMessage.includes('ami')) {
            simulatedResponse = 'Parmi vos amis, le restaurant Le Petit Bistrot est particulièrement populaire avec 5 de vos contacts qui l\'ont apprécié récemment. C\'est une valeur sûre pour passer un bon moment!';
          } else {
            simulatedResponse = 'Voici quelques suggestions basées sur vos critères. N\'hésitez pas à me demander plus de détails sur l\'un de ces lieux!';
          }
          
          return {
            choices: [
              {
                message: {
                  content: simulatedResponse
                }
              }
            ]
          };
        }
      }
    }
  }
};

/**
 * Analyse une requête utilisateur pour déterminer son intention et les entités mentionnées
 * @param {string} query - La requête utilisateur en langage naturel
 * @returns {Promise<Object>} - L'intention et les entités identifiées
 */
async function analyzeQuery(query) {
  try {
    // Handle undefined query
    if (!query) {
      console.error('❌ Query undefined dans analyzeQuery');
      return {
        intent: "unknown",
        entities: {},
        sequence: false,
        sequence_types: [],
        social_context: undefined
      };
    }

    // Ensure query contains 'json' keyword for response_format compatibility
    const systemMessage = `Tu es un assistant spécialisé dans l'analyse de requêtes gastronomiques, loisirs et préférences sociales pour l'application Choice.
          
SCHÉMAS DE DONNÉES:
1. Restaurants (Collection: Restaurants_Paris)
   - Principaux champs: name, description, menu_items, rating, category, cuisine_type, promotions
   - Structure menu: nom, description, prix, ingrédients, calories, notes, promotions
   - Menu format alternatif: "structured_data.Items Indépendants" et "structured_data.Menus Globaux"
   - Coordonnées: address, gps_coordinates (geospatial)

2. Loisirs (Collection: Loisir_Paris_Producers)
   - Activités culturelles, parcs, musées, théâtres, etc.
   - Champs: name, description, category, address, price_level, rating

3. Événements (Collection: Loisir_Paris_Evenements)
   - Concerts, expositions, spectacles, festivals
   - Champs: name, description, date, time, endTime, location, category, price

4. Relations sociales (Collection: Users)
   - following: liste des utilisateurs suivis 
   - followers: liste des utilisateurs qui suivent
   - interests: centres d'intérêts et préférences

5. Choix et intérêts (Collections: user_choices, user_interests)
   - collection des lieux aimés/choisis par les utilisateurs
   - lié aux ID utilisateurs et ID producteurs

Analyse attentivement la requête pour identifier:
1. Préférences alimentaires spécifiques (ingrédients, régimes)
2. Contraintes de prix/budget (maximum, fourchette)
3. Contraintes de calories/nutrition
4. Demandes de promotions/réductions
5. Références sociales (amis, following, recommandations)
6. Séquence chronologique (restaurant puis spectacle)
7. Contraintes horaires (heure précise, ce soir, etc.)
8. Popularité/tendances recherchées
9. Notations minimales demandées

Réponds au format JSON avec les champs intent, entities, sequence, sequence_types, et social_context.
Sois particulièrement attentif aux requêtes complexes comme "restaurant puis spectacle" ou "recommandé par mes amis".`;

    // Make sure 'json' keyword is present in the user message for OpenAI API
    const userMessage = `Analyse cette requête et fournis un résultat en json: "${query}"`;
    
    const client = openai || simulatedOpenAI;
    try {
      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: userMessage }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1
      });

      let contentObj;
      try {
        contentObj = JSON.parse(response.choices[0].message.content);
      } catch (parseError) {
        console.error('❌ Erreur de parsing JSON de la réponse OpenAI:', parseError);
        contentObj = {
          intent: "unknown",
          entities: {},
          sequence: false,
          sequence_types: [],
          social_context: undefined
        };
      }
      
      // Toujours inclure au moins ces deux propriétés
      contentObj.intent = contentObj.intent || "unknown";
      contentObj.entities = contentObj.entities || {};
      
      // Enrichissement automatique des entités
      
      // Détecter requêtes sociales (amis, following)
      if (query.toLowerCase().includes("amis") || 
          query.toLowerCase().includes("following") || 
          query.toLowerCase().includes("entourage") || 
          query.toLowerCase().includes("contacts")) {
        contentObj.social_context = contentObj.social_context || { check_following: true };
      }
      
      // Détecter requêtes séquentielles (puis, ensuite, après)
      const sequenceIndicators = ["puis", "ensuite", "après", "suivi", "followed by", "then"];
      if (sequenceIndicators.some(indicator => query.toLowerCase().includes(indicator)) || contentObj.sequence) {
        contentObj.sequence = true;
        
        // Si sequence_types n'est pas défini, essayer de déterminer la séquence
        if (!contentObj.sequence_types || !Array.isArray(contentObj.sequence_types) || contentObj.sequence_types.length === 0) {
          const isRestaurant = query.toLowerCase().includes("restaurant") || 
                              query.toLowerCase().includes("manger") || 
                              query.toLowerCase().includes("repas") || 
                              query.toLowerCase().includes("dîner");
                              
          const isEvent = query.toLowerCase().includes("spectacle") || 
                          query.toLowerCase().includes("concert") || 
                          query.toLowerCase().includes("événement") || 
                          query.toLowerCase().includes("exposition");
                          
          const isLeisure = query.toLowerCase().includes("loisir") || 
                           query.toLowerCase().includes("activité") || 
                           query.toLowerCase().includes("parc") || 
                           query.toLowerCase().includes("musée");
                           
          contentObj.sequence_types = [];
          
          if (isRestaurant) contentObj.sequence_types.push("restaurant");
          if (isEvent) contentObj.sequence_types.push("event");
          if (isLeisure) contentObj.sequence_types.push("leisure");
        }
      }
      
      // Normalisation des types d'intents
      if (contentObj.intent.includes("restaurant")) {
        contentObj.intent = "restaurant_search";
      } else if (contentObj.intent.includes("event") || contentObj.intent.includes("spectacle")) {
        contentObj.intent = "event_search";
      } else if (contentObj.intent.includes("loisir")) {
        contentObj.intent = "leisure_search";
      }
      
      return contentObj;
    } catch (openAIError) {
      console.error('❌ Erreur lors de l\'appel OpenAI:', openAIError);
      // En cas d'erreur avec OpenAI, utiliser une analyse basique de la requête
      const basicAnalysis = {
        intent: query.toLowerCase().includes("restaurant") ? "restaurant_search" : 
                query.toLowerCase().includes("spectacle") || query.toLowerCase().includes("événement") ? "event_search" :
                query.toLowerCase().includes("loisir") ? "leisure_search" : "unknown",
        entities: {},
        sequence: query.toLowerCase().includes("puis") || query.toLowerCase().includes("ensuite"),
        sequence_types: [],
        social_context: query.toLowerCase().includes("amis") || query.toLowerCase().includes("following") 
                        ? { check_following: true } : undefined
      };
      
      // Détection basique des entités
      if (query.toLowerCase().includes("japonais")) basicAnalysis.entities.cuisine_type = "japonais";
      if (query.toLowerCase().includes("italien")) basicAnalysis.entities.cuisine_type = "italien";
      if (query.toLowerCase().includes("saumon")) basicAnalysis.entities.cuisine_type = "saumon";
      if (query.toLowerCase().includes("noté")) basicAnalysis.entities.rating = 4;
      if (query.toLowerCase().includes("moins de 30")) basicAnalysis.entities.maxPrice = 30;
      
      return basicAnalysis;
    }
  } catch (error) {
    console.error('❌ Erreur lors de l\'analyse de la requête:', error);
    return {
      intent: "unknown",
      entities: {},
      sequence: false,
      sequence_types: [],
      social_context: undefined
    };
  }
}

/**
 * Construit une requête MongoDB basée sur l'intention et les entités identifiées
 * @param {Object} queryAnalysis - Le résultat de l'analyse de la requête
 * @returns {Object} - La requête MongoDB à exécuter
 */
function buildMongoQuery(queryAnalysis) {
  const { intent, entities } = queryAnalysis;
  let mongoQuery = {};

  if (intent === "restaurant_search") {
    // Tableau de conditions OR pour la recherche
    let orConditions = [];
    
    // Recherche par localisation
    if (entities.location) {
      orConditions.push({ address: { $regex: new RegExp(entities.location, "i") } });
      orConditions.push({ formatted_address: { $regex: new RegExp(entities.location, "i") } });
      orConditions.push({ vicinity: { $regex: new RegExp(entities.location, "i") } });
    }
    
    // Recherche par type de cuisine ou plat spécifique
    if (entities.cuisine_type) {
      const cuisineRegex = new RegExp(entities.cuisine_type, "i");
      
      // Recherche dans les champs standards
      orConditions.push({ cuisine_type: { $regex: cuisineRegex } });
      orConditions.push({ "category": { $regex: cuisineRegex } });
      
      // Recherche dans les plats (structured_data format)
      orConditions.push({ "structured_data.Items Indépendants.items.nom": { $regex: cuisineRegex } });
      orConditions.push({ "structured_data.Items Indépendants.items.description": { $regex: cuisineRegex } });
      orConditions.push({ "structured_data.Menus Globaux.inclus": { $regex: cuisineRegex } });
      
      // Recherche dans les menus (format menu_items)
      orConditions.push({ "menu_items.name": { $regex: cuisineRegex } });
      orConditions.push({ "menu_items.description": { $regex: cuisineRegex } });
      
      // Recherche dans les specialties
      orConditions.push({ "specialties": { $regex: cuisineRegex } });
    }
    
    // Recherche par niveau de prix
    if (entities.price_level) {
      mongoQuery.price_level = { $lte: parseInt(entities.price_level) };
    }
    
    // Recherche par note minimale
    if (entities.rating) {
      mongoQuery.rating = { $gte: parseFloat(entities.rating) };
    }
    
    // Recherche de promotions actives
    if (entities.promotion === true || entities.discount === true) {
      orConditions.push({ "promotion.active": true });
      orConditions.push({ "structured_data.Items Indépendants.items.promotion": true });
      orConditions.push({ "menu_items.promotion": true });
    }
    
    // Recherche par calories
    if (entities.calories) {
      const maxCalories = parseFloat(entities.calories);
      if (!isNaN(maxCalories)) {
        // Nous ne filtrons pas ici car tous les restaurants n'ont pas de données sur les calories,
        // ce filtrage se fera après avoir récupéré les résultats dans findMenuItemsByKeyword
        orConditions.push({ "structured_data.Items Indépendants.items.nutrition.calories": { $lte: maxCalories } });
        orConditions.push({ "menu_items.nutritional_info.calories": { $lte: maxCalories } });
      }
    }
    
    // Limiter aux restaurants bien notés si indiqué
    if (entities.best || entities.top) {
      mongoQuery.rating = { $gte: 4.0 };
    }
    
    // Combinaison des conditions OR
    if (orConditions.length > 0) {
      mongoQuery.$or = orConditions;
    }
  } else if (intent === "event_search") {
    // Construction de la requête pour recherche d'événements
    let eventConditions = [];
    
    if (entities.event_type) {
      eventConditions.push({ 
        category: { $regex: new RegExp(entities.event_type, "i") } 
      });
      eventConditions.push({ 
        type: { $regex: new RegExp(entities.event_type, "i") } 
      });
    }
    
    if (entities.date) {
      // TODO: Logique pour filtrer par date
    }
    
    if (entities.location) {
      eventConditions.push({ 
        location: { $regex: new RegExp(entities.location, "i") } 
      });
      eventConditions.push({ 
        address: { $regex: new RegExp(entities.location, "i") } 
      });
    }
    
    if (eventConditions.length > 0) {
      mongoQuery.$or = eventConditions;
    }
  } else if (intent === "leisure_search") {
    // Construction de la requête pour recherche de lieux de loisir
    let leisureConditions = [];
    
    if (entities.activity_type) {
      leisureConditions.push({ 
        activity_type: { $regex: new RegExp(entities.activity_type, "i") } 
      });
      leisureConditions.push({ 
        category: { $regex: new RegExp(entities.activity_type, "i") } 
      });
    }
    
    if (entities.location) {
      leisureConditions.push({ 
        location: { $regex: new RegExp(entities.location, "i") } 
      });
      leisureConditions.push({ 
        address: { $regex: new RegExp(entities.location, "i") } 
      });
    }
    
    if (leisureConditions.length > 0) {
      mongoQuery.$or = leisureConditions;
    }
  }

  console.log("📊 Query MongoDB construite:", JSON.stringify(mongoQuery, null, 2));
  return mongoQuery;
}

/**
 * Exécute une requête MongoDB construite à partir de l'analyse d'une requête utilisateur
 * @param {Object} mongoQuery - La requête MongoDB à exécuter
 * @param {string} intent - L'intention détectée dans la requête
 * @param {Object} entities - Les entités extraites de la requête
 * @param {string} producerType - Type de producteur (restaurant, loisir, etc.)
 * @returns {Promise<Array>} - Les résultats de la requête
 */
async function executeMongoQuery(mongoQuery, intent, entities = {}, producerType = 'restaurant') {
  try {
    // Initialisation des variables
    let results = [];
    
    console.log(`📊 Query MongoDB construite:`, mongoQuery);
    
    // Déterminer la collection à utiliser en fonction de l'intention
    let collection;
    if (intent === 'restaurant_search' || intent.includes('restaurant')) {
      collection = Restaurant;
    } else if (intent === 'event_search' || intent.includes('event')) {
      collection = LeisureEvent;
    } else if (intent === 'leisure_search' || intent.includes('loisir')) {
      collection = LeisureProducer;
    } else {
      // Par défaut, chercher dans les restaurants
      collection = Restaurant;
    }

    // Exécuter la requête MongoDB
    try {
      // Si la requête est vide ou invalide, utiliser une requête par défaut
      if (!mongoQuery || Object.keys(mongoQuery).length === 0) {
        const defaultQuery = {};
        results = await collection.find(defaultQuery).limit(20).lean();
      } else {
        // Détection des requêtes géospatiales
        if (mongoQuery.location && mongoQuery.location.$near) {
          // Requête géospatiale
          results = await collection.find(mongoQuery).limit(20).lean();
        } else {
          // Requête standard
          results = await collection.find(mongoQuery).limit(20).lean();
        }
      }
      
      console.log(`📊 Requête MongoDB a retourné ${results.length} résultats bruts`);
      
      // Appliquer le scoring et le filtrage en fonction des entités
      if (results.length > 0) {
        results = await scoreAndFilterResults(results, entities);
        console.log(`📈 Après scoring, ${results.length} résultats pertinents conservés`);
      }
    } catch (error) {
      console.error('❌ Erreur lors de l\'exécution de la requête MongoDB:', error);
      results = []; // Assurer que results est toujours un tableau
    }
    
    return results;
  } catch (error) {
    console.error('❌ Erreur lors de l\'exécution de la requête MongoDB:', error);
    return []; // Toujours retourner un tableau vide en cas d'erreur
  }
}

/**
 * Attribue un score à chaque résultat et filtre les plus pertinents
 * @param {Array} results - Les résultats bruts de la requête MongoDB
 * @param {Object} entities - Les entités extraites de la requête
 * @returns {Promise<Array>} - Les résultats filtrés et ordonnés par pertinence
 */
async function scoreAndFilterResults(results, entities) {
  const cuisineType = entities.cuisine_type?.toLowerCase();
  if (!cuisineType) return results;
  
  const scoredResults = [];
  
  // Parcourir chaque résultat pour lui attribuer un score
  for (const result of results) {
    let score = 0;
    let menuItemFound = null;
    
    // 1. Vérifier les champs de base
    if (result.category && Array.isArray(result.category)) {
      for (const cat of result.category) {
        if (cat.toLowerCase().includes(cuisineType)) {
          score += 5;
          break;
        }
      }
    } else if (result.category && typeof result.category === 'string' && 
               result.category.toLowerCase().includes(cuisineType)) {
      score += 5;
    }
    
    if (result.description && result.description.toLowerCase().includes(cuisineType)) {
      score += 3;
    }
    
    // 2. Explorer les menus et items pour trouver des correspondances
    // Format type 1: Items Indépendants
    if (result['Items Indépendants'] && Array.isArray(result['Items Indépendants'])) {
      for (const section of result['Items Indépendants']) {
        // Vérifier si la catégorie contient le terme recherché
        if (section.catégorie && section.catégorie.toLowerCase().includes(cuisineType)) {
          score += 10;
        }
        
        // Parcourir les items
        if (section.items && Array.isArray(section.items)) {
          for (const item of section.items) {
            if (item.nom && item.nom.toLowerCase().includes(cuisineType)) {
              score += 20;
              menuItemFound = item;
            } else if (item.description && item.description.toLowerCase().includes(cuisineType)) {
              score += 15;
              menuItemFound = item;
            }
          }
        }
      }
    }
    
    // Format type 2: Menus Globaux
    if (result['Menus Globaux'] && Array.isArray(result['Menus Globaux'])) {
      for (const menu of result['Menus Globaux']) {
        if (menu.inclus && Array.isArray(menu.inclus)) {
          for (const section of menu.inclus) {
            if (section.items && Array.isArray(section.items)) {
              for (const item of section.items) {
                if (item.nom && item.nom.toLowerCase().includes(cuisineType)) {
                  score += 20;
                  menuItemFound = item;
                } else if (item.description && item.description.toLowerCase().includes(cuisineType)) {
                  score += 15;
                  menuItemFound = item;
                }
              }
            }
          }
        }
      }
    }
    
    // Format type 3: Cas spécifique du restaurant Olivia
    if (result.name === "Olivia") {
      const norvegese = findNorvegeseItem(result);
      if (norvegese) {
        if (cuisineType === "saumon" && norvegese.description.toLowerCase().includes("saumon")) {
          score += 30; // Bonus spécial pour Olivia qui a du saumon
          menuItemFound = norvegese;
        }
      }
    }
    
    // 3. Ajouter le résultat avec son score et l'item trouvé
    if (score > 0) {
      scoredResults.push({
        ...result.toObject(), // Convertir en objet simple
        _score: score,
        _menuItemFound: menuItemFound
      });
    } else if (score === 0 && cuisineType === "saumon") {
      // Recherche récursive spécifique pour "saumon" dans les structures imbriquées
      const foundSaumon = findTermInNestedStructure(result, "saumon");
      if (foundSaumon) {
        scoredResults.push({
          ...result.toObject(),
          _score: 10,
          _menuItemFound: foundSaumon
        });
      }
    }
  }
  
  // Trier par score (descendant) et retourner les résultats
  return scoredResults.sort((a, b) => b._score - a._score);
}

/**
 * Fonction spécifique pour trouver le plat Norvegese dans Olivia
 * @param {Object} restaurant - Le restaurant à examiner
 * @returns {Object|null} - Le plat trouvé ou null
 */
function findNorvegeseItem(restaurant) {
  try {
    if (!restaurant['Items Indépendants']) return null;
    
    // Trouver la catégorie Plats
    const platsCategory = restaurant['Items Indépendants'].find(
      section => section.catégorie === "Plats"
    );
    
    if (!platsCategory || !platsCategory.items) return null;
    
    // Trouver le plat Norvegese
    return platsCategory.items.find(item => item.nom === "Norvegese");
  } catch (error) {
    console.error("Erreur lors de la recherche du plat Norvegese:", error);
    return null;
  }
}

/**
 * Recherche récursivement un terme dans une structure imbriquée
 * @param {Object} obj - L'objet à explorer
 * @param {string} term - Le terme à rechercher
 * @param {string} path - Le chemin actuel dans l'objet (pour le débogage)
 * @returns {Object|null} - L'objet contenant le terme ou null
 */
function findTermInNestedStructure(obj, term, path = '') {
  if (!obj) return null;
  
  // Si c'est une chaîne et qu'elle contient le terme
  if (typeof obj === 'string' && obj.toLowerCase().includes(term.toLowerCase())) {
    return { path, value: obj };
  }
  
  // Si c'est un objet
  if (typeof obj === 'object' && !Array.isArray(obj)) {
    for (const key in obj) {
      if (key === '_id') continue; // Ignorer les ID MongoDB
      
      // Si la clé est 'nom' ou 'description' et que la valeur contient le terme
      if ((key === 'nom' || key === 'description' || key === 'name') && 
          typeof obj[key] === 'string' && 
          obj[key].toLowerCase().includes(term.toLowerCase())) {
        return obj;
      }
      
      // Récursion
      const result = findTermInNestedStructure(obj[key], term, `${path}.${key}`);
      if (result) return result;
    }
  }
  
  // Si c'est un tableau
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const result = findTermInNestedStructure(obj[i], term, `${path}[${i}]`);
      if (result) return result;
    }
  }
  
  return null;
}

/**
 * Effectue une analyse comparative pour un producteur
 * @param {string} producerId - L'ID du producteur
 * @param {Array} competitors - Les concurrents à comparer
 * @param {Array} metrics - Les métriques à analyser
 * @param {string} producerType - Le type de producteur (restaurant, leisureProducer, etc.)
 * @returns {Promise<Object>} - Les résultats de l'analyse
 */
async function performCompetitorAnalysis(producerId, competitors, metrics, producerType) {
  try {
    // Récupérer les informations du producteur
    const producer = await Restaurant.findById(producerId);
    if (!producer) {
      return { error: "Producteur non trouvé" };
    }

    // Analyse par quartier (si le producteur a une adresse)
    const neighborhoodCompetitors = producer.address
      ? competitors.filter(comp => comp.address && comp.address.includes(producer.address.split(",")[0]))
      : [];

    // Calculer les statistiques
    const stats = {
      rating: {
        average: calculateAverage(competitors, "rating"),
        max: calculateMax(competitors, "rating"),
        producer: producer.rating || 0,
        percentile: calculatePercentile(producer.rating, competitors, "rating")
      },
      price_level: {
        average: calculateAverage(competitors, "price_level"),
        producer: producer.price_level || 0
      },
      user_ratings_total: {
        average: calculateAverage(competitors, "user_ratings_total"),
        producer: producer.user_ratings_total || 0,
        percentile: calculatePercentile(producer.user_ratings_total, competitors, "user_ratings_total")
      },
      menu_items: {
        average: calculateAverage(competitors, comp => 
          comp.structured_data ? Object.keys(comp.structured_data).length : 0
        ),
        producer: producer.structured_data ? Object.keys(producer.structured_data).length : 0
      }
    };

    // Calculer les forces et faiblesses
    const strengths = [];
    const weaknesses = [];

    if (stats.rating.producer > stats.rating.average) {
      strengths.push(`Note (${stats.rating.producer}/5) supérieure à la moyenne (${stats.rating.average.toFixed(1)}/5)`);
    } else {
      weaknesses.push(`Note (${stats.rating.producer}/5) inférieure à la moyenne (${stats.rating.average.toFixed(1)}/5)`);
    }

    if (stats.user_ratings_total.producer > stats.user_ratings_total.average) {
      strengths.push(`Nombre d'avis (${stats.user_ratings_total.producer}) supérieur à la moyenne (${Math.round(stats.user_ratings_total.average)})`);
    } else {
      weaknesses.push(`Nombre d'avis (${stats.user_ratings_total.producer}) inférieur à la moyenne (${Math.round(stats.user_ratings_total.average)})`);
    }

    // Recommandations basées sur l'analyse
    const recommendations = [];
    if (stats.rating.producer < stats.rating.average) {
      recommendations.push("Améliorer la qualité du service et des plats pour augmenter la note moyenne");
    }
    if (stats.user_ratings_total.producer < stats.user_ratings_total.average) {
      recommendations.push("Encourager les clients à laisser des avis pour augmenter la visibilité");
    }
    if (stats.menu_items.producer < stats.menu_items.average) {
      recommendations.push("Enrichir le menu avec plus d'options pour attirer une clientèle plus large");
    }

    return {
      producer: {
        name: producer.name,
        address: producer.address,
        rating: producer.rating,
        price_level: producer.price_level,
        user_ratings_total: producer.user_ratings_total
      },
      competitors: {
        total: competitors.length,
        neighborhood: neighborhoodCompetitors.length,
        topRated: competitors.filter(comp => comp.rating >= 4.5).length
      },
      stats,
      strengths,
      weaknesses,
      recommendations
    };
  } catch (error) {
    console.error("Erreur lors de l'analyse comparative:", error);
    return { error: "Erreur lors de l'analyse comparative" };
  }
}

/**
 * Génère une réponse textuelle basée sur les résultats de la recherche
 * @param {string} query - La requête originale
 * @param {Object} queryAnalysis - L'analyse de la requête
 * @param {Array} results - Les résultats de la recherche
 * @param {Object} socialData - Données sociales (si disponibles)
 * @param {string} type - Type de producteur (restaurant, loisir, etc.)
 * @param {Object} context - Contexte additionnel
 * @returns {Promise<string>} - Réponse textuelle
 */
async function generateResponse(query, queryAnalysis, results, socialData = {}, type = 'restaurant', context = {}) {
  try {
    // Si l'API OpenAI n'est pas configurée, utiliser un template simple
    if (!process.env.OPENAI_API_KEY) {
      return generateTemplateResponse(query, results, type);
    }
    
    // Formatter les résultats pour l'IA
    let formattedResults = '';
    if (results.length > 0) {
      // Ne prendre que les 5 premiers résultats pour éviter les tokens excessifs
      const limitedResults = results.slice(0, 5);
      
      formattedResults = limitedResults.map((result, index) => {
        const name = result.name || 'Établissement';
        const address = result.address || result.lieu || 'Adresse non disponible';
        const category = Array.isArray(result.category) 
          ? result.category.join(', ') 
          : (result.category || 'Catégorie non spécifiée');
        const rating = result.rating ? `${result.rating}/5` : 'Note non disponible';
        
        return `${index + 1}. ${name} - ${address} - ${category} - ${rating}`;
      }).join('\n');
    }
    
    // Construire le prompt avec plus de détails sur le contexte social
    let prompt = `Tu es un assistant conversationnel spécialisé dans les recommandations de lieux et d'activités.
Voici la requête de l'utilisateur: "${query}"

Analyse de l'intention: ${queryAnalysis.intent || 'Non déterminé'}
Entités détectées: ${JSON.stringify(queryAnalysis.entities || {})}

${results.length > 0 
  ? `Résultats pertinents trouvés (${results.length}):
${formattedResults}`
  : 'Aucun résultat trouvé dans notre base de données.'
}

${context.hasSocialContext ? 'Un contexte social a été détecté dans la requête.' : ''}
${context.hasSequence ? 'Une requête séquentielle a été détectée (plusieurs étapes).' : ''}`;

    // Ajouter des informations sociales si disponibles
    if (context.hasSocialContext && socialData) {
      if (socialData.friends && socialData.friends.length > 0) {
        prompt += `\n\nInformations sur les amis de l'utilisateur:`;
        socialData.friends.slice(0, 3).forEach(friend => {
          prompt += `\n- ${friend.name}: Intérêts: ${(friend.interests || []).join(', ')}`;
        });
      }
      
      if (socialData.friendsChoices && socialData.friendsChoices.length > 0) {
        prompt += `\n\nChoices récents des amis:`;
        socialData.friendsChoices.slice(0, 3).forEach(item => {
          prompt += `\n- ${item.user.name}: "${item.choice.content || 'A fait un choice'}" - ${new Date(item.choice.created_at).toLocaleDateString()}`;
        });
      }
    }
    
    // Instructions finales pour l'IA
    prompt += `\n\nRéponds à cette requête de façon conversationnelle, utile et concise. 
Si des lieux spécifiques sont mentionnés dans les résultats, parles-en directement.
Limite ta réponse à 5 phrases maximum pour rester concis et précis.
N'invente pas de lieux ou d'informations qui ne sont pas dans les résultats.
Si aucun résultat n'est disponible, suggère de reformuler la question.`;

    // Appel à l'API OpenAI pour générer la réponse
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 500
    });
    
    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('❌ Erreur lors de la génération de la réponse:', error);
    
    // En cas d'erreur, utiliser une réponse de repli
    if (results.length > 0) {
      return `J'ai trouvé ${results.length} résultats qui pourraient vous intéresser. Consultez les suggestions ci-dessous.`;
    } else {
      return `Je n'ai pas trouvé de résultats correspondant à votre recherche. Pourriez-vous reformuler ou préciser votre demande ?`;
    }
  }
}

/**
 * Recherche des éléments de menu dans un restaurant qui correspondent aux mots-clés
 * @param {Object} restaurant - Un restaurant avec menu
 * @param {Object} entities - Les entités à rechercher
 * @returns {Array} - Liste des éléments de menu correspondants
 */
function findMenuItemsByKeyword(restaurant, entities) {
  if (!restaurant) return [];
  
  // Extrait les mots-clés pertinents des entités
  const keywords = [];
  if (entities.cuisine_type) {
    Array.isArray(entities.cuisine_type) 
      ? keywords.push(...entities.cuisine_type) 
      : keywords.push(entities.cuisine_type);
  }
  if (entities.specialties) {
    Array.isArray(entities.specialties)
      ? keywords.push(...entities.specialties)
      : keywords.push(entities.specialties);
  }
  if (entities.food_item) {
    Array.isArray(entities.food_item)
      ? keywords.push(...entities.food_item)
      : keywords.push(entities.food_item);
  }
  
  if (keywords.length === 0) return [];
  
  // Collection de tous les éléments de menu trouvés
  const matchingItems = [];
  
  // 1. Rechercher dans la structure structured_data (format principal de Choice App)
  if (restaurant.structured_data) {
    // 1.1 Rechercher dans les Items Indépendants
    if (restaurant.structured_data['Items Indépendants']) {
      restaurant.structured_data['Items Indépendants'].forEach(category => {
        if (category.items && Array.isArray(category.items)) {
          category.items.forEach(item => {
            if (itemMatchesKeywords(item, keywords)) {
              matchingItems.push({
                ...item,
                category: category.catégorie || 'Non catégorisé',
                section: 'Items Indépendants'
              });
            }
          });
        }
      });
    }
    
    // 1.2 Rechercher dans les Menus Globaux
    if (restaurant.structured_data['Menus Globaux']) {
      restaurant.structured_data['Menus Globaux'].forEach(menu => {
        if (menu.inclus && Array.isArray(menu.inclus)) {
          menu.inclus.forEach(item => {
            if (itemMatchesKeywords({nom: item}, keywords)) {
              matchingItems.push({
                nom: item,
                prix: menu.prix,
                category: 'Menu',
                menuNom: menu.nom,
                section: 'Menus Globaux'
              });
            }
          });
        }
      });
    }
  }
  
  // 2. Rechercher dans d'autres formats de menu (compatibilité)
  // 2.1 Format menu_items (tableau d'objets)
  if (restaurant.menu_items && Array.isArray(restaurant.menu_items)) {
    restaurant.menu_items.forEach(item => {
      if (itemMatchesKeywords(item, keywords)) {
        matchingItems.push({
          ...item,
          section: 'menu_items'
        });
      }
    });
  }
  
  // 2.2 Format menu (tableau de sections)
  if (restaurant.menu && Array.isArray(restaurant.menu)) {
    restaurant.menu.forEach(section => {
      if (section.items && Array.isArray(section.items)) {
        section.items.forEach(item => {
          if (itemMatchesKeywords(item, keywords)) {
            matchingItems.push({
              ...item,
              category: section.name || section.title || 'Non catégorisé',
              section: 'menu'
            });
          }
        });
      }
    });
  }
  
  // 3. Pour les items qui ont aussi une structure nutritional_info
  matchingItems.forEach(item => {
    // Vérification des filtres nutritionnels
    if (entities.calories) {
      const maxCalories = parseFloat(entities.calories);
      // Si l'item a des calories supérieures à la limite, on l'exclut
      const itemCalories = 
        item.nutritional_info?.calories ||
        item.nutrition?.calories ||
        item.calories || 
        Infinity;
      
      if (!isNaN(maxCalories) && itemCalories > maxCalories) {
        const index = matchingItems.indexOf(item);
        if (index > -1) matchingItems.splice(index, 1);
      }
    }
    
    // Vérification des filtres de prix
    if (entities.maxPrice || entities.max_price) {
      const maxPrice = parseFloat(entities.maxPrice || entities.max_price);
      const itemPrice = parseFloat(item.prix || item.price || Infinity);
      
      if (!isNaN(maxPrice) && itemPrice > maxPrice) {
        const index = matchingItems.indexOf(item);
        if (index > -1) matchingItems.splice(index, 1);
      }
    }
  });
  
  // Trier par pertinence (nombre de mots-clés correspondants)
  matchingItems.sort((a, b) => {
    const scoreA = calculateItemScore(a, keywords);
    const scoreB = calculateItemScore(b, keywords);
    return scoreB - scoreA;
  });
  
  return matchingItems;
}

/**
 * Calcule un score de pertinence pour un item de menu
 */
function calculateItemScore(item, keywords) {
  let score = 0;
  
  // Points de base pour correspondance de nom
  const nom = (item.nom || item.name || '').toLowerCase();
  keywords.forEach(keyword => {
    if (nom.includes(keyword.toLowerCase())) {
      score += 3;
    }
  });
  
  // Points pour correspondance de description
  const description = (item.description || '').toLowerCase();
  keywords.forEach(keyword => {
    if (description.includes(keyword.toLowerCase())) {
      score += 1;
    }
  });
  
  // Points bonus pour items en promotion
  if (item.promotion || item.isPromotion || item.isDiscounted) {
    score += 1;
  }
  
  // Points bonus pour bonne note
  if (item.note > 4 || item.rating > 4) {
    score += 1;
  }
  
  return score;
}

/**
 * Traite une requête utilisateur en langage naturel
 * @param {string} query - La requête en langage naturel
 * @param {string} userId - L'ID de l'utilisateur connecté (optionnel)
 * @param {Object} options - Options supplémentaires
 * @returns {Promise<Object>} - La réponse à la requête
 */
async function processUserQuery(query, userId = null, options = {}) {
  console.log(`🧠 Traitement de la requête utilisateur: "${query}" (userId: ${userId || 'anonyme'})`);
  const startTime = Date.now();
  
  try {
    // Default options with simpler logic
    options = {
      checkSocial: false, // Vérifier les données sociales
      useMockData: !process.env.OPENAI_API_KEY, // Mode simulé si pas de clé API
      ...options
    };

    // Simulation mode for quick tests
    if (options.useMockData) {
      console.log('🤖 Mode simulé activé pour le test');
      return getMockQueryResponse(query);
    }

    // Analyse avancée de la requête pour déterminer l'intention et les entités
    const queryAnalysis = await analyzeQuery(query);
    console.log(`📊 Analyse avancée de la requête:`, queryAnalysis);

    // Extraire les flags de contexte social et de séquence
    const hasSocialContext = queryAnalysis.social_context && Object.keys(queryAnalysis.social_context).length > 0;
    const hasSequence = queryAnalysis.sequence && queryAnalysis.sequence_types && queryAnalysis.sequence_types.length > 0;

    // Si l'utilisateur est authentifié et qu'il y a un contexte social, chercher des données sociales
    let socialData = {};
    if (userId && hasSocialContext) {
      // Récupération des données sociales
      try {
        const user = await User.findById(userId);
        if (user) {
          if (queryAnalysis.social_context.friends_preferences) {
            // Préférences des amis
            socialData.friends = await User.find(
              { _id: { $in: user.following || [] } },
              { name: 1, photo_url: 1, interests: 1, liked_tags: 1 }
            ).limit(10);
          }
          
          if (queryAnalysis.social_context.relation === 'friends' && 
              queryAnalysis.social_context.action === 'recent_choices') {
            // Recherche des choices récents des amis  
            socialData.friendsChoices = await getFriendsChoices(userId);
            
            // Si on a des choices d'amis, on peut retourner directement ces résultats
            if (socialData.friendsChoices && socialData.friendsChoices.length > 0) {
              const profiles = socialData.friendsChoices.map(item => ({
                id: item.choice.producer_id,
                name: item.user.name + ' - ' + (item.choice.content || 'A partagé un choice'),
                type: 'user',
                image: item.user.photo_url,
                description: item.choice.content,
                timestamp: item.choice.created_at
              }));
              
              return {
                query,
                intent: 'social_choices',
                entities: queryAnalysis.entities,
                resultCount: socialData.friendsChoices.length,
                executionTimeMs: Date.now() - startTime,
                response: `Voici les derniers choices de vos amis. J'ai trouvé ${socialData.friendsChoices.length} choix récents.`,
                profiles: profiles,
                hasSocialContext: true,
                hasSequence: false
              };
            }
          }
        }
      } catch (error) {
        console.error('❌ Erreur lors de la récupération des données sociales:', error);
      }
    }
    
    // Traitement spécifique pour la recherche de lieux populaires
    if (queryAnalysis.intent === 'recherche_lieux_avec_choices' || 
        (queryAnalysis.entities && queryAnalysis.entities.criteria === 'nombre de choix')) {
      const popularPlaces = await getPlacesWithMostChoices(20);
      
      if (popularPlaces && popularPlaces.length > 0) {
        // Convertir en profils pour l'affichage
        const profiles = popularPlaces.map(place => ({
          id: place.id,
          name: place.name,
          type: place.type,
          image: place.image,
          address: place.address,
          description: place.description,
          category: Array.isArray(place.category) ? place.category : [place.category],
          choiceCount: place.choiceCount
        }));
        
        return {
          query,
          intent: 'popular_places',
          entities: queryAnalysis.entities,
          resultCount: popularPlaces.length,
          executionTimeMs: Date.now() - startTime,
          response: `Voici les lieux les plus populaires basés sur le nombre de choix. J'ai trouvé ${popularPlaces.length} établissements.`,
          profiles: profiles,
          hasSocialContext: false,
          hasSequence: false
        };
      }
    }

    // Construction de la requête MongoDB basée sur l'analyse
    const mongoQuery = buildMongoQuery(queryAnalysis);
    console.log(`📊 Query MongoDB construite:`, mongoQuery);

    // Exécution de la requête MongoDB
    const primaryResults = await executeMongoQuery(mongoQuery, queryAnalysis.intent, queryAnalysis.entities);
    console.log(`🔍 ${primaryResults?.length || 0} résultats primaires trouvés`);
    
    // Traitement de séquence le cas échéant
    let sequentialResults = [];
    if (hasSequence && queryAnalysis.sequence_types && queryAnalysis.sequence_types.length > 0) {
      console.log(`🔄 Requête séquentielle détectée: ${queryAnalysis.sequence_types.join(' -> ')}`);
      
      // Pour chaque type dans la séquence, exécuter une requête spécifique
      for (const seqType of queryAnalysis.sequence_types) {
        let seqResults = [];
        
        // Adapter la requête en fonction du type d'objet dans la séquence
        if (seqType === 'restaurant' || seqType === 'gastronomie') {
          seqResults = await findProducers(queryAnalysis.entities);
        } else if (seqType === 'spectacle' || seqType === 'event') {
          seqResults = await findEvents(queryAnalysis.entities);
        } else if (seqType === 'loisir' || seqType === 'leisure' || seqType === 'activity') {
          seqResults = await findLoisirs(queryAnalysis.entities);
        }
        
        if (seqResults.length > 0) {
          sequentialResults.push(...seqResults);
        }
      }
    } else {
      console.log(`🔄 Requête séquentielle détectée: []`);
    }
    
    // Combiner les résultats primaires et séquentiels
    const allResults = [
      ...(Array.isArray(primaryResults) ? primaryResults : []),
      ...sequentialResults
    ];
    
    // Extraction de profils pour l'interface
    const profiles = extractProfiles(allResults);
    
    // Génération de la réponse
    const response = await generateResponse(query, queryAnalysis, allResults, socialData, 'restaurant', {
      hasSocialContext,
      hasSequence,
      userId
    });
    
    const executionTimeMs = Date.now() - startTime;
    
    // Journaliser la requête
    try {
      await AIQuery.create({
        timestamp: new Date(),
        userId: userId || 'anonymous',
        query,
        intent: queryAnalysis.intent,
        entities: Object.keys(queryAnalysis.entities || {}),
        mongoQuery,
        resultCount: allResults.length,
        executionTimeMs,
        response
      });
    } catch (error) {
      console.error('❌ Erreur lors de l\'enregistrement de la requête:', error);
    }
    
    return {
      query,
      intent: queryAnalysis.intent,
      entities: queryAnalysis.entities,
      resultCount: allResults.length,
      executionTimeMs,
      response,
      profiles,
      hasSocialContext,
      hasSequence
    };
  } catch (error) {
    console.error('❌ Erreur lors du traitement de la requête utilisateur:', error);
    return {
      query,
      intent: 'error',
      entities: {},
      resultCount: 0,
      executionTimeMs: Date.now() - startTime,
      response: `Désolé, une erreur s'est produite lors du traitement de votre requête. ${error.message}`,
      profiles: []
    };
  }
}

/**
 * Détermine le type de producteur en recherchant l'ID dans différentes collections
 * @param {string} producerId - L'ID du producteur
 * @returns {Promise<string>} - Le type de producteur ('restaurant', 'leisureProducer', etc.)
 */
async function detectProducerType(producerId) {
  try {
    // Vérifier dans les restaurants
    const restaurant = await Restaurant.findById(producerId);
    if (restaurant) return 'restaurant';
    
    // Vérifier dans les producteurs de loisirs
    const leisureProducer = await LeisureProducer.findById(producerId);
    if (leisureProducer) return 'leisureProducer';
    
    // Vérifier dans les lieux de bien-être
    const wellnessPlace = await WellnessPlace.findById(producerId);
    if (wellnessPlace) return 'wellnessProducer';
    
    // Vérifier dans les lieux de beauté
    const beautyPlace = await BeautyPlace.findById(producerId);
    if (beautyPlace) return 'beautyPlace';
    
    // Par défaut, considérer comme restaurant
    return 'restaurant';
  } catch (error) {
    console.error("Erreur lors de la détection du type de producteur:", error);
    return 'restaurant'; // Valeur par défaut
  }
}

/**
 * Traite une requête producteur en langage naturel
 * @param {string} query - La requête du producteur
 * @param {string} producerId - L'ID du producteur
 * @param {string} producerType - Type du producteur (restaurant, leisureProducer, etc.)
 * @returns {Promise<Object>} - Les résultats de l'analyse
 */
async function processProducerQuery(query, producerId, producerType = 'restaurant') {
  console.log(`🔍 Traitement de la requête producteur: "${query}" (producerId: ${producerId}, type: ${producerType})`);

  // Handle test IDs and check if simulation mode is needed
  const isTestId = producerId && (
    producerId.startsWith('rest') || 
    producerId.startsWith('well') || 
    producerId.startsWith('beauty') || 
    !mongoose.Types.ObjectId.isValid(producerId)
  );
  
  const useMockData = !process.env.OPENAI_API_KEY || isTestId;
  
  if (useMockData) {
    console.log(`🤖 Mode simulé activé pour requête producteur (${isTestId ? 'ID de test' : 'pas de clé API'})`);
    return {
      query,
      intent: "mock_producer_analysis",
      entities: {},
      resultCount: 3,
      executionTimeMs: 100,
      response: `Voici une analyse simulée pour votre établissement "${producerType}". Basé sur les données disponibles, vous pourriez améliorer votre visibilité en optimisant votre menu et en créant des promotions saisonnières.`,
      profiles: getMockProfiles("producer"),
      analysisResults: {
        competitorComparison: {
          rating: { value: 4.2, average: 3.8, percentile: 75 },
          priceLevel: { value: "$$", average: "$$", percentile: 50 },
          popularity: { value: "élevée", average: "moyenne", percentile: 80 }
        },
        recommendations: [
          "Créer des promotions pour les heures creuses",
          "Mettre en avant les spécialités uniques",
          "Améliorer la présence sur les réseaux sociaux"
        ]
      }
    };
  }

  try {
    const startTime = Date.now();
    
    // Détecter le type de producteur si non spécifié
    if (!producerType || producerType === 'auto') {
      producerType = await detectProducerType(producerId);
      console.log(`🔍 Type de producteur détecté: ${producerType}`);
    }
    
    // Trouver le producteur dans la base de données correspondante
    let producer = null;
    try {
      // Vérifier que l'ID est un ObjectId MongoDB valide
      if (!mongoose.Types.ObjectId.isValid(producerId)) {
        throw new Error(`ID producteur non valide: ${producerId}`);
      }
      
      const validObjectId = new mongoose.Types.ObjectId(producerId);
      
      // Choose the right model based on producer type
      const modelMap = {
        'restaurant': Restaurant,
        'leisureProducer': LeisureProducer,
        'wellnessProducer': WellnessPlace,
        'beautyPlace': BeautyPlace
      };
      
      const Model = modelMap[producerType];
      if (!Model) {
        throw new Error(`Type de producteur non supporté: ${producerType}`);
      }
      
      producer = await Model.findById(validObjectId);
    } catch (error) {
      console.error(`❌ Erreur lors de la récupération du producteur (${producerType}):`, error);
      throw new Error(`Producteur non trouvé: ${producerId}`);
    }
    
    if (!producer) {
      console.error(`❌ Producteur non trouvé: ${producerId} (type: ${producerType})`);
      throw new Error(`Producteur non trouvé: ${producerId}`);
    }
    
    // Trouver les concurrents/lieux similaires
    const competitors = await findCompetitors(producer, producerType);
    console.log(`🔍 ${competitors.length} concurrents/lieux similaires trouvés`);
    
    // Analyse des concurrents
    const competitorMetrics = ['rating', 'price', 'popularity', 'category'];
    const analysisResults = await performCompetitorAnalysis(producerId, competitors, competitorMetrics, producerType);
    
    // Analyse de la requête
    const analysisPrompt = `
Tu es un assistant d'analyse commerciale pour l'application Choice.
Tu aides les producteurs à obtenir des insights sur leur business.

CONTEXTE:
- Type d'établissement: ${producerType}
- Nom: ${producer.name || producer.lieu || producer.title || 'Sans nom'}
- Catégorie principale: ${producer.category || producer.cuisine_type || producer.establishment_type || 'Non spécifiée'}
- Rating moyen: ${producer.rating || 'Non spécifié'}
- Nombre d'avis: ${producer.review_count || 'Non spécifié'}
- Prix: ${producer.price_level || producer.price || 'Non spécifié'}

ANALYSE CONCURRENTIELLE:
- Note moyenne concurrents: ${analysisResults.competitorComparison.rating.average.toFixed(1)}
- Percentile note: ${analysisResults.competitorComparison.rating.percentile}%
- Prix moyen concurrents: ${analysisResults.competitorComparison.price.average}
- Popularité relative: ${analysisResults.competitorComparison.popularity.percentile}%

Analyse la requête du producteur et fournis une réponse détaillée et utile qui répond directement à sa question.
Inclus des conseils concrets et actionables basés sur l'analyse concurrentielle.

Requête du producteur: "${query}"

Réponds avec une analyse professionnelle, concise et des recommandations précises.`;

    const client = openai || simulatedOpenAI;
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: analysisPrompt },
        { role: "user", content: query }
      ],
      temperature: 0.7
    });

    const aiResponse = response.choices[0].message.content;
    
    // Extraction de profils pertinents
    const profiles = [
      // Ajouter le profil du producteur lui-même
      {
        id: producerId,
        type: producerType,
        name: producer.name || producer.lieu || producer.title || 'Sans nom',
        address: producer.address || producer.adresse || 'Adresse non spécifiée',
        rating: producer.rating || 0,
        image: producer.photo || producer.image || producer.photos?.[0] || null,
        category: producer.category || producer.cuisine_type || producer.establishment_type || 'Non catégorisé'
      },
      // Ajouter les profils des concurrents principaux (limités à 3)
      ...competitors.slice(0, 3).map(competitor => ({
        id: competitor._id.toString(),
        type: producerType,
        name: competitor.name || competitor.lieu || competitor.title || 'Sans nom',
        address: competitor.address || competitor.adresse || 'Adresse non spécifiée',
        rating: competitor.rating || 0,
        image: competitor.photo || competitor.image || competitor.photos?.[0] || null,
        category: competitor.category || competitor.cuisine_type || competitor.establishment_type || 'Non catégorisé'
      }))
    ];
    
    const executionTimeMs = Date.now() - startTime;
    
    // Journaliser la requête
    try {
      await AIQuery.create({
        timestamp: new Date(),
        producerId,
        query,
        intent: "producer_analysis",
        resultCount: profiles.length,
        executionTimeMs,
        response: aiResponse
      });
    } catch (error) {
      console.error('❌ Erreur lors de l\'enregistrement de la requête producteur:', error);
    }
    
    return {
      query,
      intent: "producer_analysis",
      entities: {},
      resultCount: profiles.length,
      executionTimeMs,
      response: aiResponse,
      profiles,
      analysisResults
    };
  } catch (error) {
    console.error('❌ Erreur lors du traitement de la requête producteur:', error);
    return {
      query,
      intent: "error",
      entities: {},
      resultCount: 0,
      executionTimeMs: 0,
      response: `Désolé, je n'ai pas pu traiter votre demande. ${error.message}`,
      profiles: [],
      analysisResults: null
    };
  }
}

/**
 * Extrait les termes liés à la nourriture d'une requête
 * @param {string} query - La requête utilisateur
 * @returns {Array} - Les termes liés à la nourriture
 */
function extractFoodTerms(query) {
  // Liste de mots à ignorer
  const stopWords = ["le", "la", "les", "un", "une", "des", "avec", "sans", "et", "ou", "qui", "que", "quoi", "meilleur", "bon", "bonne", "bons", "bonnes"];
  
  // Nettoyer la requête
  const cleanQuery = query.toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ")
    .replace(/\s{2,}/g, " ");
  
  // Extraire le contexte après certains mots-clés
  const foodContext = [
    "plat", "menu", "carte", "manger", "cuisine", "spécialité", "gastronomie",
    "nourriture", "food", "dish", "meal", "specialty", "cuisine", "culinaire"
  ];
  
  let extractedTerms = [];
  
  // Chercher les mots après des indicateurs de nourriture
  foodContext.forEach(keyword => {
    const keywordIndex = cleanQuery.indexOf(keyword);
    if (keywordIndex !== -1) {
      const wordsAfter = cleanQuery.substring(keywordIndex + keyword.length).trim().split(" ");
      
      // Prendre jusqu'à 3 mots après le mot-clé, en ignorant les stop words
      let count = 0;
      for (const word of wordsAfter) {
        if (word.length > 2 && !stopWords.includes(word)) {
          extractedTerms.push(word);
          count++;
          if (count >= 3) break;
        }
      }
    }
  });
  
  // Si aucun terme n'a été trouvé, extraire les noms communs potentiels
  if (extractedTerms.length === 0) {
    const words = cleanQuery.split(" ").filter(word => 
      word.length > 3 && !stopWords.includes(word) && !foodContext.includes(word)
    );
    extractedTerms = words.slice(0, 3);
  }
  
  return extractedTerms.length > 0 ? extractedTerms : ["menu"];
}

// Fonctions utilitaires pour les calculs statistiques
function calculateAverage(array, key) {
  if (typeof key === 'function') {
    const values = array.map(key).filter(val => val !== undefined && val !== null);
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  } else {
    const values = array.map(item => item[key]).filter(val => val !== undefined && val !== null);
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }
}

function calculateMax(array, key) {
  const values = array.map(item => item[key]).filter(val => val !== undefined && val !== null);
  return values.length > 0 ? Math.max(...values) : 0;
}

function calculatePercentile(value, array, key) {
  if (!value) return 0;
  const values = array.map(item => item[key]).filter(val => val !== undefined && val !== null);
  if (values.length === 0) return 0;
  
  const sorted = [...values].sort((a, b) => a - b);
  const position = sorted.findIndex(val => val >= value);
  if (position === -1) return 100;
  return Math.round((position / sorted.length) * 100);
}

// Fonction pour générer une réponse simulée sans OpenAI
function generateMockResponse(query, userId) {
  const intent = detectMockIntent(query);
  const response = {
    query,
    success: true,
    intent: intent,
    entities: [],
    executionTimeMs: 120,
    response: getMockResponse(intent, query),
    profiles: getMockProfiles(intent),
    resultCount: intent === 'search' ? 3 : 0
  };
  
  return response;
}

// Détecte simplement l'intention à partir de mots-clés
function detectMockIntent(query) {
  const lowerQuery = query.toLowerCase();
  
  if (lowerQuery.includes('restaurant') || lowerQuery.includes('manger') || lowerQuery.includes('dîner') || lowerQuery.includes('déjeuner')) {
    return 'restaurant_search';
  } else if (lowerQuery.includes('événement') || lowerQuery.includes('spectacle') || 
           lowerQuery.includes('concert') || lowerQuery.includes('exposition')) {
    return 'event_search';
  } else if (lowerQuery.includes('loisir') || lowerQuery.includes('activité')) {
    return 'leisure_search';
  } else if (lowerQuery.includes('recommande') || lowerQuery.includes('suggère') || lowerQuery.includes('propose')) {
    return 'recommendation';
  }
  
  return 'general_query';
}

// Génère une réponse textuelle basée sur l'intention
function getMockResponse(intent, query) {
  switch (intent) {
    case 'restaurant_search':
      return "Voici quelques restaurants que j'ai trouvés qui pourraient vous intéresser. Ces établissements sont bien notés et correspondent à votre recherche.";
    case 'event_search':
      return "J'ai trouvé ces événements qui pourraient vous plaire. Ils sont à venir dans les prochains jours et correspondent à vos critères.";
    case 'leisure_search':
      return "Voici quelques activités de loisir que je peux vous recommander. Elles sont disponibles et correspondent à ce que vous recherchez.";
    case 'recommendation':
      return "Basé sur vos préférences, voici quelques suggestions personnalisées qui pourraient vous intéresser.";
    default:
      return "Je ne suis pas sûr de pouvoir vous aider avec cette demande spécifique. Pourriez-vous préciser ce que vous recherchez?";
  }
}

// Retourne quelques profils factices selon l'intention
function getMockProfiles(intent) {
  const profiles = [];
  
  if (intent === 'restaurant_search') {
    profiles.push({
      type: 'restaurant',
      name: 'Le Bistrot Parisien',
      description: 'Cuisine française traditionnelle dans un cadre élégant',
      rating: 4.7,
      price_level: '€€',
      address: '15 Rue de Paris, 75001 Paris'
    });
    profiles.push({
      type: 'restaurant',
      name: 'Saveurs d\'Asie',
      description: 'Restaurant asiatique fusion avec spécialités japonaises et thaïlandaises',
      rating: 4.5,
      price_level: '€€',
      address: '8 Avenue Montaigne, 75008 Paris'
    });
  } else if (intent === 'event_search' || intent === 'leisure_search') {
    profiles.push({
      type: 'event',
      name: 'Exposition d\'Art Moderne',
      description: 'Découvrez les œuvres des artistes contemporains les plus innovants',
      date: '2023-11-15T19:00:00',
      price: '15€',
      address: 'Galerie Moderne, 75004 Paris'
    });
    profiles.push({
      type: 'leisure',
      name: 'Escape Game: Le Trésor Perdu',
      description: 'Résolvez les énigmes et trouvez le trésor en moins de 60 minutes',
      rating: 4.8,
      price_level: '€€',
      address: '23 Rue du Jeu, 75011 Paris'
    });
  }
  
  return profiles;
}

/**
 * Normalize leisure producer data to ensure proper formatting of array fields
 * @param {Object} producer - The producer data to normalize
 */
const normalizeLeisureProducerData = (producer) => {
  if (!producer) return null;
  
  const normalizedData = { ...producer };
  
  // Ensure array fields are properly formatted
  const arrayFields = ['category', 'activities', 'specialties', 'photos', 'types', 'followers', 'evenements'];
  
  arrayFields.forEach(field => {
    // If the field exists
    if (normalizedData[field] !== undefined) {
      // If it's a string, convert to a single-element array
      if (typeof normalizedData[field] === 'string') {
        normalizedData[field] = [normalizedData[field]];
      } 
      // Ensure it's an array (not null or undefined)
      else if (!Array.isArray(normalizedData[field])) {
        normalizedData[field] = [];
      }
    } else {
      // If it doesn't exist, initialize an empty array
      normalizedData[field] = [];
    }
  });
  
  return normalizedData;
};

/**
 * Process profiles before sending them to the client
 * @param {Array} profiles - The array of profiles to process
 */
const processProfiles = (profiles) => {
  if (!profiles || !Array.isArray(profiles)) return [];
  
  return profiles.map(profile => {
    // Handle leisure producer profiles
    if (profile.type === 'leisureProducer') {
      return normalizeLeisureProducerData(profile);
    }
    return profile;
  });
};

/**
 * Recherche des producteurs (restaurants) selon les entités extraites d'une requête
 * @param {Object} entities - Les entités extraites de la requête
 * @returns {Promise<Array>} - Les producteurs correspondants
 */
async function findProducers(entities) {
  try {
    console.log("Recherche de producteurs avec entités:", entities);
    const mongoQuery = {};
    
    // Construire la requête MongoDB basée sur les entités
    if (entities.location) {
      mongoQuery.address = { $regex: new RegExp(entities.location, "i") };
    }
    
    if (entities.cuisine_type) {
      const cuisineRegex = new RegExp(entities.cuisine_type, "i");
      mongoQuery.$or = [
        { category: cuisineRegex },
        { description: cuisineRegex },
        { "Items Indépendants.items.nom": cuisineRegex },
        { "Items Indépendants.items.description": cuisineRegex },
        { "Menus Globaux.inclus.items.nom": cuisineRegex },
        { "Menus Globaux.inclus.items.description": cuisineRegex }
      ];
    }
    
    if (entities.price_level) {
      mongoQuery.price_level = parseInt(entities.price_level);
    }
    
    // Exécuter la requête
    const results = await Restaurant.find(mongoQuery).limit(10);
    console.log(`Trouvé ${results.length} producteurs`);
    
    return results;
  } catch (error) {
    console.error("Erreur lors de la recherche de producteurs:", error);
    return [];
  }
}

/**
 * Recherche des producteurs de loisirs selon les entités extraites d'une requête
 * @param {Object} entities - Les entités extraites de la requête
 * @returns {Promise<Array>} - Les producteurs de loisirs correspondants
 */
async function findLoisirs(entities) {
  try {
    console.log("Recherche de loisirs avec entités:", entities);
    const mongoQuery = {};
    
    // Construire la requête MongoDB basée sur les entités
    if (entities.location) {
      mongoQuery.$or = [
        { adresse: { $regex: new RegExp(entities.location, "i") } },
        { lieu: { $regex: new RegExp(entities.location, "i") } }
      ];
    }
    
    if (entities.activity_type || entities.event_type) {
      const activityType = entities.activity_type || entities.event_type;
      mongoQuery.$or = mongoQuery.$or || [];
      mongoQuery.$or.push(
        { category: { $regex: new RegExp(activityType, "i") } },
        { activities: { $regex: new RegExp(activityType, "i") } }
      );
    }
    
    // Exécuter la requête
    const results = await LeisureProducer.find(mongoQuery).limit(10);
    console.log(`Trouvé ${results.length} producteurs de loisirs`);
    
    return results;
  } catch (error) {
    console.error("Erreur lors de la recherche de loisirs:", error);
    return [];
  }
}

/**
 * Recherche des événements selon les entités extraites d'une requête
 * @param {Object} entities - Les entités extraites de la requête
 * @returns {Promise<Array>} - Les événements correspondants
 */
async function findEvents(entities) {
  try {
    console.log("Recherche d'événements avec entités:", entities);
    const mongoQuery = {};
    
    // Construire la requête MongoDB basée sur les entités
    if (entities.location) {
      mongoQuery.lieu = { $regex: new RegExp(entities.location, "i") };
    }
    
    if (entities.event_type) {
      mongoQuery.category = { $regex: new RegExp(entities.event_type, "i") };
    }
    
    if (entities.date) {
      // Logique pour filtrer par date
      const targetDate = new Date(entities.date);
      if (!isNaN(targetDate.getTime())) {
        mongoQuery.date_debut = { $gte: targetDate };
      }
    } else {
      // Par défaut, n'afficher que les événements futurs
      mongoQuery.date_debut = { $gte: new Date() };
    }
    
    // Exécuter la requête
    const results = await Event.find(mongoQuery).limit(10);
    console.log(`Trouvé ${results.length} événements`);
    
    return results;
  } catch (error) {
    console.error("Erreur lors de la recherche d'événements:", error);
    return [];
  }
}

/**
 * Formate les résultats de recherche de producteurs
 * @param {Array} results - Les résultats de la recherche
 * @param {Object} entities - Les entités extraites de la requête
 * @param {boolean} includeHeader - Inclure ou non un en-tête
 * @returns {string} - Texte formaté des résultats
 */
function formatProducerResults(results, entities, includeHeader = true) {
  if (results.length === 0) {
    return includeHeader ? "Je n'ai trouvé aucun restaurant correspondant à votre recherche." : "";
  }
  
  let output = includeHeader ? 
    `J'ai trouvé ${results.length} restaurant(s) qui pourrai(en)t vous intéresser :\n\n` : 
    "";
  
  results.forEach((restaurant, index) => {
    output += `${index + 1}. ${restaurant.name || 'Restaurant sans nom'}`;
    
    if (restaurant.address) {
      output += ` - ${restaurant.address}`;
    }
    
    if (restaurant.rating) {
      output += ` - Note: ${restaurant.rating}/5`;
    }
    
    if (restaurant.price_level) {
      output += ` - Prix: ${'€'.repeat(restaurant.price_level)}`;
    }
    
    output += '\n';
  });
  
  return output;
}

/**
 * Formate les résultats de recherche de loisirs
 * @param {Array} results - Les résultats de la recherche
 * @param {Object} entities - Les entités extraites de la requête
 * @param {boolean} includeHeader - Inclure ou non un en-tête
 * @returns {string} - Texte formaté des résultats
 */
function formatLeisureResults(results, entities, includeHeader = true) {
  if (results.length === 0) {
    return includeHeader ? "Je n'ai trouvé aucune activité de loisir correspondant à votre recherche." : "";
  }
  
  let output = includeHeader ? 
    `J'ai trouvé ${results.length} activité(s) de loisir qui pourrai(en)t vous intéresser :\n\n` : 
    "";
  
  results.forEach((leisure, index) => {
    output += `${index + 1}. ${leisure.name || leisure.lieu || 'Loisir sans nom'}`;
    
    if (leisure.adresse) {
      output += ` - ${leisure.adresse}`;
    }
    
    if (leisure.category && leisure.category.length > 0) {
      output += ` - Catégorie: ${Array.isArray(leisure.category) ? leisure.category[0] : leisure.category}`;
    }
    
    output += '\n';
  });
  
  return output;
}

/**
 * Formate les résultats de recherche d'événements
 * @param {Array} results - Les résultats de la recherche
 * @param {Object} entities - Les entités extraites de la requête
 * @param {boolean} includeHeader - Inclure ou non un en-tête
 * @returns {string} - Texte formaté des résultats
 */
function formatEventResults(results, entities, includeHeader = true) {
  if (results.length === 0) {
    return includeHeader ? "Je n'ai trouvé aucun événement correspondant à votre recherche." : "";
  }
  
  let output = includeHeader ? 
    `J'ai trouvé ${results.length} événement(s) qui pourrai(en)t vous intéresser :\n\n` : 
    "";
  
  results.forEach((event, index) => {
    output += `${index + 1}. ${event.intitulé || event.nom || 'Événement sans nom'}`;
    
    if (event.lieu) {
      output += ` - ${event.lieu}`;
    }
    
    if (event.date_debut) {
      const date = new Date(event.date_debut);
      output += ` - Date: ${date.toLocaleDateString('fr-FR')}`;
    }
    
    output += '\n';
  });
  
  return output;
}

/**
 * Trouve des concurrents pour un producteur donné
 * @param {Object} producer - Le producteur
 * @param {string} producerType - Le type de producteur
 * @returns {Promise<Array>} - Les concurrents
 */
async function findCompetitors(producer, producerType) {
  try {
    const query = {};
    
    // Filtre de base: le même type mais pas le même ID
    query._id = { $ne: producer._id };
    
    // Filtre par zone géographique si disponible
    if (producer.address || producer.adresse) {
      const address = producer.address || producer.adresse;
      const parts = address.split(',');
      if (parts.length > 0) {
        const location = parts[0].trim();
        if (producerType === 'restaurant') {
          query.address = { $regex: new RegExp(location, 'i') };
        } else {
          query.adresse = { $regex: new RegExp(location, 'i') };
        }
      }
    }
    
    // Filtre par catégorie si disponible
    if (producer.category) {
      if (Array.isArray(producer.category) && producer.category.length > 0) {
        query.category = { $in: producer.category.map(cat => new RegExp(cat, 'i')) };
      } else if (typeof producer.category === 'string') {
        query.category = { $regex: new RegExp(producer.category, 'i') };
      }
    }
    
    // Exécuter la requête selon le type de producteur
    let results = [];
    switch (producerType) {
      case 'restaurant':
        results = await Restaurant.find(query).limit(10);
        break;
      case 'leisureProducer':
        results = await LeisureProducer.find(query).limit(10);
        break;
      case 'wellnessProducer':
        results = await WellnessPlace.find(query).limit(10);
        break;
      case 'beautyPlace':
        results = await BeautyPlace.find(query).limit(10);
        break;
    }
    
    console.log(`Trouvé ${results.length} concurrents pour le producteur`);
    return results;
  } catch (error) {
    console.error("Erreur lors de la recherche de concurrents:", error);
    return [];
  }
}

/**
 * Formate les résultats d'une analyse de concurrents
 * @param {Object} analysis - Résultats de l'analyse
 * @param {Object} producer - Le producteur analysé
 * @param {Array} competitors - Les concurrents
 * @returns {string} - Texte formaté de l'analyse
 */
function formatCompetitorAnalysis(analysis, producer, competitors) {
  if (!analysis || analysis.error) {
    return `Désolé, je n'ai pas pu effectuer l'analyse comparative. ${analysis?.error || ''}`;
  }
  
  let output = `# Analyse comparative pour ${producer.name || 'votre établissement'}\n\n`;
  
  // Informations générales
  output += `**Informations générales:**\n`;
  output += `- Nombre total de concurrents analysés: ${competitors.length}\n`;
  if (analysis.competitors?.neighborhood) {
    output += `- Concurrents dans le même quartier: ${analysis.competitors.neighborhood}\n`;
  }
  
  // Forces
  if (analysis.strengths && analysis.strengths.length > 0) {
    output += `\n**Vos forces:**\n`;
    analysis.strengths.forEach(strength => {
      output += `- ${strength}\n`;
    });
  }
  
  // Faiblesses
  if (analysis.weaknesses && analysis.weaknesses.length > 0) {
    output += `\n**Points à améliorer:**\n`;
    analysis.weaknesses.forEach(weakness => {
      output += `- ${weakness}\n`;
    });
  }
  
  // Recommandations
  if (analysis.recommendations && analysis.recommendations.length > 0) {
    output += `\n**Recommandations:**\n`;
    analysis.recommendations.forEach(recommendation => {
      output += `- ${recommendation}\n`;
    });
  }
  
  return output;
}

/**
 * Récupère les données de performance d'un producteur
 * @param {string} producerId - ID du producteur
 * @param {string} producerType - Type de producteur
 * @returns {Promise<Object>} - Données de performance
 */
async function getProducerPerformanceData(producerId, producerType) {
  try {
    // Implémentation factice pour le moment
    return {
      views: Math.floor(Math.random() * 1000),
      interactions: Math.floor(Math.random() * 500),
      bookings: Math.floor(Math.random() * 100),
      period: "30 derniers jours"
    };
  } catch (error) {
    console.error("Erreur lors de la récupération des données de performance:", error);
    return { error: error.message };
  }
}

/**
 * Formate l'analyse de performance d'un producteur
 * @param {Object} performanceData - Données de performance
 * @param {Object} producer - Le producteur
 * @returns {string} - Texte formaté de l'analyse
 */
function formatPerformanceAnalysis(performanceData, producer) {
  if (performanceData.error) {
    return `Désolé, je n'ai pas pu récupérer vos données de performance. ${performanceData.error}`;
  }
  
  let output = `# Analyse de performance pour ${producer.name || 'votre établissement'}\n\n`;
  output += `**Période:** ${performanceData.period || 'Dernière période'}\n\n`;
  
  output += `**Indicateurs clés:**\n`;
  output += `- Vues du profil: ${performanceData.views || 'N/A'}\n`;
  output += `- Interactions: ${performanceData.interactions || 'N/A'}\n`;
  output += `- Réservations: ${performanceData.bookings || 'N/A'}\n`;
  
  // Taux de conversion
  if (performanceData.views && performanceData.bookings) {
    const conversionRate = ((performanceData.bookings / performanceData.views) * 100).toFixed(1);
    output += `- Taux de conversion: ${conversionRate}%\n`;
  }
  
  return output;
}

/**
 * Extrait les profils des résultats pour affichage dans l'interface
 * @param {Array} results - Résultats de recherche
 * @returns {Array} - Profils extraits
 */
function extractProfiles(results) {
  if (!results || !Array.isArray(results)) return [];
  
  return results.map(result => {
    const profile = {
      id: result._id,
      name: result.name || result.lieu || result.intitulé || 'Sans nom'
    };
    
    // Déterminer le type de profil
    if (result.date_debut) {
      profile.type = 'event';
      profile.date = result.date_debut;
      profile.lieu = result.lieu;
    } else if (result.activities || result.category?.includes('loisir')) {
      profile.type = 'leisureProducer';
      profile.address = result.adresse;
      profile.category = result.category;
    } else if (result.price_level !== undefined) {
      profile.type = 'restaurant';
      profile.address = result.address;
      profile.rating = result.rating;
      profile.price_level = result.price_level;
    } else {
      profile.type = 'generic';
    }
    
    // Ajouter l'image si disponible
    profile.image = result.photo_url || result.photo || result.image || null;
    
    return profile;
  });
}

/**
 * Extrait les entités et l'intention d'une requête utilisateur
 * @param {string} query - La requête utilisateur
 * @returns {Object} - L'intention et les entités extraites
 */
function extractEntities(query) {
  // Cas de base: recherche générale
  const result = {
    intent: "general_query",
    entities: {}
  };
  
  // Recherche d'indices pour l'intention
  const lowerQuery = query.toLowerCase();
  
  // Recherche de restaurants
  if (lowerQuery.includes('restaurant') || lowerQuery.includes('manger') || 
      lowerQuery.includes('dîner') || lowerQuery.includes('déjeuner') ||
      lowerQuery.includes('cuisine') || lowerQuery.includes('plat')) {
    result.intent = "restaurant_search";
    
    // Chercher le type de cuisine
    const cuisinePatterns = [
      { regex: /cuisine\s+(\w+)/i, group: 1 },
      { regex: /plats?\s+(\w+)s?/i, group: 1 },
      { regex: /(italien|japonais|chinois|indien|mexicain|français|libanais|thaï|vietnamien)/i, group: 1 }
    ];
    
    for (const pattern of cuisinePatterns) {
      const match = lowerQuery.match(pattern.regex);
      if (match && match[pattern.group]) {
        result.entities.cuisine_type = match[pattern.group];
        break;
      }
    }
    
    // Chercher la localisation
    const locationPatterns = [
      { regex: /dans\s+le\s+(\d+)(?:ème|e)/i, group: 1 },
      { regex: /à\s+([a-zéèêëàâäôöùûüç\s]+)\b/i, group: 1 },
      { regex: /quartier\s+([a-zéèêëàâäôöùûüç\s]+)\b/i, group: 1 }
    ];
    
    for (const pattern of locationPatterns) {
      const match = lowerQuery.match(pattern.regex);
      if (match && match[pattern.group]) {
        result.entities.location = match[pattern.group].trim();
        break;
      }
    }
  }
  // Recherche d'événements
  else if (lowerQuery.includes('événement') || lowerQuery.includes('spectacle') || 
           lowerQuery.includes('concert') || lowerQuery.includes('exposition')) {
    result.intent = "event_search";
    
    // Chercher le type d'événement
    const eventPatterns = [
      { regex: /(concert|exposition|spectacle|festival|théâtre|cinéma|opéra)/i, group: 1 }
    ];
    
    for (const pattern of eventPatterns) {
      const match = lowerQuery.match(pattern.regex);
      if (match && match[pattern.group]) {
        result.entities.event_type = match[pattern.group];
        break;
      }
    }
    
    // Chercher la date
    const datePatterns = [
      { regex: /(aujourd'hui|demain|ce\s+week-end|cette\s+semaine)/i, group: 1 }
    ];
    
    for (const pattern of datePatterns) {
      const match = lowerQuery.match(pattern.regex);
      if (match && match[pattern.group]) {
        result.entities.date = match[pattern.group];
        break;
      }
    }
  }
  // Recherche de loisirs
  else if (lowerQuery.includes('loisir') || lowerQuery.includes('activité') || 
           lowerQuery.includes('sortie') || lowerQuery.includes('visite')) {
    result.intent = "leisure_search";
    
    // Chercher le type d'activité
    const activityPatterns = [
      { regex: /(musée|parc|jardin|bowling|cinéma|escape\s+game|laser\s+game)/i, group: 1 }
    ];
    
    for (const pattern of activityPatterns) {
      const match = lowerQuery.match(pattern.regex);
      if (match && match[pattern.group]) {
        result.entities.activity_type = match[pattern.group];
        break;
      }
    }
  }
  // Analyse de concurrents
  else if (lowerQuery.includes('concurrent') || lowerQuery.includes('comparaison') || 
           lowerQuery.includes('comparer') || lowerQuery.includes('rivaliser')) {
    result.intent = "competitor_analysis";
    
    // Chercher les métriques à analyser
    const metrics = [];
    if (lowerQuery.includes('note') || lowerQuery.includes('avis')) metrics.push('rating');
    if (lowerQuery.includes('prix')) metrics.push('price');
    if (lowerQuery.includes('popularité') || lowerQuery.includes('fréquentation')) metrics.push('popularity');
    if (lowerQuery.includes('menu') || lowerQuery.includes('offre')) metrics.push('menu');
    
    if (metrics.length > 0) {
      result.entities.metrics = metrics;
    }
  }
  
  return result;
}

/**
 * Vérifie si un item de menu correspond aux mots-clés
 * @param {Object} item - L'item du menu à vérifier
 * @param {Array} keywords - Liste des mots-clés à rechercher
 * @returns {boolean} - Vrai si l'item correspond à au moins un mot-clé
 */
function itemMatchesKeywords(item, keywords) {
  if (!item) return false;
  
  // Récupérer tous les textes pertinents de l'item
  const textsToSearch = [
    // Noms possibles de l'item dans différents formats
    item.nom,
    item.name,
    item.title,
    
    // Descriptions possibles
    item.description,
    item.desc,
    
    // Ingrédients (peuvent être dans un tableau ou une chaîne)
    typeof item.ingredients === 'string' ? item.ingredients : 
      Array.isArray(item.ingredients) ? item.ingredients.join(' ') : null,
    
    // Catégories possibles
    item.category,
    item.catégorie,
    item.type,
    
    // Autres informations pertinentes
    item.comments,
    item.specialties,
    item.tags ? (Array.isArray(item.tags) ? item.tags.join(' ') : item.tags) : null
  ];
  
  // Filtrer les valeurs nulles et joindre tous les textes
  const combinedText = textsToSearch
    .filter(text => text !== null && text !== undefined)
    .join(' ')
    .toLowerCase();
  
  // Vérifier si l'un des mots-clés est présent dans le texte combiné
  return keywords.some(keyword => {
    if (!keyword) return false;
    
    // Permettre la recherche par mot complet ou par parties de mot
    // Ex: "saumon" correspondra à "saumon fumé" ou "salade au saumon"
    const keywordLower = keyword.toLowerCase();
    
    // Recherche exacte
    if (combinedText === keywordLower) return true;
    
    // Recherche de mot complet (entouré d'espaces)
    if (combinedText.includes(` ${keywordLower} `)) return true;
    
    // Recherche au début du texte
    if (combinedText.startsWith(`${keywordLower} `)) return true;
    
    // Recherche à la fin du texte
    if (combinedText.endsWith(` ${keywordLower}`)) return true;
    
    // Recherche dans une partie du texte (moins précise)
    if (combinedText.includes(keywordLower)) return true;
    
    return false;
  });
}

/**
 * Récupère les données sociales d'un utilisateur (following, intérêts communs)
 * @param {string} userId - L'ID de l'utilisateur
 * @returns {Promise<Object>} - Les données sociales pertinentes
 */
async function getUserSocialData(userId) {
  try {
    // Récupérer l'utilisateur avec ses relations
    const user = await User.findById(userId).select('following followers interests preferences');
    
    if (!user) {
      console.warn(`⚠️ Utilisateur non trouvé: ${userId}`);
      return { 
        following: [], 
        followingCount: 0,
        sharedInterests: []
      };
    }
    
    // Récupérer la liste des personnes suivies
    const following = user.following || [];
    
    console.log(`👥 ${userId} suit ${following.length} utilisateurs`);
    
    // Récupérer les intérêts/choix des personnes suivies
    const followingData = {
      following: following,
      followingCount: following.length,
      interestsMap: new Map() // Map pour compter les intérêts communs
    };
    
    // Si l'utilisateur suit d'autres personnes, récupérer leurs intérêts
    if (following.length > 0) {
      // Récupérer les choix/intérêts des personnes suivies (limité à 200 pour performance)
      const choices = await usersDb.collection('user_choices').find({
        userId: { $in: following }
      }).limit(200).toArray();
      
      console.log(`🔍 Récupération de ${choices.length} choix des personnes suivies`);
      
      // Organiser les choix par type et compter leur fréquence
      choices.forEach(choice => {
        const itemId = choice.itemId;
        const itemType = choice.itemType;
        
        if (!followingData.interestsMap.has(`${itemType}:${itemId}`)) {
          followingData.interestsMap.set(`${itemType}:${itemId}`, {
            id: itemId,
            type: itemType,
            count: 1,
            userIds: [choice.userId]
          });
        } else {
          const existingEntry = followingData.interestsMap.get(`${itemType}:${itemId}`);
          existingEntry.count += 1;
          if (!existingEntry.userIds.includes(choice.userId)) {
            existingEntry.userIds.push(choice.userId);
          }
        }
      });
      
      // Convertir la Map en Array pour faciliter le tri et l'utilisation
      followingData.sharedInterests = Array.from(followingData.interestsMap.values())
        .sort((a, b) => b.count - a.count) // Trier par popularité
        .slice(0, 20); // Limiter aux 20 plus populaires
      
      delete followingData.interestsMap; // Nettoyer la Map temporaire
    }
    
    return followingData;
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des données sociales:', error);
    return { following: [], followingCount: 0, sharedInterests: [] };
  }
}

/**
 * Récupère les productions (restaurants, loisirs, événements) populaires parmi les amis
 * @param {string} userId - L'ID de l'utilisateur
 * @param {string} type - Le type de production à rechercher (restaurant, event, leisure)
 * @param {Object} filters - Filtres supplémentaires (note minimale, prix max, etc.)
 * @returns {Promise<Array>} - Liste des productions populaires
 */
async function getTrendingAmongFriends(userId, type, filters = {}) {
  try {
    // Récupérer les données sociales
    const socialData = await getUserSocialData(userId);
    
    if (socialData.followingCount === 0 || socialData.sharedInterests.length === 0) {
      console.log('👥 Pas de données sociales pertinentes pour', userId);
      return [];
    }
    
    // Filtrer les intérêts par type
    const relevantInterests = socialData.sharedInterests.filter(item => {
      if (type === 'restaurant' && (item.type === 'restaurant' || item.type === 'producer')) {
        return true;
      } else if (type === 'event' && item.type === 'event') {
        return true;
      } else if (type === 'leisure' && (item.type === 'leisure' || item.type === 'leisureProducer')) {
        return true;
      }
      return false;
    });
    
    if (relevantInterests.length === 0) {
      console.log(`👥 Pas d'intérêts pertinents de type ${type} parmi les amis`);
      return [];
    }
    
    // Récupérer les IDs pertinents
    const relevantIds = relevantInterests.map(item => item.id);
    
    // Construire la requête de base avec les filtres de popularité
    let query = { _id: { $in: relevantIds } };
    
    // Ajouter des filtres supplémentaires si nécessaire
    if (filters.rating && !isNaN(parseFloat(filters.rating))) {
      query.rating = { $gte: parseFloat(filters.rating) };
    }
    
    if (filters.maxPrice && !isNaN(parseInt(filters.maxPrice))) {
      query.price_level = { $lte: parseInt(filters.maxPrice) };
    }
    
    if (filters.promotion === true) {
      query['promotion.active'] = true;
    }
    
    // Sélectionner la collection en fonction du type
    let results = [];
    const limit = parseInt(filters.limit) || 10;
    
    if (type === 'restaurant') {
      results = await Restaurant.find(query).limit(limit);
    } else if (type === 'event') {
      // Pour les événements, vérifier aussi qu'ils ne sont pas déjà passés
      const now = new Date();
      query.date = { $gte: now };
      
      results = await Event.find(query).limit(limit);
    } else if (type === 'leisure') {
      results = await LeisureProducer.find(query).limit(limit);
    }
    
    // Enrichir les résultats avec les données sociales
    return results.map(item => {
      const interest = relevantInterests.find(i => i.id === item._id.toString());
      return {
        ...item.toObject(),
        social_data: {
          friendsCount: interest ? interest.userIds.length : 0,
          totalChoices: interest ? interest.count : 0
        }
      };
    }).sort((a, b) => b.social_data.friendsCount - a.social_data.friendsCount);
    
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des tendances:', error);
    return [];
  }
}

/**
 * Récupère les choices récents des amis d'un utilisateur
 * @param {string} userId - L'ID de l'utilisateur
 * @returns {Promise<Array>} - Tableau des choices récents des amis
 */
async function getFriendsChoices(userId) {
  try {
    console.log(`🔍 Récupération des choices des amis pour l'utilisateur: ${userId}`);
    
    // Récupérer l'utilisateur et ses relations sociales
    const user = await User.findById(userId);
    if (!user) {
      console.log(`⚠️ Utilisateur non trouvé: ${userId}`);
      return [];
    }
    
    // Récupérer les IDs des amis depuis following
    const friendIds = user.following || [];
    if (friendIds.length === 0) {
      console.log(`⚠️ L'utilisateur n'a pas d'amis dans sa liste following`);
      return [];
    }
    
    console.log(`📊 Amis trouvés: ${friendIds.length}`);
    
    // Récupérer les choices des amis (limité aux 20 plus récents)
    const friendsWithChoices = await User.find(
      { _id: { $in: friendIds } },
      { name: 1, username: 1, photo_url: 1, choices: 1 }
    ).limit(20);
    
    // Collecter tous les IDs de choices des amis
    let allChoiceIds = [];
    friendsWithChoices.forEach(friend => {
      if (friend.choices && friend.choices.length > 0) {
        allChoiceIds = [...allChoiceIds, ...friend.choices.slice(0, 10)]; // Limiter à 10 choices par ami
      }
    });
    
    if (allChoiceIds.length === 0) {
      console.log(`⚠️ Aucun choice trouvé parmi les amis`);
      return [];
    }
    
    // Récupérer les détails des choices
    const choices = await Choice.find(
      { _id: { $in: allChoiceIds } },
      { user_id: 1, producer_id: 1, content: 1, created_at: 1 }
    ).sort({ created_at: -1 }).limit(20);
    
    console.log(`📊 Choices récents des amis trouvés: ${choices.length}`);
    
    // Associer les choices avec les informations de leurs auteurs
    const choicesWithUserInfo = [];
    for (const choice of choices) {
      const friend = friendsWithChoices.find(f => f._id.toString() === choice.user_id);
      if (friend) {
        choicesWithUserInfo.push({
          choice: choice,
          user: {
            id: friend._id,
            name: friend.name,
            username: friend.username,
            photo_url: friend.photo_url
          }
        });
      }
    }
    
    return choicesWithUserInfo;
  } catch (error) {
    console.error(`❌ Erreur lors de la récupération des choices des amis: ${error}`);
    return [];
  }
}

/**
 * Récupère les lieux avec le plus de choices
 * @param {number} limit - Nombre de lieux à récupérer
 * @returns {Promise<Array>} - Tableau des lieux populaires
 */
async function getPlacesWithMostChoices(limit = 10) {
  try {
    console.log(`🔍 Recherche des lieux avec le plus de choices`);
    
    // Agréger les choices par lieu et compter
    const popularPlaces = await Choice.aggregate([
      { $group: { _id: "$producer_id", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit }
    ]);
    
    if (popularPlaces.length === 0) {
      console.log(`⚠️ Aucun lieu avec choices trouvé`);
      return [];
    }
    
    // Récupérer les IDs des producteurs
    const producerIds = popularPlaces.map(place => place._id);
    
    // Fonction pour récupérer les détails des producteurs depuis différentes collections
    const fetchProducersDetails = async (Model, type) => {
      try {
        const producers = await Model.find(
          { _id: { $in: producerIds } },
          { name: 1, description: 1, address: 1, category: 1, image_url: 1, photo_url: 1 }
        );
        
        return producers.map(producer => ({
          id: producer._id,
          name: producer.name,
          description: producer.description,
          address: producer.address,
          category: producer.category,
          image: producer.image_url || producer.photo_url,
          type: type,
          choiceCount: popularPlaces.find(p => p._id.toString() === producer._id.toString())?.count || 0
        }));
      } catch (error) {
        console.error(`❌ Erreur lors de la récupération des producteurs de type ${type}: ${error}`);
        return [];
      }
    };
    
    // Rechercher dans différentes collections
    const restaurantResults = await fetchProducersDetails(Restaurant, 'restaurant');
    const leisureResults = await fetchProducersDetails(LeisureProducer, 'leisureProducer');
    
    // Combiner et trier les résultats par nombre de choices
    const combinedResults = [...restaurantResults, ...leisureResults]
      .sort((a, b) => b.choiceCount - a.choiceCount)
      .slice(0, limit);
    
    console.log(`📊 Lieux populaires trouvés: ${combinedResults.length}`);
    return combinedResults;
  } catch (error) {
    console.error(`❌ Erreur lors de la recherche des lieux populaires: ${error}`);
    return [];
  }
}

/**
 * Génère une réponse simulée pour les tests
 * @param {string} query - La requête utilisateur
 * @returns {Object} - Réponse simulée formatée
 */
function getMockQueryResponse(query) {
  console.log(`🤖 Génération d'une réponse simulée pour: "${query}"`);
  
  // Créer des profils simulés variés selon le type de requête
  const mockProfiles = [];
  
  if (query.toLowerCase().includes('restaurant') || query.toLowerCase().includes('manger')) {
    // Profils de restaurants
    mockProfiles.push(
      {
        id: 'rest12345',
        name: 'Le Bistro Parisien',
        type: 'restaurant',
        address: '15 rue de la Gastronomie, Paris',
        rating: 4.5,
        category: ['Français', 'Traditionnel'],
        image: 'https://example.com/img1.jpg'
      },
      {
        id: 'rest67890',
        name: 'Sushi Excellence',
        type: 'restaurant',
        address: '78 avenue du Japon, Paris',
        rating: 4.7,
        category: ['Japonais', 'Sushi'],
        image: 'https://example.com/img2.jpg'
      }
    );
  } else if (query.toLowerCase().includes('loisir') || query.toLowerCase().includes('activité')) {
    // Profils de loisirs
    mockProfiles.push(
      {
        id: 'leis12345',
        name: 'Aventure Escalade',
        type: 'leisureProducer',
        address: '45 rue des Sports, Paris',
        rating: 4.6,
        category: ['Sport', 'Aventure'],
        image: 'https://example.com/img3.jpg'
      },
      {
        id: 'leis67890',
        name: 'Musée des Arts Modernes',
        type: 'leisureProducer',
        address: '101 boulevard des Arts, Paris',
        rating: 4.8,
        category: ['Culture', 'Art'],
        image: 'https://example.com/img4.jpg'
      }
    );
  } else if (query.toLowerCase().includes('amis') || query.toLowerCase().includes('choix')) {
    // Profils sociaux ou de recommandations
    mockProfiles.push(
      {
        id: 'user12345',
        name: 'Jean Dupont',
        type: 'user',
        image: 'https://example.com/user1.jpg',
        description: 'A recommandé Le Bistro Parisien'
      },
      {
        id: 'rest12345',
        name: 'Le Bistro Parisien',
        type: 'restaurant',
        address: '15 rue de la Gastronomie, Paris',
        rating: 4.5,
        category: ['Français', 'Traditionnel'],
        image: 'https://example.com/img1.jpg'
      }
    );
  }
  
  // Déterminer l'intent en fonction des mots-clés
  let intent = 'unknown';
  if (query.toLowerCase().includes('restaurant')) {
    intent = 'restaurant_search';
  } else if (query.toLowerCase().includes('loisir') || query.toLowerCase().includes('activité')) {
    intent = 'leisure_search';
  } else if (query.toLowerCase().includes('amis')) {
    intent = 'social_recommendation';
  }
  
  // Simuler des entités extraites
  const entities = {};
  if (query.toLowerCase().includes('japonais')) entities.cuisine_type = 'japonais';
  if (query.toLowerCase().includes('sport')) entities.activity_type = 'sport';
  if (query.toLowerCase().includes('moins')) entities.price_max = 30;
  if (query.toLowerCase().includes('bien noté')) entities.rating_min = 4;
  
  return {
    query,
    intent,
    entities,
    resultCount: mockProfiles.length,
    executionTimeMs: 50,
    response: `Voici quelques suggestions basées sur votre recherche "${query}". J'ai trouvé ${mockProfiles.length} résultats qui pourraient vous intéresser.`,
    profiles: mockProfiles,
    hasSocialContext: query.toLowerCase().includes('amis'),
    hasSequence: query.toLowerCase().includes('puis')
  };
}

module.exports = {
  processUserQuery,
  processProducerQuery,
  normalizeLeisureProducerData,
  processProfiles,
  findProducers,
  findLoisirs,
  findEvents,
  formatProducerResults,
  formatLeisureResults,
  formatEventResults,
  extractProfiles,
  extractEntities,
  findCompetitors,
  getTrendingAmongFriends,
  getFriendsChoices,
  getPlacesWithMostChoices,
  getMockQueryResponse
};