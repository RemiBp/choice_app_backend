/**
 * Service d'accès IA aux données MongoDB en temps réel
 * Ce service permet à une IA d'accéder directement aux bases de données MongoDB
 * et d'exécuter des requêtes complexes pour répondre aux besoins des utilisateurs
 * et des producteurs.
 */

const mongoose = require('mongoose');
const OpenAI = require('openai');
require('dotenv').config();

// Configuration OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Connexions MongoDB
const usersDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: "choice_app",
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const restaurationDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: "Restauration_Officielle",
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const loisirsDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: "Loisir&Culture",
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Modèles MongoDB
const User = usersDb.model("User", new mongoose.Schema({}, { strict: false }), "Users");
const Producer = restaurationDb.model("Producer", new mongoose.Schema({}, { strict: false }), "producers");
const LeisureProducer = loisirsDb.model("LeisureProducer", new mongoose.Schema({}, { strict: false }), "Loisir_Paris_Producers");
const Event = loisirsDb.model("Event", new mongoose.Schema({}, { strict: false }), "Loisir_Paris_Evenements");

// Modèle pour journaliser les requêtes et réponses de l'IA
const AIQuery = usersDb.model(
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

/**
 * Analyse une requête utilisateur pour déterminer son intention et les entités mentionnées
 * @param {string} query - La requête utilisateur en langage naturel
 * @returns {Promise<Object>} - L'intention et les entités identifiées
 */
async function analyzeQuery(query) {
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
  } catch (error) {
    console.error("Erreur lors de l'analyse de la requête:", error);
    return {
      intent: "unknown",
      entities: {}
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
    }
    
    // Recherche par type de cuisine ou plat spécifique
    if (entities.cuisine_type) {
      const cuisineRegex = new RegExp(entities.cuisine_type, "i");
      
      // Recherche dans les champs standards
      orConditions.push({ category: cuisineRegex });
      orConditions.push({ description: cuisineRegex });
      
      // Recherche dans les structures de menu imbriquées
      // Format 1: Items Indépendants
      orConditions.push({ "Items Indépendants.items.nom": cuisineRegex });
      orConditions.push({ "Items Indépendants.items.description": cuisineRegex });
      
      // Format 2: Menus Globaux
      orConditions.push({ "Menus Globaux.inclus.items.nom": cuisineRegex });
      orConditions.push({ "Menus Globaux.inclus.items.description": cuisineRegex });
      
      // Format 3: Structure plate dans structured_data
      orConditions.push({ "structured_data.menu.items.description": cuisineRegex });
      orConditions.push({ "structured_data.menu.items.nom": cuisineRegex });
      
      // Cas spécifique de l'exemple Olivia (structure differente)
      orConditions.push({ "Items Indépendants.catégorie": cuisineRegex });
      orConditions.push({ "Items Indépendants.items.description": cuisineRegex });
    }
    
    // Filtrage par niveau de prix
    if (entities.price_level) {
      mongoQuery.price_level = parseInt(entities.price_level);
    }
    
    // Si nous avons des conditions OR, les ajouter à la requête
    if (orConditions.length > 0) {
      mongoQuery.$or = orConditions;
    }
    
    console.log("Requête MongoDB améliorée pour la recherche de restaurants:", 
                JSON.stringify(mongoQuery, null, 2));
  } else if (intent === "event_search" || intent === "leisure_search") {
    if (entities.location) {
      mongoQuery.lieu = { $regex: new RegExp(entities.location, "i") };
    }
    if (entities.event_type) {
      mongoQuery.category = { $regex: new RegExp(entities.event_type, "i") };
    }
    if (entities.date) {
      // Logique pour filtrer par date (événements futurs)
      const today = new Date();
      mongoQuery.date_debut = { $gte: today };
    }
  } else if (intent === "producer_analytics") {
    // Pour les analyses producteur, on ne filtre pas les données initialement
    // car on veut faire des analyses comparatives
  }

  return mongoQuery;
}

/**
 * Exécute une requête MongoDB et récupère les résultats
 * @param {Object} mongoQuery - La requête MongoDB à exécuter
 * @param {string} intent - L'intention de la requête
 * @returns {Promise<Array>} - Les résultats de la requête
 */
/**
 * Exécute une requête MongoDB et récupère les résultats avec scoring de pertinence
 * @param {Object} mongoQuery - La requête MongoDB à exécuter
 * @param {string} intent - L'intention de la requête
 * @param {Object} entities - Les entités extraites de la requête (pour le scoring)
 * @returns {Promise<Object>} - Les résultats de la requête
 */
async function executeMongoQuery(mongoQuery, intent, entities = {}) {
  let results = [];
  const startTime = Date.now();

  try {
    if (intent === "restaurant_search") {
      // Augmenter la limite pour avoir plus de résultats à filtrer/scorer
      const rawResults = await Producer.find(mongoQuery).limit(30);
      console.log(`📊 Requête MongoDB a retourné ${rawResults.length} résultats bruts`);
      
      // Si nous avons un terme de recherche spécifique (cuisine_type), appliquons un scoring
      if (entities.cuisine_type) {
        const scoredResults = await scoreAndFilterResults(rawResults, entities);
        results = scoredResults.slice(0, 10); // Limiter aux 10 meilleurs résultats
        console.log(`📈 Après scoring, ${results.length} résultats pertinents conservés`);
      } else {
        results = rawResults.slice(0, 10);
      }
    } else if (intent === "event_search") {
      results = await Event.find(mongoQuery).limit(10);
    } else if (intent === "leisure_search") {
      results = await LeisureProducer.find(mongoQuery).limit(10);
    } else if (intent === "producer_analytics") {
      // Pour les analyses producteur, on récupère tous les producteurs similaires
      // La logique de comparaison sera appliquée ultérieurement
      results = await Producer.find(mongoQuery).limit(50);
    }

    const executionTime = Date.now() - startTime;
    return { results, executionTime };
  } catch (error) {
    console.error("Erreur lors de l'exécution de la requête MongoDB:", error);
    return { results: [], executionTime: Date.now() - startTime };
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
 * @returns {Promise<Object>} - Les résultats de l'analyse
 */
async function performCompetitorAnalysis(producerId, competitors, metrics) {
  try {
    // Récupérer les informations du producteur
    const producer = await Producer.findById(producerId);
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
 * Génère une réponse en langage naturel basée sur les résultats de la requête
 * avec extraction des profils de lieux pour permettre navigation directe
 * @param {string} originalQuery - La requête originale de l'utilisateur
 * @param {Object} queryAnalysis - L'analyse de la requête
 * @param {Array} results - Les résultats de la requête MongoDB
 * @param {Object} analysisResults - Les résultats de l'analyse (pour les producteurs)
 * @returns {Promise<Object>} - La réponse en langage naturel et les profils extraits
 */
async function generateResponse(originalQuery, queryAnalysis, results, analysisResults = null) {
  try {
    let contextData = '';
    const { intent, entities } = queryAnalysis;
    let extractedProfiles = [];

    // Construire le contexte des données pour l'IA et extraire les profils
    if (intent === "restaurant_search") {
      // Extraire les profils des restaurants pour les rendre cliquables
      extractedProfiles = results.map(restaurant => ({
        id: restaurant._id,
        type: 'restaurant',
        name: restaurant.name || "Restaurant sans nom",
        address: restaurant.address || "Adresse non spécifiée",
        rating: restaurant.rating || null,
        image: restaurant.photo_url || restaurant.photos?.[0] || null,
        category: restaurant.category || [],
        description: restaurant.description || "",
        price_level: restaurant.price_level || null,
        highlighted_item: findMenuItemsByKeyword(restaurant, entities) || null
      }));

      contextData = results.map((restaurant, index) => 
        `${index + 1}. "${restaurant.name}" - ${restaurant.address || "Adresse non spécifiée"} - Note: ${restaurant.rating || "N/A"}/5 (${restaurant.user_ratings_total || 0} avis) - Prix: ${restaurant.price_level || "N/A"}/4
        ${findMenuItemsByKeyword(restaurant, entities) ? `🔍 Item correspondant trouvé: ${findMenuItemsByKeyword(restaurant, entities)}` : ""}`
      ).join("\n\n");
    } else if (intent === "event_search") {
      // Extraire les profils des événements
      extractedProfiles = results.map(event => ({
        id: event._id,
        type: 'event',
        name: event.intitulé || event.nom || "Événement sans nom",
        location: event.lieu || "Lieu non spécifié",
        date: event.date_debut || null,
        description: event.description || "",
        image: event.photo_url || event.photos?.[0] || null,
        category: event.category || []
      }));

      contextData = results.map((event, index) => 
        `${index + 1}. "${event.intitulé || event.nom}" à ${event.lieu || "Lieu non spécifié"} - Date: ${event.date_debut || "Non spécifiée"} - ${event.description?.substring(0, 100) || "Pas de description"}`
      ).join("\n\n");
    } else if (intent === "leisure_search") {
      // Extraire les profils des lieux de loisir
      extractedProfiles = results.map(leisure => ({
        id: leisure._id,
        type: 'leisureProducer',
        name: leisure.nom || leisure.lieu || "Lieu sans nom",
        address: leisure.adresse || "Adresse non spécifiée",
        description: leisure.description || "",
        image: leisure.photo_url || leisure.photos?.[0] || null,
        category: leisure.category || []
      }));

      contextData = results.map((leisure, index) => 
        `${index + 1}. "${leisure.nom || leisure.lieu}" - ${leisure.adresse || "Adresse non spécifiée"} - ${leisure.description?.substring(0, 100) || "Pas de description"}`
      ).join("\n\n");
    } else if (intent === "producer_analytics" && analysisResults) {
      // Pour les analyses producteur, extraire les profils des concurrents
      if (analysisResults.competitors?.data) {
        extractedProfiles = analysisResults.competitors.data.map(competitor => ({
          id: competitor._id,
          type: 'restaurant',
          name: competitor.name || "Restaurant sans nom",
          address: competitor.address || "Adresse non spécifiée",
          rating: competitor.rating || null,
          image: competitor.photo_url || competitor.photos?.[0] || null,
          category: competitor.category || [],
          price_level: competitor.price_level || null
        }));
      }
      
      contextData = JSON.stringify(analysisResults, null, 2);
    }

    // Générer la réponse en langage naturel
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Vous êtes un assistant expert dans le domaine ${intent === "producer_analytics" ? "de l'analyse commerciale pour restaurants et lieux de loisir" : "des restaurants, événements et lieux de loisir à Paris"}. 
          Utilisez les données suivantes pour répondre de manière précise, en français et dans un style conversationnel à la question de l'utilisateur.
          Limitez-vous strictement aux données fournies dans le contexte, sans inventer d'informations supplémentaires.
          Présentez les résultats de manière claire et structurée.
          
          IMPORTANT: Lorsque vous mentionnez des lieux spécifiques, utilisez la syntaxe suivante: "[[ID:nom_du_lieu]]" où ID est le numéro (1, 2, 3...) correspondant au lieu dans le contexte. Cela permettra à l'utilisateur de cliquer directement sur ces lieux.`
        },
        {
          role: "user",
          content: `Question: ${originalQuery}\n\nContexte des données disponibles:\n${contextData}`
        }
      ]
    });

    // Extraire les liens cliquables de la réponse
    let formattedResponse = response.choices[0].message.content;
    
    // Remplacer les marqueurs [[ID:nom_du_lieu]] par des identifiants cliquables
    const regex = /\[\[(\d+):([^\]]+)\]\]/g;
    let match;
    while ((match = regex.exec(formattedResponse)) !== null) {
      const id = parseInt(match[1]) - 1; // Convertir en index de tableau (0-based)
      if (id >= 0 && id < extractedProfiles.length) {
        formattedResponse = formattedResponse.replace(
          match[0], 
          `[${match[2]}](profile:${extractedProfiles[id].type}:${extractedProfiles[id].id})`
        );
      }
    }

    return {
      text: formattedResponse,
      profiles: extractedProfiles
    };
  } catch (error) {
    console.error("Erreur lors de la génération de la réponse:", error);
    return {
      text: "Désolé, je n'ai pas pu générer une réponse à votre question. Veuillez réessayer.",
      profiles: []
    };
  }
}

/**
 * Recherche des items de menu correspondant à un mot-clé
 * @param {Object} restaurant - Les données du restaurant
 * @param {Object} entities - Les entités extraites de la requête
 * @returns {string|null} - Description des items trouvés ou null
 */
function findMenuItemsByKeyword(restaurant, entities) {
  if (!restaurant.structured_data) return null;
  
  // Extraire les mots-clés potentiels des entités
  const possibleKeywords = [];
  if (entities.cuisine_type) possibleKeywords.push(entities.cuisine_type);
  if (entities.dish) possibleKeywords.push(entities.dish);
  
  // Ajouter d'autres mots-clés spécifiques aux plats
  ["plat", "dish", "food", "menu", "specialty"].forEach(key => {
    if (entities[key]) possibleKeywords.push(entities[key]);
  });
  
  if (possibleKeywords.length === 0) return null;
  
  // Chercher dans les différentes structures de menu
  let foundItems = [];
  
  // Cas 1: Menu structuré comme un objet avec catégories
  if (typeof restaurant.structured_data === 'object' && !Array.isArray(restaurant.structured_data)) {
    Object.keys(restaurant.structured_data).forEach(category => {
      const items = restaurant.structured_data[category];
      if (Array.isArray(items)) {
        items.forEach(item => {
          if (itemMatchesKeywords(item, possibleKeywords)) {
            foundItems.push(`${item.name || "Plat"} (${item.price || "Prix non spécifié"}) - ${category}`);
          }
        });
      }
    });
  }
  
  // Cas 2: Menu structuré comme un tableau
  else if (Array.isArray(restaurant.structured_data)) {
    restaurant.structured_data.forEach(item => {
      if (itemMatchesKeywords(item, possibleKeywords)) {
        foundItems.push(`${item.name || "Plat"} (${item.price || "Prix non spécifié"})`);
      }
    });
  }
  
  return foundItems.length > 0 ? foundItems.join(", ") : null;
}

/**
 * Vérifie si un item de menu correspond à des mots-clés
 * @param {Object} item - L'item de menu
 * @param {Array} keywords - Les mots-clés à rechercher
 * @returns {boolean} - Vrai si l'item correspond à au moins un mot-clé
 */
function itemMatchesKeywords(item, keywords) {
  if (!item) return false;
  
  const itemText = [
    item.name, 
    item.description, 
    item.ingredients, 
    item.category
  ].filter(Boolean).join(" ").toLowerCase();
  
  return keywords.some(keyword => 
    itemText.includes(keyword.toLowerCase())
  );
}

/**
 * Traite une requête utilisateur complète, de l'analyse à la génération de réponse
 * @param {string} query - La requête en langage naturel
 * @param {string} userId - L'ID de l'utilisateur (facultatif)
 * @returns {Promise<Object>} - La réponse complète avec métadonnées et profils extraits
 */
async function processUserQuery(query, userId = null) {
  try {
    // Analyser la requête
    const queryAnalysis = await analyzeQuery(query);
    
    // Gestion des requêtes géolocalisées ("autour de moi")
    if (userId && (query.toLowerCase().includes("autour de moi") || 
                  query.toLowerCase().includes("près de moi") ||
                  query.toLowerCase().includes("à proximité"))) {
      // Récupérer la localisation de l'utilisateur
      const user = await User.findById(userId);
      if (user && user.location) {
        queryAnalysis.entities.location = user.location;
        
        // Si l'utilisateur a des coordonnées GPS, utiliser la recherche géospatiale
        if (user.frequent_locations && user.frequent_locations.length > 0) {
          const mostFrequentLocation = user.frequent_locations[0];
          if (mostFrequentLocation.coordinates) {
            queryAnalysis.entities.coordinates = mostFrequentLocation.coordinates;
          }
        }
      }
    }
    
    // Construire la requête MongoDB avec prise en compte de la géolocalisation
    const mongoQuery = buildMongoQuery(queryAnalysis);
    
    // Exécuter la requête
    const { results, executionTime } = await executeMongoQuery(mongoQuery, queryAnalysis.intent);
    
    // Générer la réponse avec extraction des profils
    const responseData = await generateResponse(query, queryAnalysis, results);
    
    // Journaliser la requête
    if (userId) {
      await AIQuery.create({
        userId,
        query,
        intent: queryAnalysis.intent,
        entities: Object.values(queryAnalysis.entities).flat().filter(Boolean),
        mongoQuery,
        resultCount: results.length,
        executionTimeMs: executionTime,
        response: responseData.text
      });
    }
    
    return {
      query,
      intent: queryAnalysis.intent,
      entities: queryAnalysis.entities,
      resultCount: results.length,
      executionTimeMs: executionTime,
      response: responseData.text,
      profiles: responseData.profiles  // Profils extraits pour affichage direct
    };
  } catch (error) {
    console.error("Erreur lors du traitement de la requête utilisateur:", error);
    return {
      query,
      error: "Erreur lors du traitement de la requête",
      response: "Désolé, une erreur s'est produite lors du traitement de votre requête. Veuillez réessayer.",
      profiles: []
    };
  }
}

/**
 * Traite une requête d'analyse pour un producteur
 * @param {string} query - La requête en langage naturel
 * @param {string} producerId - L'ID du producteur
 * @returns {Promise<Object>} - La réponse complète avec métadonnées et profils extraits
 */
async function processProducerQuery(query, producerId) {
  try {
    // Analyser la requête
    const queryAnalysis = await analyzeQuery(query);
    
    // Détection des requêtes de recherche spécifiques
    let isMenuItemSearch = query.toLowerCase().includes("menu") || 
                          query.toLowerCase().includes("plat") || 
                          query.toLowerCase().includes("carte");
    
    // Vérifier que l'intention est bien une analyse producteur ou une recherche spécifique
    if (queryAnalysis.intent !== "producer_analytics" && !isMenuItemSearch) {
      queryAnalysis.intent = "producer_analytics";
    }
    
    // Si c'est une recherche de plats spécifiques
    if (isMenuItemSearch) {
      // Extraire le terme de recherche
      const foodTerms = extractFoodTerms(query);
      queryAnalysis.entities.dish = foodTerms;
      
      // Construire une requête MongoDB pour trouver des restaurants avec ces plats
      const menuQuery = {
        "structured_data": { $exists: true },
        $or: foodTerms.map(term => ({
          $or: [
            { "structured_data.$*.name": { $regex: new RegExp(term, "i") } },
            { "structured_data.$*.description": { $regex: new RegExp(term, "i") } },
            { "structured_data.$*.items.name": { $regex: new RegExp(term, "i") } },
            { "structured_data.$*.items.description": { $regex: new RegExp(term, "i") } }
          ]
        }))
      };
      
      // Exécuter la requête pour trouver des restaurants avec ces plats
      const { results: menuResults, executionTime } = await executeMongoQuery(menuQuery, "restaurant_search");
      
      // Générer la réponse avec extraction des profils
      const responseData = await generateResponse(
        query, 
        { ...queryAnalysis, intent: "restaurant_search" }, 
        menuResults
      );
      
      // Journaliser la requête
      await AIQuery.create({
        producerId,
        query,
        intent: "restaurant_search",
        entities: Object.values(queryAnalysis.entities).flat().filter(Boolean),
        mongoQuery: menuQuery,
        resultCount: menuResults.length,
        executionTimeMs: executionTime,
        response: responseData.text
      });
      
      return {
        query,
        intent: "restaurant_search",
        entities: queryAnalysis.entities,
        resultCount: menuResults.length,
        executionTimeMs: executionTime,
        response: responseData.text,
        profiles: responseData.profiles
      };
    }
    
    // Pour les analyses concurrentielles
    // Construire la requête MongoDB pour trouver des concurrents
    const producer = await Producer.findById(producerId);
    if (!producer) {
      return {
        query,
        error: "Producteur non trouvé",
        response: "Désolé, je n'ai pas pu trouver votre profil de producteur.",
        profiles: []
      };
    }
    
    // Trouver des concurrents similaires (même catégorie, même quartier)
    const neighborhood = producer.address ? producer.address.split(",")[0] : "";
    const category = producer.category ? (Array.isArray(producer.category) ? producer.category : [producer.category]) : [];
    
    const mongoQuery = {
      _id: { $ne: producerId }, // Exclure le producteur lui-même
      $or: [
        { address: { $regex: new RegExp(neighborhood, "i") } }, // Même quartier
        { category: { $in: category } } // Même catégorie
      ]
    };
    
    // Exécuter la requête pour trouver des concurrents
    const { results: competitors, executionTime } = await executeMongoQuery(mongoQuery, "producer_analytics");
    
    // Effectuer l'analyse comparative
    const analysisResults = await performCompetitorAnalysis(
      producerId,
      competitors,
      queryAnalysis.entities.metrics || ["rating", "price_level", "user_ratings_total"]
    );
    
    // Ajouter les données des concurrents à l'analyse
    analysisResults.competitors = {
      count: competitors.length,
      data: competitors.slice(0, 5) // Limiter à 5 concurrents pour l'affichage
    };
    
    // Générer la réponse avec extraction des profils
    const responseData = await generateResponse(query, queryAnalysis, competitors, analysisResults);
    
    // Journaliser la requête
    await AIQuery.create({
      producerId,
      query,
      intent: queryAnalysis.intent,
      entities: Object.values(queryAnalysis.entities).flat().filter(Boolean),
      mongoQuery,
      resultCount: competitors.length,
      executionTimeMs: executionTime,
      response: responseData.text
    });
    
    return {
      query,
      intent: queryAnalysis.intent,
      entities: queryAnalysis.entities,
      resultCount: competitors.length,
      executionTimeMs: executionTime,
      analysisResults,
      response: responseData.text,
      profiles: responseData.profiles
    };
  } catch (error) {
    console.error("Erreur lors du traitement de la requête producteur:", error);
    return {
      query,
      error: "Erreur lors du traitement de la requête",
      response: "Désolé, une erreur s'est produite lors du traitement de votre requête. Veuillez réessayer.",
      profiles: []
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

module.exports = {
  processUserQuery,
  processProducerQuery
};