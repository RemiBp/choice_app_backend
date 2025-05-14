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

// Defensive model loading
function safeModelLoad(factory, connection, name) {
  try {
    if (!connection) throw new Error(`Missing DB connection for model ${name}`);
    return factory(connection);
  } catch (e) {
    console.error(`❌ Failed to load model ${name}:`, e);
    return null;
  }
}

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
  User = User || (usersDb ? usersDb.model("User", new mongoose.Schema({}, { strict: false }), "Users") : null);
  Restaurant = Restaurant || (restaurationDb ? restaurationDb.model("Restaurant", new mongoose.Schema({}, { strict: false }), "Restaurants_Paris") : null);
  LeisureProducer = LeisureProducer || (loisirsDb ? loisirsDb.model("LeisureProducer", new mongoose.Schema({}, { strict: false }), "Loisir_Paris_Producers") : null);
  Event = Event || (loisirsDb ? loisirsDb.model("Event", new mongoose.Schema({}, { strict: false }), "Loisir_Paris_Evenements") : null);
  BeautyPlace = BeautyPlace || (beautyWellnessDb ? beautyWellnessDb.model("BeautyPlace", new mongoose.Schema({}, { strict: false }), "BeautyPlaces") : null);
  WellnessPlace = WellnessPlace || (beautyWellnessDb ? beautyWellnessDb.model("WellnessPlace", new mongoose.Schema({}, { strict: false }), "WellnessPlaces") : null);
  // Modèle pour les choices (raffiné)
  const ChoiceSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    producer_id: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    producer_type: { type: String, required: true, enum: ['restaurant', 'leisureProducer', 'event', 'beautyPlace', 'wellnessProducer', 'other'], index: true },
    rating: Number,
    comment: String,
    emotions: [String],
    tags: [String],
    created_at: { type: Date, default: Date.now, index: true }
  }, { timestamps: { createdAt: 'created_at', updatedAt: false } });
  Choice = Choice || (usersDb ? usersDb.model("Choice", ChoiceSchema, "user_choices") : null);
  // Modèle pour journaliser les requêtes et réponses de l'IA
  AIQuery = AIQuery || (usersDb ? usersDb.model(
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
  ) : null);
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

    // Define rules and examples as separate strings to avoid template literal issues
    const rulesText = "RÈGLES STRICTES:\n" +
      "1. social_context: Ne définis social_context que si la requête contient explicitement des mots-clés sociaux forts comme 'amis', 'following', 'entourage', 'contacts', 'recommandé par X'. Une requête comme \"restaurants bien notés\" NE DOIT PAS avoir de social_context.\n" +
      "2. sequence: Ne définis sequence à true que si la requête utilise des mots-clés temporels clairs indiquant plusieurs étapes comme 'puis', 'ensuite', 'après', 'suivi de', 'et après ça'. Une requête comme \"restaurant avec terrasse pour ce soir\" ou \"pièce de théâtre et bar sympa\" NE DOIT PAS avoir sequence: true si elle ne décrit pas un ordre chronologique.\n" +
      "3. sequence_types: Si sequence est true, détermine les types d'activités dans l'ordre mentionné (ex: ['restaurant', 'event']).\n";

    const examplesText = "EXEMPLES:\n" +
      "- \"Je cherche une pièce de théâtre pour ce soir\": { \"intent\": \"event_search\", \"entities\": {\"event_type\": \"pièce de théâtre\", \"date\": \"ce soir\"}, \"sequence\": false, \"social_context\": undefined }\n" +
      "- \"restaurant italien pour moi et mes amis\": { \"intent\": \"restaurant_search\", \"entities\": {\"cuisine_type\": \"italien\"}, \"sequence\": false, \"social_context\": {\"check_friends\": true} }\n" +
      "- \"un bon resto puis un bar sympa\": { \"intent\": \"restaurant_search\", \"entities\": {\"rating\": \"bon\"}, \"sequence\": true, \"sequence_types\": [\"restaurant\", \"leisure\"], \"social_context\": undefined }\n";

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

INTENTIONS À DÉTECTER (intents):
- restaurant_search
- event_search
- leisure_search
- friend_choices (ex: "quels restaurants ont été choisis par mes amis ?")
- check_friends_choice_for_producer (ex: "quel ami a choisi le restaurant X ?")
- competitor_analysis
- general_query

ENTITÉS À EXTRAIRE (entities):
- cuisine_type, price_level, rating, location, date, event_type, activity_type, calories, promotion
- friend_name (nom d'un ami ou d'un contact)
- producer_name (nom d'un restaurant, lieu, etc.)
- producer_id (id d'un producteur si mentionné)
- social_context (ex: entourage, amis, following, followers)

Analyse attentivement la requête pour identifier:
1. Préférences alimentaires spécifiques (ingrédients, régimes)
2. Contraintes de prix/budget (maximum, fourchette)
3. Contraintes de calories/nutrition
4. Demandes de promotions/réductions
5. Références sociales (amis, following, recommandations, nom d'ami, nom de lieu)
6. Séquence chronologique (restaurant puis spectacle)
7. Contraintes horaires (heure précise, ce soir, etc.)
8. Popularité/tendances recherchées
9. Notations minimales demandées
10. Requêtes sociales spécifiques (choices d'amis, qui a choisi quoi, etc.)

${rulesText}
${examplesText}
Réponds au format JSON avec les champs intent, entities, sequence, sequence_types, et social_context.
Sois particulièrement attentif aux requêtes complexes comme "restaurant puis spectacle", "recommandé par mes amis", ou "qui a choisi le restaurant X ?".`;

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
function buildMongoQuery(queryAnalysis, options = {}) {
  const { intent, entities, social_context, location_context } = queryAnalysis;
  const mongoQuery = {};
  let conditions = []; // Use let as we might reassign it

  // --- Location Filtering --- 
  // *** MODIFICATION START: Ne pas ajouter de filtres de localisation texte si une requête geo est prévue ***
  let isGeoQueryHandledUpstream = false;
  if (location_context?.nearby && options.coordinates) {
    // This function primarily builds the $match part for non-geo queries, 
    // or the secondary filters for $geoNear's 'query' option.
    console.log("📍 Nearby location detected. Base query excludes text location search.");
    isGeoQueryHandledUpstream = true; 
    // GeoNear logic will be handled in processUserQuery
    
    // Keep potential text location if provided explicitly *with* nearby intent?
    // Example: "restaurants italiens près de moi à Montmartre"
    // For now, we prioritize geoNear and skip text location filters here
    // if (entities?.location) { ... }

  // *** MODIFICATION END ***
  } else if (location_context?.specific_location) {
    // Search within specific address fields for the named location
    const locRegex = new RegExp(location_context.specific_location, "i");
    conditions.push({
      $or: [
        { address: locRegex },
        { formatted_address: locRegex },
        { vicinity: locRegex },
        { city: locRegex },
        { "location.address": locRegex }, // Check nested address
        { "plus_code.compound_code": locRegex }
      ]
    });
  } else if (entities?.location && !isGeoQueryHandledUpstream) { // Only add text location if not a geo query
    // General location text search if location mentioned but not specifically 'nearby'
    const locRegex = new RegExp(entities.location, "i");
     conditions.push({
      $or: [
        { address: locRegex },
        { formatted_address: locRegex },
        { vicinity: locRegex },
        { city: locRegex }
      ]
    });
  }

  // --- Entity-based Filtering --- 

  // Cuisine / Category / Event Type
  let typeField = 'cuisine_type'; // Default for restaurants
  let typeValue = entities?.cuisine_type;
  if (intent?.includes('event')) { typeField = 'category'; typeValue = entities?.event_type || entities?.category; }
  if (intent?.includes('leisure')) { typeField = 'category'; typeValue = entities?.activity_type || entities?.category; }
  if (intent?.includes('wellness') || intent?.includes('beauty')) { typeField = 'category'; typeValue = entities?.category; }
  
  // *** MODIFICATION START: Check if typeValue is defined before creating regex ***
  if (typeValue) {
    const typeRegex = new RegExp(typeValue, "i");
    conditions.push({ 
      $or: [
        { [typeField]: typeRegex },
        // Also check general 'category' and 'tags' fields as fallbacks
        { category: typeRegex }, 
        { tags: typeRegex },
      ]
    });
  }
  // *** MODIFICATION END ***
  
  // Rating
  if (entities?.rating_descriptor) {
      let minRating = 0;
      if (['bon', 'bien noté'].includes(entities.rating_descriptor.toLowerCase())) minRating = 4.0;
      if (['très bon', 'excellent', 'meilleur', 'top'].includes(entities.rating_descriptor.toLowerCase())) minRating = 4.5;
      if (minRating > 0) {
          conditions.push({ rating: { $gte: minRating } });
          conditions.push({ "notes_globales.average": { $gte: minRating } }); // Check alternative structure
      }
  } else if (entities?.rating && !isNaN(parseFloat(entities.rating))) {
      conditions.push({ rating: { $gte: parseFloat(entities.rating) } });
      conditions.push({ "notes_globales.average": { $gte: parseFloat(entities.rating) } });
  }

  // Price Level / Range
  if (entities?.price_level && !isNaN(parseInt(entities.price_level))) {
    conditions.push({ price_level: { $lte: parseInt(entities.price_level) } });
  }
  if (entities?.price_range) {
      const priceMatch = entities.price_range.match(/(\d+)/);
      if (priceMatch) {
          const maxPrice = parseInt(priceMatch[1]);
          conditions.push({ price_level: { $lte: maxPrice / 10 } }); // Approximate price level
          // TODO: Add check against specific price fields if available (e.g., menu item prices)
      }
      if (entities.price_range.includes('pas cher') || entities.price_range.includes('économique')) {
          conditions.push({ price_level: { $in: [1, 2] } }); 
      }
  }

  // Promotions
  if (entities?.promotion === true) {
    conditions.push({ promotions: { $exists: true, $ne: [] } });
    // TODO: Check specific promotion fields if models have them
  }

  // Specific Criteria (e.g., terrasse, vegan, piscine)
  if (entities?.specific_criteria && entities.specific_criteria.length > 0) {
    entities.specific_criteria.forEach(criterion => {
      const critRegex = new RegExp(criterion, "i");
      conditions.push({
        $or: [
          { description: critRegex },
          { tags: critRegex },
          { specialties: critRegex },
          { services: critRegex }, // Assuming services is an array of strings
          { amenities: critRegex }, // For leisure/wellness
          { "service_options.dine_in": criterion.toLowerCase() === 'sur place' ? true : undefined }, // Example for specific boolean
          { "service_options.takeaway": criterion.toLowerCase() === 'à emporter' ? true : undefined },
          { "service_options.delivery": criterion.toLowerCase() === 'livraison' ? true : undefined }
        ].filter(cond => Object.values(cond)[0] !== undefined) // Filter out undefined conditions
      });
    });
  }

  // Item Keywords (e.g., pizza, massage suédois)
  if (entities?.item_keywords && entities.item_keywords.length > 0) {
     entities.item_keywords.forEach(keyword => {
        const itemRegex = new RegExp(keyword, "i");
        conditions.push({
            $or: [
                { menu_items: { $elemMatch: { name: itemRegex } } }, // Assumes menu_items is array of objects
                { menu_items: { $elemMatch: { description: itemRegex } } },
                { menu: { $elemMatch: { name: itemRegex } } }, // If menu is also an array of objects
                { menu: { $elemMatch: { description: itemRegex } } },
                { specialties: itemRegex },
                { description: itemRegex }, // Search in main description too
                { services: itemRegex }, // Check services list
                // Add specific checks for menu structures if needed (like 'Items Indépendants')
                { "structured_data.Items Indépendants.items.nom": itemRegex },
                { "structured_data.Menus Globaux.inclus.items.nom": itemRegex }
            ]
        });
     });
  }
  
  // Specific Place Name
  if (entities?.place_name) {
      const nameRegex = new RegExp(entities.place_name, "i");
      // Prioritize name match if a specific place is mentioned
      mongoQuery.name = nameRegex; 
      // Remove other conditions if a specific place name is the main entity?
      // Or keep them to verify the place matches other criteria? Let's keep them for verification.
       conditions.push({ name: nameRegex }); // Add to conditions as well for $and logic
  }

  // --- Social Context Handling (Placeholder/Deferral) --- 
  // If the primary intent is social (handled by other functions), keep this query simple
  if (social_context?.check_friends && intent?.includes('friends_choices')) {
      console.log("🤝 Social context detected, detailed friend filtering handled elsewhere.");
      // Return a potentially simpler query or let the calling function decide
      // For now, we'll build the query based on other entities, and the calling function will combine it.
  }
  
  // --- Combine conditions --- 
  if (conditions.length > 0) {
    if (mongoQuery.$or) { // If $or already exists (e.g., from location)
        mongoQuery.$and = [ ...conditions, { $or: mongoQuery.$or } ];
        delete mongoQuery.$or;
    } else if (mongoQuery.$and) { // If $and already exists
        mongoQuery.$and = [ ...mongoQuery.$and, ...conditions ];
    } else if (conditions.length === 1) {
        // If only one condition, merge it directly into the query
        Object.assign(mongoQuery, conditions[0]);
    } else {
        mongoQuery.$and = conditions;
    }
  }

  // Handle specific intents that might require different base queries
  if (intent === 'opening_hours_query' && entities?.place_name) {
    // For opening hours, we only need to find the place by name
    return { name: { $regex: new RegExp(entities.place_name, "i") } };
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
  const startTime = Date.now();
  let user = null;
  // Use coordinates from options first, then try fetching from user profile
  let userCoordinates = options.coordinates || null;
  let mongoQueryResult = [];
  let socialDataForResponse = {}; // Data to potentially pass to generateResponse
  let responseText = "Désolé, je n'ai pas pu traiter votre demande."; // Default response
  let queryAnalysis = {}; // Store analysis result
  let modelType = 'unknown'; // To track the type of results found

  try {
    // --- 0. Fetch User Data (including coordinates if needed) ---
    if (userId) {
      try {
        // Select fields needed for coordinates and social data fetching
        user = await User.findById(userId).select('location connections choices interests following trusted_circle').lean();
        if (user && user.location && user.location.coordinates && user.location.coordinates.longitude && user.location.coordinates.latitude && !userCoordinates) {
          // Ensure coordinates format { longitude: Number, latitude: Number }
           userCoordinates = {
               longitude: user.location.coordinates.longitude,
               latitude: user.location.coordinates.latitude
           };
          console.log(`📍 User coordinates loaded from profile: ${JSON.stringify(userCoordinates)}`);
        }
      } catch (userError) {
        console.error(`❌ Error fetching user data for ${userId}:`, userError);
        // Non-fatal, proceed without user-specific context
      }
    }

    // --- 1. Analyze the user query using LLM ---
    queryAnalysis = await analyzeQuery(query); // Assumes analyzeQuery returns the enhanced structure
    const { intent, entities, social_context, location_context, sequence, sequence_types } = queryAnalysis;

    // --- 2. Handle Different Intents ---

    // A. Socially Focused Intents (Delegate to specific handlers)
    if (intent?.startsWith('friends_choices') || intent === 'check_friend_choice_at_place') {
      console.log(`🤝 Handling socially focused intent: ${intent}`);
      if (!userId) {
        responseText = "Je ne peux pas répondre à cette question sans savoir qui vous êtes. Veuillez vous connecter.";
        mongoQueryResult = [];
      } else {
        // Call the appropriate handler function (defined elsewhere in the file)
        let socialResult;
        if (intent === 'handleFriendChoicesQuery' || intent === 'friends_choices_general' || intent === 'friends_choices_specific_place' ) {
           // Assuming handleFriendChoicesQuery handles both general and specific based on entities
           socialResult = await handleFriendChoicesQuery(query, userId, queryAnalysis, options); // Assumes this function exists and returns results/profiles
        } else if (intent === 'check_friend_choice_at_place') {
           socialResult = await handleCheckFriendsChoiceQuery(query, userId, queryAnalysis, options);
        } else {
            // Fallback if a new social intent isn't routed
            socialResult = { response: "Logique pour cet intent social spécifique à implémenter.", profiles: [], resultCount: 0 };
        }
        // Use the response and profiles directly from the handler
        responseText = socialResult.response;
        mongoQueryResult = socialResult.profiles || []; // These should already be profile objects
        queryAnalysis.resultCount = socialResult.resultCount; // Pass result count if available
        // We skip standard response generation as handlers should provide the final text
        const executionTimeMs = Date.now() - startTime;
        await logUserQuery(userId, query, queryAnalysis, mongoQueryResult, executionTimeMs, responseText);
        return { // Return early as social handlers manage the full response
            query: query,
            intent: intent,
            entities: entities || {},
            resultCount: mongoQueryResult.length,
            executionTimeMs: executionTimeMs,
            response: responseText,
            profiles: mongoQueryResult, // Already formatted profiles
            hasSocialContext: !!social_context,
            hasSequence: !!sequence,
            socialData: socialResult.socialData || {}
        };
      }
    }
    // B. Sequence Queries (Placeholder)
    else if (sequence && sequence_types && sequence_types.length > 1) {
       console.log("🔄 Handling sequence query:", sequence_types);
       // Proper implementation requires careful handling of multiple queries and combining results.
       // responseText = await handleSequenceQuery(query, userId, queryAnalysis, userCoordinates); // Delegate
       responseText = `Je ne peux pas encore gérer les demandes multi-étapes comme \"${query}\". Pouvez-vous demander chaque étape séparément ?`;
       mongoQueryResult = [];
    }
    // C. Standard Search/Info Queries (Potentially with Geo/Social context)
    else {
      console.log(`📌 Handling standard intent: ${intent || 'unknown'}`);
      // Determine target model based on intent
      let TargetModel = Restaurant; // Default
      modelType = 'restaurant'; // Reset modelType

      // Prioritize specific place info if name is given
       if (intent === 'specific_place_info' && entities?.place_name) {
            // Try finding across multiple collections if type isn't certain
            const potentialModels = [Restaurant, LeisureProducer, Event, WellnessPlace, BeautyPlace];
             let foundPlace = null;
             for (const Model of potentialModels) {
                  if (Model) { // Check if model loaded correctly
                     try {
                         foundPlace = await Model.findOne({ name: { $regex: new RegExp(entities.place_name, "i") } }).lean();
                         if (foundPlace) {
                              TargetModel = Model;
                              // Infer modelType from the collection found
                              if (Model === Restaurant) modelType = 'restaurant';
                              else if (Model === LeisureProducer) modelType = 'leisureProducer';
                              else if (Model === Event) modelType = 'event';
                              else if (Model === WellnessPlace) modelType = 'wellnessPlace';
                              else if (Model === BeautyPlace) modelType = 'beautyPlace';
                              break;
                         }
                     } catch (modelFindError) {
                         console.warn(`⚠️ Error searching for place in ${Model.modelName}:`, modelFindError.message);
                     }
                  }
             }
             if (foundPlace) {
                 mongoQueryResult = [foundPlace];
                 console.log(`🏠 Found specific place "${entities.place_name}" in ${TargetModel.modelName}`);
        } else {
                 console.log(`🏠 Could not find specific place "${entities.place_name}"`);
                 mongoQueryResult = [];
             }
      } else {
           // Determine model based on intent for broader searches
           if (intent?.includes('event')) { TargetModel = Event; modelType = 'event'; }
           else if (intent?.includes('leisure')) { TargetModel = LeisureProducer; modelType = 'leisureProducer'; }
           else if (intent?.includes('wellness')) { TargetModel = WellnessPlace; modelType = 'wellnessPlace'; }
           else if (intent?.includes('beauty')) { TargetModel = BeautyPlace; modelType = 'beautyPlace'; }
           // Keep default Restaurant otherwise

           if (!TargetModel) {
                console.error(`❌ Could not determine target model for intent: ${intent}`);
                // Fallback to Restaurant if model determination failed but intent suggested something else
                TargetModel = Restaurant;
                modelType = 'restaurant';
           }
           console.log(`🔍 Determined TargetModel: ${TargetModel.modelName} based on intent: ${intent}`);

           // Build the base query conditions
           const baseQueryConditions = buildMongoQuery(queryAnalysis, { coordinates: userCoordinates });

           // --- Execute Query (Geo or Standard) ---
           // Determine the correct location field name based on the target model
           let locationField = 'location'; // Default for Event, Wellness, Beauty
           if (modelType === 'restaurant' || modelType === 'leisureProducer') {
                // Producer and LeisureProducer models use 'gps_coordinates' based on schema review
                locationField = 'gps_coordinates';
           } else if (TargetModel.schema.path('location.coordinates')) { 
               // Fallback check if schema has nested location.coordinates
               locationField = 'location'; 
           } else if (TargetModel.schema.path('gps_coordinates.coordinates')) {
                locationField = 'gps_coordinates';
           } else {
               console.warn(`⚠️ Could not determine primary location field for ${modelType}, defaulting to 'location'. Check schema.`);
           }

           if (location_context?.nearby && userCoordinates && userCoordinates.longitude && userCoordinates.latitude) {
               console.log(`🌍 Executing geospatial query near [${userCoordinates.longitude}, ${userCoordinates.latitude}] for ${modelType} using field '${locationField}'`);
               
               // Ensure the chosen location field exists and has a 2dsphere index before querying
               const indexes = await TargetModel.collection.getIndexes();
               const hasGeoIndex = indexes[`${locationField}_2dsphere`] !== undefined;
               const hasAlternativeGeoIndex = locationField === 'location' 
                                            ? indexes['gps_coordinates_2dsphere'] !== undefined 
                                            : indexes['location_2dsphere'] !== undefined;
               
               const alternativeLocationField = locationField === 'location' ? 'gps_coordinates' : 'location';
               
               if (!hasGeoIndex && !hasAlternativeGeoIndex) {
                    console.error(`‼️‼️‼️ GEO INDEX MISSING on '${locationField}' and '${alternativeLocationField}' for ${TargetModel.modelName}. Cannot perform geo query.`);
                    // Fallback to standard query
                    mongoQueryResult = await TargetModel.find(baseQueryConditions).limit(options.limit || 20).lean();
                    console.log(`⚠️ Geo query skipped due to missing index. Standard query returned ${mongoQueryResult.length} results.`);
               } else {
                   // Au moins un index existe, proceed with geoNear
                   // Utiliser le champ qui a un index
                   const geoField = hasGeoIndex ? locationField : alternativeLocationField;
                   console.log(`🌍 Using ${geoField} field for geospatial query since it has a valid index`);
                   
                   const geoPipeline = [
                     {
                       $geoNear: {
                         near: { type: "Point", coordinates: [userCoordinates.longitude, userCoordinates.latitude] },
                         distanceField: "distance", // Output distance in meters
                         key: geoField, // Specify the indexed field to use
                         maxDistance: options.maxDistance || 20000, // Default 20km
                         query: baseQueryConditions, // Apply other filters HERE
                         spherical: true
                       }
                     },
                     // Optional: Add $match stage here if more filtering needed *after* $geoNear
                     { $limit: options.limit || 20 } // Limit results
                   ];
                   try {
                       mongoQueryResult = await TargetModel.aggregate(geoPipeline);
                       console.log(`🌍 GeoNear query returned ${mongoQueryResult.length} results.`);
                       // Add distance to results if needed by frontend
                       mongoQueryResult.forEach(r => r.distance = r.distance); // Keep distance field
                   } catch (aggError) {
                       console.error(`❌ Error executing GeoNear aggregation for ${modelType}:`, aggError);
                       mongoQueryResult = [];
                   }
               }
           } else {
               // Execute standard query
               console.log(`🔍 Executing standard find query for ${modelType}`);
               try {
                   mongoQueryResult = await TargetModel.find(baseQueryConditions).limit(options.limit || 20).lean();
                   console.log(`🔍 Standard query returned ${mongoQueryResult.length} results.`);
               } catch (findError) {
                   console.error(`❌ Error executing standard find query for ${modelType}:`, findError);
                   mongoQueryResult = [];
               }
           }
       } // End of standard search logic (else block for specific_place_info)

       // --- Enrich with Friend Data (if applicable) ---
       if (social_context?.check_friends && userId && mongoQueryResult.length > 0) {
           console.log("🤝 Enriching results with friend choice data...");
           try {
               const friendsData = await getUserSocialData(userId); // Ensure this returns { friends: [id1, id2...] }
               // Use 'friends' from trusted_circle or 'following' based on context/preference
               const friendIds = friendsData?.friends || []; // Using trusted_circle as friends for now

               if (friendIds.length > 0) {
                   const placeIds = mongoQueryResult.map(p => p._id); // Assumes results have _id
                   if (placeIds.length > 0 && Choice) { // Check if Choice model is loaded
                        const friendChoices = await Choice.find({
                            user_id: { $in: friendIds.map(id => mongoose.Types.ObjectId(id)) }, // Ensure IDs are ObjectIds
                            producer_id: { $in: placeIds },
                            producer_type: modelType // Filter by the correct type
                        }).select('user_id producer_id rating comment created_at').lean(); // Select needed fields

                        // Create a map for quick lookup
                        const choicesMap = friendChoices.reduce((map, choice) => {
                            const key = choice.producer_id.toString();
                            if (!map[key]) map[key] = [];
                            map[key].push(choice);
                            return map;
                        }, {});

                        // Add friend choice info to results
                        mongoQueryResult = mongoQueryResult.map(place => {
                            const placeIdStr = place._id.toString();
                            const choicesForPlace = choicesMap[placeIdStr] || [];
                            // Fetch user details for sample choices (can be optimized)
                            const sampleChoices = choicesForPlace.slice(0, 3).map(c => ({
                                userId: c.user_id, // Keep ID for potential linking
                                rating: c.rating,
                                comment: c.comment,
                                date: c.created_at
                                // TODO: Add username/avatar by fetching user data if needed frontend-side
                            }));

                            return {
                                ...place, // Spread existing place data
                                friendChoiceCount: choicesForPlace.length,
                                friendChoicesSample: sampleChoices
                            };
                        });

                        // Optional: Re-sort results to prioritize places friends chose
                        mongoQueryResult.sort((a, b) => (b.friendChoiceCount || 0) - (a.friendChoiceCount || 0));
                        console.log(`🤝 Enrichment complete. ${friendChoices.length} friend choices found for ${Object.keys(choicesMap).length} places.`);
                   } else {
                        console.log("🤝 Friend enrichment skipped: No place IDs or Choice model unavailable.");
                   }
               } else {
                 console.log("🤝 Friend enrichment skipped: User has no friends.");
               }
           } catch (socialEnrichError) {
                console.error(`❌ Error enriching results with social data:`, socialEnrichError);
                // Continue without enrichment
           }
       } // End social enrichment block
    } // End of standard intent handling

    // --- 3. Generate final response using LLM ---
    // Use queryAnalysis, the potentially enriched mongoQueryResult, and determined modelType
    console.log(`📝 Generating final response for intent: ${intent || 'unknown'}`);
    // Pass user ID for potential personalization in response generation
    const responseContext = { userId: userId, queryAnalysis: queryAnalysis }; 
    responseText = await generateResponse(query, queryAnalysis, mongoQueryResult, socialDataForResponse, modelType, responseContext);

  } catch (error) {
    console.error('❌❌ Top-level error in processUserQuery:', error);
    // Provide a more informative error if possible
    responseText = `Désolé, une erreur technique est survenue (${error.message || 'inconnue'}). Veuillez réessayer plus tard.`;
    mongoQueryResult = []; // Ensure empty results on error
  }

  // --- 4. Format results and return ---
  const executionTimeMs = Date.now() - startTime;
  // Ensure extractProfiles handles the enriched data (like friendChoiceCount) if needed by frontend
  const extractedProfiles = extractProfiles(mongoQueryResult || []); 
  console.log(`🏁 Query processed in ${executionTimeMs}ms. Returning ${extractedProfiles.length} profiles.`);

  // Log the query and response
  await logUserQuery(userId, query, queryAnalysis, mongoQueryResult, executionTimeMs, responseText);
  
  return {
    query: query,
    intent: queryAnalysis?.intent || 'unknown',
    entities: queryAnalysis?.entities || {},
    resultCount: extractedProfiles.length,
    executionTimeMs: executionTimeMs,
    response: responseText,
    profiles: extractedProfiles,
    hasSocialContext: !!queryAnalysis?.social_context,
    hasSequence: !!queryAnalysis?.sequence,
    socialData: socialDataForResponse // Include any fetched social data used
  };
}

// Fonction utilitaire pour construire une requête géographique
function buildGeoQuery(queryAnalysis, coordinates, type) {
  const { entities } = queryAnalysis;
  const query = {
    location: {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [coordinates.longitude, coordinates.latitude]
        },
        $maxDistance: 5000 // 5km par défaut
      }
    }
  };
  
  // Ajouter des filtres spécifiques au type
  if (type === 'beauty') {
    if (entities.beauty_type) {
      query.$or = [
        { category: { $regex: new RegExp(entities.beauty_type, 'i') } },
        { service: { $regex: new RegExp(entities.beauty_type, 'i') } },
        { tags: { $regex: new RegExp(entities.beauty_type, 'i') } }
      ];
    } else {
      // Filtres génériques pour la beauté
      query.$or = [
        { category: { $regex: /beauté|coiffure|manucure|pédicure/i } },
        { service: { $regex: /beauté|coiffure|manucure|pédicure/i } }
      ];
    }
  } else if (type === 'wellness') {
    if (entities.wellness_type) {
      query.$or = [
        { category: { $regex: new RegExp(entities.wellness_type, 'i') } },
        { service: { $regex: new RegExp(entities.wellness_type, 'i') } },
        { tags: { $regex: new RegExp(entities.wellness_type, 'i') } }
      ];
    } else {
      // Filtres génériques pour le bien-être
      query.$or = [
        { category: { $regex: /bien-être|massage|spa|détente|relaxation/i } },
        { service: { $regex: /bien-être|massage|spa|détente|relaxation/i } }
      ];
    }
  } else if (type === 'restaurant') {
    // Ajouter des filtres pour les restaurants
    if (entities.cuisine_type) {
      query.$or = [
        { cuisine_type: { $regex: new RegExp(entities.cuisine_type, 'i') } },
        { category: { $regex: new RegExp(entities.cuisine_type, 'i') } },
        { "menu_items.name": { $regex: new RegExp(entities.cuisine_type, 'i') } }
      ];
    }
    
    if (entities.price_level) {
      query.price_level = { $lte: parseInt(entities.price_level) };
    }
    
    if (entities.rating) {
      query.rating = { $gte: parseFloat(entities.rating) };
    }
  }
  
  return query;
}

// Fonction utilitaire pour diviser les entités pour une séquence
function splitEntitiesForSequence(entities, sequenceTypes) {
  const result = [];
  
  // Copier les entités communes à toutes les étapes
  const commonEntities = {
    location: entities.location,
    rating: entities.rating
  };
  
  for (const type of sequenceTypes) {
    if (type === 'restaurant') {
      result.push({
        ...commonEntities,
        cuisine_type: entities.cuisine_type,
        price_level: entities.price_level
      });
    } else if (type === 'event' || type === 'spectacle') {
      result.push({
        ...commonEntities,
        event_type: entities.event_type,
        date: entities.date
      });
    } else if (type === 'leisure' || type === 'loisir') {
      result.push({
        ...commonEntities,
        activity_type: entities.activity_type
      });
    } else {
      // Type générique
      result.push(commonEntities);
    }
  }
  
  return result;
}

// Fonction utilitaire pour générer une réponse de séquence
async function generateSequenceResponse(query, queryAnalysis, sequenceResults) {
  try {
    // Utiliser l'API OpenAI ou autre méthode pour générer une réponse naturelle
    let prompt = `Voici une requête utilisateur pour une séquence d'activités: "${query}"\n\n`;
    
    for (let i = 0; i < sequenceResults.length; i++) {
      const { type, results, count } = sequenceResults[i];
      
      prompt += `Étape ${i+1} (${type}): ${count} résultats trouvés\n`;
      
      // Ajouter les 3 meilleurs résultats pour chaque étape
      const topResults = results.slice(0, 3);
      if (topResults.length > 0) {
        prompt += "Top résultats:\n";
        
        topResults.forEach((result, idx) => {
          prompt += `${idx+1}. ${result.name || result.lieu || result.intitulé || 'Sans nom'} - `;
          if (result.rating) prompt += `Note: ${result.rating}/5 - `;
          if (result.address || result.adresse) prompt += `Adresse: ${result.address || result.adresse} - `;
          if (type === 'restaurant' && result.cuisine_type) prompt += `Cuisine: ${result.cuisine_type}`;
          prompt += "\n";
        });
      } else {
        prompt += "Aucun résultat trouvé pour cette étape.\n";
      }
      
      prompt += "\n";
    }
    
    prompt += "Génère une réponse en français pour l'utilisateur qui combine ces différentes étapes en une expérience cohérente. Sois précis dans tes recommandations et donne quelques détails sur chaque lieu.";
    
    // Appel à OpenAI
    const client = openai || simulatedOpenAI;
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Tu es un assistant de recherche d'activités pour l'application Choice." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7
    });
    
    const responseText = response.choices[0].message.content;
    return responseText;
  } catch (error) {
    console.error('❌ Erreur lors de la génération de la réponse de séquence:', error);
    
    // Fallback: générer une réponse simple sans API
    let response = `Voici une suggestion pour votre demande "${query}":\n\n`;
    
    for (let i = 0; i < sequenceResults.length; i++) {
      const { type, results } = sequenceResults[i];
      const topResult = results[0];
      
      if (topResult) {
        response += `Étape ${i+1} (${type}): ${topResult.name || topResult.lieu || topResult.intitulé || 'Sans nom'}`;
        if (topResult.rating) response += ` - Note: ${topResult.rating}/5`;
        if (topResult.address || topResult.adresse) response += ` - Adresse: ${topResult.address || topResult.adresse}`;
        response += '\n\n';
      } else {
        response += `Étape ${i+1} (${type}): Aucune suggestion disponible.\n\n`;
      }
    }
    
    response += "N'hésitez pas à me demander plus de détails sur ces suggestions.";
    return response;
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
        id: producer.id,
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
      case 'beautyProducer':
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
  
  console.log(`📊 Extraction de profils à partir de ${results.length} résultats...`);
  
  // Map pour éviter les doublons (par ID producteur)
  const uniqueProfiles = new Map();
  
  results.forEach((result, index) => {
    // Déterminer si c'est un choice/interest (avec producer) ou un lieu direct
    const isActivity = result.producer_id && (result.user_id || result.isChoice || result.isInterest);
    const producer = isActivity ? result.producer : result;
    
    if (!producer) {
      console.log(`⚠️ Résultat #${index} sans producteur valide:`, JSON.stringify(result).substring(0, 100) + '...');
      return; // Ignorer les résultats sans producteur valide
    }
    
    // Extraire l'ID, en considérant toutes les possibilités MongoDB
    const producerId = producer.id || (producer._id ? (typeof producer._id === 'object' ? producer._id.toString() : producer._id) : null);
    
    if (!producerId) {
      console.log(`⚠️ Résultat #${index} sans ID:`, JSON.stringify(producer).substring(0, 100) + '...');
      return; // Ignorer si ni id ni _id n'est disponible
    }
    
    // Logging de débogage
    if (index < 2) { // Limiter pour éviter le flood des logs
      console.log(`🔍 Traitement du résultat #${index}: Type=${isActivity ? 'activity' : 'place'}, ID=${producerId}`);
    } 
    
    // Si le producteur existe déjà, on met à jour uniquement certaines informations
    if (uniqueProfiles.has(producerId)) {
      const existingProfile = uniqueProfiles.get(producerId);
      
      // Conserver les informations d'activité les plus pertinentes
      if (isActivity) {
        // Ajouter à la liste des utilisateurs ayant choisi/aimé ce lieu
        if (result.user && result.user.id) {
          if (!existingProfile.userActivity) existingProfile.userActivity = [];
          
          const activityType = result.isInterest ? 'interest' : 'choice';
          const activityExists = existingProfile.userActivity.some(
            ua => ua.userId === result.user.id && ua.type === activityType
          );
          
          if (!activityExists) {
            existingProfile.userActivity.push({
              userId: result.user.id,
              username: result.user.username,
              fullName: result.user.fullName,
              type: activityType,
              date: result.created_at || result.date,
              comment: result.comment
            });
          }
        }
        
        // Mettre à jour la date si plus récente
        if ((result.created_at || result.date) && !existingProfile.lastActivityDate) {
          existingProfile.lastActivityDate = result.created_at || result.date;
        } else if ((result.created_at || result.date) && existingProfile.lastActivityDate) {
          const currentDate = new Date(existingProfile.lastActivityDate);
          const newDate = new Date(result.created_at || result.date);
          if (newDate > currentDate) {
            existingProfile.lastActivityDate = result.created_at || result.date;
          }
        }
        
        // Conserver la popularité la plus élevée
        if (result.popularity && (!existingProfile.popularity || result.popularity > existingProfile.popularity)) {
          existingProfile.popularity = result.popularity;
        }
      }
      
      return; // Continuer avec l'élément suivant
    }
    
    // Déterminer le type de lieu
    let profileType = 'unknown';
    
    if (producer.type) {
      profileType = producer.type;
    } else if (result.type) {
      profileType = result.type;
    } else if (producer.schema_type === 'Event' || producer.eventDate || producer.event_date) {
      profileType = 'event';
    } else {
      // Deviner le type en fonction des propriétés
      if (producer.menu_items || producer.cuisine_type) {
        profileType = 'restaurant';
      } else if (producer.event_date || producer.performances || producer.eventDate) {
        profileType = 'event';
      } else if (producer.activities) {
        profileType = 'leisureProducer';
      } else if (producer.wellness_services || 
                 (producer.category && Array.isArray(producer.category) && 
                  producer.category.some(c => /spa|massage|bien-être/i.test(c)))) {
        profileType = 'wellnessProducer';
      } else if (producer.beauty_services || 
                 (producer.category && Array.isArray(producer.category) && 
                  producer.category.some(c => /beauté|coiffure|manucure/i.test(c)))) {
        profileType = 'beautyPlace';
      }
    }
    
    // Normaliser les catégories
    let categories = [];
    if (producer.category) {
      categories = Array.isArray(producer.category) 
        ? producer.category 
        : (typeof producer.category === 'string' ? [producer.category] : []);
    } else if (producer.cuisine_type) {
      categories = Array.isArray(producer.cuisine_type) 
        ? producer.cuisine_type 
        : (typeof producer.cuisine_type === 'string' ? [producer.cuisine_type] : []);
    } else if (producer.event_type || producer.eventType) {
      const eventType = producer.event_type || producer.eventType;
      categories = Array.isArray(eventType) 
        ? eventType 
        : (typeof eventType === 'string' ? [eventType] : []);
    } else if (producer.tags) {
      categories = Array.isArray(producer.tags) 
        ? producer.tags 
        : (typeof producer.tags === 'string' ? [producer.tags] : []);
    }
    
    // Pour les événements, ajouter la date si disponible
    let eventDate = null;
    if (profileType === 'event') {
      eventDate = producer.event_date || producer.eventDate || producer.date || null;
    }
    
    // Créer un profil normalisé pour l'UI
    const profile = {
      id: producerId,
      type: profileType,
      name: producer.name || producer.lieu || producer.title || producer.intitulé || 'Sans nom',
      address: producer.address || producer.adresse || producer.location_name || null,
      description: producer.description || producer.présentation || null,
      rating: producer.rating ? parseFloat(producer.rating) : null,
      image: producer.image || producer.photo || producer.thumbnail || (producer.photos && producer.photos.length > 0 ? producer.photos[0] : null),
      category: categories,
      priceLevel: producer.price_level || null,
      // Informations spécifiques aux événements
      eventDate: eventDate,
      venue: producer.venue || producer.lieu || null,
      // Structuration des données UI pour faciliter le rendu
      ui: {
        primaryLabel: producer.name || producer.lieu || producer.title || producer.intitulé || 'Sans nom',
        secondaryLabel: producer.address || producer.adresse || producer.location_name || null,
        rating: producer.rating ? {
          value: parseFloat(producer.rating),
          count: producer.user_ratings_total || producer.avis_total || 0
        } : null,
        priceLabel: producer.price_level ? '€'.repeat(parseInt(producer.price_level)) : null,
        categoryLabel: categories.length > 0 ? categories.join(', ') : null,
        color: getColorForType(profileType),
        icon: getIconNameForType(profileType)
      }
    };
    
    // Si c'est une activité (choice/interest), ajouter les informations d'utilisateur
    if (isActivity) {
      profile.userActivity = [];
      
      if (result.user && result.user.id) {
        profile.userActivity.push({
          userId: result.user.id,
          username: result.user.username,
          fullName: result.user.fullName,
          type: result.isInterest ? 'interest' : 'choice',
          date: result.created_at || result.date,
          comment: result.comment
        });
      }
      
      profile.lastActivityDate = result.created_at || result.date;
      profile.popularity = result.popularity || 1;
    }
    
    // Ajouter le profil à la map
    uniqueProfiles.set(producerId, profile);
  });
  
  // Convertir la map en array
  const extractedProfiles = Array.from(uniqueProfiles.values());
  console.log(`✅ Extraction terminée: ${extractedProfiles.length} profils uniques extraits sur ${results.length} résultats.`);
  
  return extractedProfiles;
}

/**
 * Retourne une couleur hexadécimale pour un type de profil
 * @param {string} type - Type de profil
 * @returns {string} - Code couleur hexadécimal
 */
function getColorForType(type) {
  switch (type) {
    case 'restaurant':
      return '#FF5722'; // Orange
    case 'leisureProducer':
      return '#673AB7'; // Deep Purple
    case 'event':
      return '#4CAF50'; // Green
    case 'wellnessProducer':
      return '#00BCD4'; // Cyan
    case 'beautyPlace':
      return '#E91E63'; // Pink
    case 'user':
      return '#2196F3'; // Blue
    default:
      return '#9E9E9E'; // Grey
  }
}

/**
 * Retourne un nom d'icône pour un type de profil
 * @param {string} type - Type de profil
 * @returns {string} - Nom d'icône (compatible Material Icons)
 */
function getIconNameForType(type) {
  switch (type) {
    case 'restaurant':
      return 'restaurant';
    case 'leisureProducer':
      return 'local_activity';
    case 'event':
      return 'event';
    case 'wellnessProducer':
      return 'spa';
    case 'beautyPlace':
      return 'content_cut';
    case 'user':
      return 'person';
    default:
      return 'place';
  }
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
 * Récupère les données sociales d'un utilisateur (amis, following, choices, interests)
 * @param {string} userId - ID de l'utilisateur
 * @returns {Promise<Object>} - Données sociales complètes
 */
async function getUserSocialData(userId) {
  try {
    if (!userId) {
      console.warn('⚠️ getUserSocialData called with no userId.');
      return { friends: [], following: [], interests: [] };
    }

    // Log connection state and model availability
    const connectionState = usersDb ? usersDb.readyState : 'N/A'; // 0: disconnected, 1: connected, 2: connecting, 3: disconnecting
    console.log(`ℹ️ [getUserSocialData] usersDb connection state: ${connectionState} (1 = connected)`);
    const User = mongoose.models['User']; // More robust way to check if model exists
    if (!User) {
      console.error('❌ [getUserSocialData] User model is not defined/loaded!');
      return { friends: [], following: [], interests: [] };
    }
    console.log(`ℹ️ [getUserSocialData] User model found. Attempting lookup for ID: ${userId}`);

    // Find the user by ID
    const userData = await User.findById(userId)
      .select('following followers trusted_circle interests followingProducers')
      .lean();
      
    if (!userData) {
      // This is the log you are seeing
      console.warn(`⚠️ [getUserSocialData] User data not found in DB for ID: ${userId}`); 
      return { friends: [], following: [], interests: [] };
    }

    // Ensure all social arrays are actually arrays
    const socialData = {
      friends: Array.isArray(userData.trusted_circle) ? userData.trusted_circle : [],
      following: Array.isArray(userData.following) ? userData.following : [],
      followers: Array.isArray(userData.followers) ? userData.followers : [],
      interests: Array.isArray(userData.interests) ? userData.interests : [],
      followingProducers: Array.isArray(userData.followingProducers) ? userData.followingProducers : []
    };
    
    console.log(`📊 Social data found for user ${userId}: ${socialData.friends.length} friends, ${socialData.following.length} following`);
    return socialData;
  } catch (error) {
    console.error('❌ Error getting user social data:', error);
    return { friends: [], following: [], interests: [] };
  }
}

/**
 * Enrichit les choices avec les détails des producteurs
 * @param {Array} choices - Liste des choices
 * @returns {Promise<Array>} - Choices enrichis
 */
async function enrichChoicesWithProducerDetails(choices) {
  if (!choices || choices.length === 0) return [];
  
  try {
    const producerIds = [...new Set(choices.map(c => c.producer_id))];
    if (producerIds.length === 0) return choices;
    
    // Créer un Map pour retrouver rapidement les producteurs
    const producerMap = new Map();
    
    // Récupérer les différents types de producteurs
    await Promise.all([
      // Restaurants
      (async () => {
        try {
          const Restaurant = restaurationDb.model("Restaurant", new mongoose.Schema({}, { strict: false }), "Lieux_Paris");
          const restaurants = await Restaurant.find({ _id: { $in: producerIds } });
          restaurants.forEach(r => {
            producerMap.set(r._id.toString(), {
              ...r.toObject(),
              type: 'restaurant'
            });
          });
        } catch (err) {
          console.error('Erreur lors de la récupération des restaurants:', err);
        }
      })(),
      
      // Loisirs
      (async () => {
        try {
          const LeisureProducer = loisirsDb.model("LeisureProducer", new mongoose.Schema({}, { strict: false }), "leisure_producers");
          const leisures = await LeisureProducer.find({ _id: { $in: producerIds } });
          leisures.forEach(l => {
            producerMap.set(l._id.toString(), {
              ...l.toObject(),
              type: 'leisureProducer'
            });
          });
        } catch (err) {
          console.error('Erreur lors de la récupération des loisirs:', err);
        }
      })(),
      
      // Événements
      (async () => {
        try {
          const Event = loisirsDb.model("Event", new mongoose.Schema({}, { strict: false }), "events");
          const events = await Event.find({ _id: { $in: producerIds } });
          events.forEach(e => {
            producerMap.set(e._id.toString(), {
              ...e.toObject(),
              type: 'event'
            });
          });
        } catch (err) {
          console.error('Erreur lors de la récupération des événements:', err);
        }
      })(),
      
      // Bien-être
      (async () => {
        try {
          const WellnessProducer = beautyWellnessDb.model("WellnessProducer", new mongoose.Schema({}, { strict: false }), "wellness_producers");
          const wellness = await WellnessProducer.find({ _id: { $in: producerIds } });
          wellness.forEach(w => {
            producerMap.set(w._id.toString(), {
              ...w.toObject(),
              type: 'wellnessProducer'
            });
          });
        } catch (err) {
          console.error('Erreur lors de la récupération des établissements bien-être:', err);
        }
      })(),
      
      // Beauté
      (async () => {
        try {
          const BeautyPlace = beautyWellnessDb.model("BeautyPlace", new mongoose.Schema({}, { strict: false }), "beauty_places");
          const beauty = await BeautyPlace.find({ _id: { $in: producerIds } });
          beauty.forEach(b => {
            producerMap.set(b._id.toString(), {
              ...b.toObject(),
              type: 'beautyPlace'
            });
          });
        } catch (err) {
          console.error('Erreur lors de la récupération des lieux de beauté:', err);
        }
      })()
    ]);
    
    // Enrichir les choices avec les données producteurs
    return choices.map(choice => {
      const producer = producerMap.get(choice.producer_id);
      return {
        ...choice.toObject(),
        producer: producer ? {
          id: producer._id.toString(),
          name: producer.name || producer.lieu || producer.intitulé,
          address: producer.address || producer.adresse,
          type: producer.type,
          rating: producer.rating,
          category: producer.category || producer.type_cuisine || [],
          image: producer.photo || producer.image || producer.photos?.[0],
          structured_data: producer.structured_data || null
        } : null
      };
    });
  } catch (error) {
    console.error('❌ Erreur lors de l\'enrichissement des choices:', error);
    return choices;
  }
}

/**
 * Enrichit les interests avec les détails des producteurs correspondants
 * @param {Array} interests - Liste des interests
 * @returns {Promise<Array>} - Interests enrichis avec les détails des producteurs
 */
async function enrichInterestsWithProducerDetails(interests) {
  if (!interests || interests.length === 0) return [];
  
  try {
    const producerIds = [...new Set(interests.map(i => i.producer_id).filter(id => id))];
    if (producerIds.length === 0) return interests;
    
    // Créer un Map pour retrouver rapidement les producteurs
    const producerMap = new Map();
    
    // Récupérer les différents types de producteurs
    await Promise.all([
      // Restaurants
      (async () => {
        try {
          const Restaurant = restaurationDb.model("Restaurant", new mongoose.Schema({}, { strict: false }), "Lieux_Paris");
          const restaurants = await Restaurant.find({ _id: { $in: producerIds } });
          restaurants.forEach(r => {
            producerMap.set(r._id.toString(), {
              ...r.toObject(),
              type: 'restaurant'
            });
          });
        } catch (err) {
          console.error('Erreur lors de la récupération des restaurants:', err);
        }
      })(),
      
      // Loisirs
      (async () => {
        try {
          const LeisureProducer = loisirDb.model("LeisureProducer", new mongoose.Schema({}, { strict: false }), "leisure_producers");
          const leisures = await LeisureProducer.find({ _id: { $in: producerIds } });
          leisures.forEach(l => {
            producerMap.set(l._id.toString(), {
              ...l.toObject(),
              type: 'leisureProducer'
            });
          });
        } catch (err) {
          console.error('Erreur lors de la récupération des loisirs:', err);
        }
      })(),
      
      // Événements
      (async () => {
        try {
          const Event = loisirDb.model("Event", new mongoose.Schema({}, { strict: false }), "events");
          const events = await Event.find({ _id: { $in: producerIds } });
          events.forEach(e => {
            producerMap.set(e._id.toString(), {
              ...e.toObject(),
              type: 'event'
            });
          });
        } catch (err) {
          console.error('Erreur lors de la récupération des événements:', err);
        }
      })(),
      
      // Bien-être
      (async () => {
        try {
          const WellnessProducer = beautyWellnessDb.model("WellnessProducer", new mongoose.Schema({}, { strict: false }), "wellness_producers");
          const wellness = await WellnessProducer.find({ _id: { $in: producerIds } });
          wellness.forEach(w => {
            producerMap.set(w._id.toString(), {
              ...w.toObject(),
              type: 'wellnessProducer'
            });
          });
        } catch (err) {
          console.error('Erreur lors de la récupération des établissements bien-être:', err);
        }
      })(),
      
      // Beauté
      (async () => {
        try {
          const BeautyPlace = beautyWellnessDb.model("BeautyPlace", new mongoose.Schema({}, { strict: false }), "beauty_places");
          const beauty = await BeautyPlace.find({ _id: { $in: producerIds } });
          beauty.forEach(b => {
            producerMap.set(b._id.toString(), {
              ...b.toObject(),
              type: 'beautyPlace'
            });
          });
        } catch (err) {
          console.error('Erreur lors de la récupération des lieux de beauté:', err);
        }
      })()
    ]);
    
    // Enrichir les interests avec les données producteurs
    return interests.map(interest => {
      const producer = producerMap.get(interest.producer_id);
      return {
        ...interest._doc || interest,
        producer: producer ? {
          id: producer._id.toString(),
          name: producer.name || producer.lieu || producer.intitulé,
          address: producer.address || producer.adresse,
          type: producer.type,
          rating: producer.rating,
          category: producer.category || producer.type_cuisine || [],
          image: producer.photo || producer.image || producer.photos?.[0],
          structured_data: producer.structured_data || null
        } : null,
        isInterest: true // Marqueur pour différencier des choices
      };
    });
  } catch (error) {
    console.error('❌ Erreur lors de l\'enrichissement des interests:', error);
    return interests.map(i => ({...i._doc || i, isInterest: true}));
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

// Fonction pour formater les réponses aux requêtes sociales
function formatSocialResponse(query, socialIntent, trendingData, socialData) {
  if (!trendingData || !trendingData.items || trendingData.items.length === 0) {
    if (socialData && (socialData.following.length > 0 || socialData.friends.length > 0)) {
      return `Je n'ai pas trouvé de choices correspondant à votre requête parmi votre réseau social de ${socialData.following.length + socialData.friends.length} personnes.`;
    } else {
      return "Je n'ai pas trouvé de relations sociales ou de choices correspondant à votre requête.";
    }
  }

  const { items, count } = trendingData;
  const totalConnections = (socialData?.following?.length || 0) + (socialData?.friends?.length || 0);

  let intro = '';
  switch (socialIntent) {
    case 'recent_choices':
      intro = `Voici les ${items.length} derniers choices de vos amis${getQueryContext(query)}:`;
      break;
    case 'best_choices':
      intro = `Voici les ${items.length} meilleurs choices de vos amis${getQueryContext(query)} (basés sur leurs notes et fréquentation):`;
      break;
    case 'popular_choices':
      intro = `Voici les ${items.length} choices les plus populaires parmi vos amis${getQueryContext(query)}:`;
      break;
    default:
      intro = `Voici ${items.length} choices de vos amis${getQueryContext(query)}:`;
  }

  // Formater chaque item
  const formattedItems = items.map((item, index) => {
    const producer = item.producer || {};
    const user = item.user || {};
    
    return `${index + 1}. **${producer.name || 'Lieu sans nom'}**
    - Choisi par: ${user.username || 'Anonyme'}${user.fullName ? ` (${user.fullName})` : ''}
    - Quand: ${formatDate(item.date || item.created_at)}
    - Adresse: ${producer.address || 'Non spécifiée'}
    - Note: ${producer.rating ? `${producer.rating}/5` : 'Non notée'}
    ${item.comment ? `- Commentaire: "${item.comment}"` : ''}`;
  }).join('\n\n');

  // Créer la réponse finale avec statistiques
  const response = `${intro}\n\n${formattedItems}\n\n${count > items.length ? `Il y a ${count} choices au total parmi vos ${totalConnections} relations.` : `Ce sont tous les choices correspondants parmi vos ${totalConnections} relations.`}`;
  
  return response;
}

// Fonction utilitaire pour extraire le contexte de la requête
function getQueryContext(query) {
  // Extraire le contexte (ex: "dans la restauration", "de manucure")
  const categoryMatches = query.match(/dans (la |le |les )?([\w\s]+)/) || 
                          query.match(/de ([\w\s]+)/);
  
  if (categoryMatches && categoryMatches.length > 1) {
    const category = categoryMatches[categoryMatches.length - 1].trim();
    return ` dans ${category}`;
  }
  
  // Détecter des catégories spécifiques
  if (query.toLowerCase().includes('restaurant') || 
      query.toLowerCase().includes('gastronomie') || 
      query.toLowerCase().includes('cuisine')) {
    return ' dans la restauration';
  }
  
  if (query.toLowerCase().includes('spectacle') || 
      query.toLowerCase().includes('théâtre') || 
      query.toLowerCase().includes('concert')) {
    return ' dans les spectacles';
  }
  
  if (query.toLowerCase().includes('musée') || 
      query.toLowerCase().includes('exposition') || 
      query.toLowerCase().includes('culture')) {
    return ' culturels';
  }
  
  return '';
}

// Fonction utilitaire pour formater les dates
function formatDate(dateString) {
  if (!dateString) return 'Date inconnue';
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Date invalide';
  
  const now = new Date();
  const diffTime = now - date;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return "Aujourd'hui";
  } else if (diffDays === 1) {
    return "Hier";
  } else if (diffDays < 7) {
    return `Il y a ${diffDays} jours`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `Il y a ${weeks} semaine${weeks > 1 ? 's' : ''}`;
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `Il y a ${months} mois`;
  } else {
    const years = Math.floor(diffDays / 365);
    return `Il y a ${years} an${years > 1 ? 's' : ''}`;
  }
}

/**
 * Récupère les tendances parmi les amis et following d'un utilisateur
 * @param {string} userId - ID de l'utilisateur
 * @param {string} type - Type de tendance ('recent_choices', 'best_choices', 'popular_choices')
 * @param {Object} filters - Filtres supplémentaires (catégorie, etc.)
 * @returns {Promise<Object>} - Tendances trouvées
 */
async function getTrendingAmongFriends(userId, type = 'recent_choices', filters = {}) {
  try {
    // Récupérer les données sociales complètes
    const socialData = await getUserSocialData(userId);
    
    if (!socialData || (!socialData.friends.length && !socialData.following.length)) {
      console.log(`❌ Aucune relation sociale trouvée pour l'utilisateur ${userId}`);
      return { items: [], count: 0 };
    }
    
    // Fusionner les choices et interests pour une vision complète
    const allConnectionsActivity = socialData.allConnectionsActivity || [];
    
    // Si vide, essayer de fusionner manuellement
    if (!allConnectionsActivity.length) {
      const choicesConnections = socialData.choices?.connections || [];
      const interestsConnections = socialData.interests?.connections || [];
      
      allConnectionsActivity.push(...choicesConnections, ...interestsConnections);
      
      // Trier par date décroissante
      allConnectionsActivity.sort((a, b) => {
        const dateA = new Date(a.created_at || a.date);
        const dateB = new Date(b.created_at || b.date);
        return dateB - dateA;
      });
    }
    
    console.log(`📊 Activités sociales trouvées: ${allConnectionsActivity.length}`);
    
    if (allConnectionsActivity.length === 0) {
      return { items: [], count: 0 };
    }

    // Appliquer les filtres de catégorie
    let filteredActivity = [...allConnectionsActivity];
    
    if (filters.category) {
      const categoryRegex = new RegExp(filters.category, 'i');
      
      filteredActivity = filteredActivity.filter(item => {
        const producer = item.producer || {};
        const categories = Array.isArray(producer.category) 
          ? producer.category 
          : (typeof producer.category === 'string' ? [producer.category] : []);
          
        return categories.some(cat => categoryRegex.test(cat)) ||
               categoryRegex.test(producer.type) ||
               (producer.name && categoryRegex.test(producer.name));
      });
    }
    
    // Si le filtre de restaurant est explicitement demandé
    if (filters.isRestaurant === true) {
      filteredActivity = filteredActivity.filter(item => 
        (item.producer?.type === 'restaurant') || 
        (item.producer?.category && item.producer.category.some(c => /restaurant|cuisine|gastro/i.test(c)))
      );
    }
    
    // Si le filtre de loisir est explicitement demandé
    if (filters.isLeisure === true) {
      filteredActivity = filteredActivity.filter(item => 
        (item.producer?.type === 'leisureProducer') || 
        (item.producer?.category && item.producer.category.some(c => /loisir|activité|culture|musée|cinéma|théâtre/i.test(c)))
      );
    }
    
    // Si le filtre d'événement est explicitement demandé
    if (filters.isEvent === true) {
      filteredActivity = filteredActivity.filter(item => 
        (item.producer?.type === 'event') || 
        (item.producer?.category && item.producer.category.some(c => /évènement|événement|festival|concert/i.test(c)))
      );
    }
    
    // Si le filtre de bien-être est explicitement demandé
    if (filters.isWellness === true) {
      filteredActivity = filteredActivity.filter(item => 
        (item.producer?.type === 'wellnessProducer') || 
        (item.producer?.category && item.producer.category.some(c => /bien-être|spa|massage|wellness/i.test(c)))
      );
    }
    
    // Si le filtre de beauté est explicitement demandé
    if (filters.isBeauty === true) {
      filteredActivity = filteredActivity.filter(item => 
        (item.producer?.type === 'beautyPlace') || 
        (item.producer?.category && item.producer.category.some(c => /beauté|maquillage|coiffure|manucure/i.test(c)))
      );
    }
    
    // Filtrer selon le type demandé
    let result = [];
    
    switch (type) {
      case 'recent_choices':
        // Prioriser les choices récents
        result = filteredActivity
          .filter(item => item.created_at || item.date)
          .sort((a, b) => {
            const dateA = new Date(a.created_at || a.date);
            const dateB = new Date(b.created_at || b.date);
            return dateB - dateA;
          });
        break;
        
      case 'best_choices':
        // Prioriser les lieux les mieux notés
        result = filteredActivity
          .filter(item => item.producer?.rating)
          .sort((a, b) => {
            const ratingA = parseFloat(a.producer?.rating || 0);
            const ratingB = parseFloat(b.producer?.rating || 0);
            return ratingB - ratingA;
          });
        break;
        
      case 'popular_choices':
        // Agréger par producteur et compter les occurrences
        const producerCounts = {};
        filteredActivity.forEach(item => {
          if (item.producer_id) {
            producerCounts[item.producer_id] = (producerCounts[item.producer_id] || 0) + 1;
          }
        });
        
        // Créer un Map pour éliminer les doublons et garder le plus récent
        const uniqueProducers = new Map();
        filteredActivity.forEach(item => {
          if (item.producer_id && (!uniqueProducers.has(item.producer_id) || 
             new Date(item.created_at || item.date) > new Date(uniqueProducers.get(item.producer_id).created_at || uniqueProducers.get(item.producer_id).date))) {
            uniqueProducers.set(item.producer_id, item);
          }
        });
        
        // Convertir en array et trier par popularité
        result = Array.from(uniqueProducers.values()).sort((a, b) => {
          const countA = producerCounts[a.producer_id] || 0;
          const countB = producerCounts[b.producer_id] || 0;
          return countB - countA;
        });
        
        // Ajouter le compteur de popularité
        result.forEach(item => {
          item.popularity = producerCounts[item.producer_id] || 1;
        });
        break;
        
      case 'interests_only':
        // Uniquement les interests (désirs), pas les choices (expériences réelles)
        result = filteredActivity.filter(item => item.isInterest).sort((a, b) => {
          const dateA = new Date(a.created_at || a.date);
          const dateB = new Date(b.created_at || b.date);
          return dateB - dateA;
        });
        break;
        
      case 'choices_only':
        // Uniquement les choices (expériences réelles), pas les interests (désirs)
        result = filteredActivity.filter(item => item.isChoice).sort((a, b) => {
          const dateA = new Date(a.created_at || a.date);
          const dateB = new Date(b.created_at || b.date);
          return dateB - dateA;
        });
        break;
        
      default:
        // Par défaut, tout récupérer par ordre chronologique
        result = filteredActivity.sort((a, b) => {
          const dateA = new Date(a.created_at || a.date);
          const dateB = new Date(b.created_at || b.date);
          return dateB - dateA;
        });
    }
    
    // Limiter le nombre de résultats (mais garder le count total)
    const limit = filters.limit || 10;
    return {
      items: result.slice(0, limit),
      count: result.length,
      type
    };
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des tendances:', error);
    return { items: [], count: 0 };
  }
}

// Step 4a: Handler for friend_choices intent
async function handleFriendChoicesQuery(query, userId, queryAnalysis, options = {}) {
  const startTime = Date.now();
  let result = {
    query,
    intent: 'friend_choices',
    entities: queryAnalysis.entities || {},
    resultCount: 0,
    executionTimeMs: 0,
    response: '',
    profiles: []
  };
  try {
    if (!userId) {
      result.response = "Vous devez être connecté pour voir les choices de vos amis.";
      return result;
    }
    // Get social data
    const socialData = await getUserSocialData(userId);
    
    // Determine if we should look at friends or followings based on entities or query text
    let sourceType = 'friends';
    const hasFollowingContext = 
      (queryAnalysis.entities && queryAnalysis.entities.social_context === 'followings') ||
      query.toLowerCase().includes('following') || 
      query.toLowerCase().includes('followings');
    
    if (hasFollowingContext) {
      sourceType = 'followings';
    }
    
    // Get the appropriate list of IDs based on sourceType
    let sourceIds = [];
    if (sourceType === 'friends') {
      sourceIds = socialData.friends || [];
      if (!sourceIds.length) {
        result.response = "Vous n'avez pas d'amis enregistrés dans l'application.";
        return result;
      }
    } else { // followings
      sourceIds = socialData.following || [];
      if (!sourceIds.length) {
        result.response = "Vous ne suivez aucun utilisateur dans l'application.";
        return result;
      }
    }
    
    // Get all choices made by friends/followings
    const Choice = mongoose.model('Choice');
    let choiceQuery = { user_id: { $in: sourceIds.map(id => mongoose.Types.ObjectId(id)) } };
    // Optional: filter by category/producer if present
    if (queryAnalysis.entities && queryAnalysis.entities.producer_id) {
      choiceQuery.producer_id = mongoose.Types.ObjectId(queryAnalysis.entities.producer_id);
    }
    if (queryAnalysis.entities && queryAnalysis.entities.producer_name) {
      // Try to find producer by name (restaurant, etc.)
      // For now, just log; could be improved with fuzzy search
    }
    // Find choices (most recent first)
    const choices = await Choice.find(choiceQuery).sort({ created_at: -1 }).limit(30);
    // Enrich with producer and user info
    const enrichedChoices = await enrichChoicesWithProducerDetails(choices);
    // Attach user info
    for (const choice of enrichedChoices) {
      const user = sourceIds.find(id => id === (choice.user_id?.toString?.() || choice.user_id));
      choice.user = user || null;
    }
    // Format response
    result.resultCount = enrichedChoices.length;
    result.profiles = extractProfiles(enrichedChoices);
    if (enrichedChoices.length === 0) {
      result.response = sourceType === 'friends' 
        ? "Aucun choix récent trouvé parmi vos amis."
        : "Aucun choix récent trouvé parmi les utilisateurs que vous suivez.";
    } else {
      const sourceLabel = sourceType === 'friends' ? 'vos amis' : 'les utilisateurs que vous suivez';
      result.response = `Voici les derniers lieux choisis par ${sourceLabel} :\n` +
        enrichedChoices.slice(0, 5).map((c, i) => `${i+1}. ${(c.producer && c.producer.name) || 'Lieu inconnu'}${c.comment ? ` ("${c.comment}")` : ''}`).join('\n');
    }
    result.executionTimeMs = Date.now() - startTime;
    return result;
  } catch (error) {
    console.error('❌ Erreur dans handleFriendChoicesQuery:', error);
    result.response = "Erreur lors de la récupération des choices des amis.";
    result.error = error.message;
    result.executionTimeMs = Date.now() - startTime;
    return result;
  }
}

// Step 4b: Handler for check_friends_choice_for_producer intent
async function handleCheckFriendsChoiceQuery(query, userId, queryAnalysis, options = {}) {
  const startTime = Date.now();
  let result = {
    query,
    intent: 'check_friends_choice_for_producer',
    entities: queryAnalysis.entities || {},
    resultCount: 0,
    executionTimeMs: 0,
    response: '',
    profiles: []
  };
  try {
    if (!userId) {
      result.response = "Vous devez être connecté pour voir quels amis ont choisi ce lieu.";
      return result;
    }
    // Get social data
    const socialData = await getUserSocialData(userId);
    
    // Determine if we should look at friends or followings based on entities or query text
    let sourceType = 'friends';
    const hasFollowingContext = 
      (queryAnalysis.entities && queryAnalysis.entities.social_context === 'followings') ||
      query.toLowerCase().includes('following') || 
      query.toLowerCase().includes('followings');
    
    if (hasFollowingContext) {
      sourceType = 'followings';
    }
    
    // Get the appropriate list of IDs based on sourceType
    let sourceIds = [];
    if (sourceType === 'friends') {
      sourceIds = socialData.friends || [];
      if (!sourceIds.length) {
        result.response = "Vous n'avez pas d'amis enregistrés dans l'application.";
        return result;
      }
    } else { // followings
      sourceIds = socialData.following || [];
      if (!sourceIds.length) {
        result.response = "Vous ne suivez aucun utilisateur dans l'application.";
        return result;
      }
    }
    
    // Determine producer filter
    let producerId = null;
    if (queryAnalysis.entities && queryAnalysis.entities.producer_id) {
      producerId = queryAnalysis.entities.producer_id;
    }
    // If only producer_name is present, try to find the producer by name
    if (!producerId && queryAnalysis.entities && queryAnalysis.entities.producer_name) {
      // Try to find a producer by name (restaurant, etc.)
      const name = queryAnalysis.entities.producer_name;
      // Try in Restaurant collection first
      const found = await Restaurant.findOne({ name: { $regex: new RegExp(name, 'i') } });
      if (found) producerId = found._id;
      // Could add more collections if needed
    }
    if (!producerId) {
      result.response = "Je n'ai pas pu identifier le lieu demandé dans votre requête.";
      return result;
    }
    // Get all choices made by friends/followings for this producer
    const Choice = mongoose.model('Choice');
    let choiceQuery = {
      user_id: { $in: sourceIds.map(id => mongoose.Types.ObjectId(id)) },
      producer_id: mongoose.Types.ObjectId(producerId)
    };
    const choices = await Choice.find(choiceQuery).sort({ created_at: -1 }).limit(30);
    // Enrich with producer and user info
    const enrichedChoices = await enrichChoicesWithProducerDetails(choices);
    // Attach user info
    for (const choice of enrichedChoices) {
      const user = sourceIds.find(id => id === (choice.user_id?.toString?.() || choice.user_id));
      choice.user = user || null;
    }
    // Format response
    result.resultCount = enrichedChoices.length;
    result.profiles = extractProfiles(enrichedChoices);
    if (enrichedChoices.length === 0) {
      const sourceLabel = sourceType === 'friends' ? 'vos amis' : 'des utilisateurs que vous suivez';
      result.response = `Aucun ${sourceLabel} n'a encore choisi ce lieu.`;
    } else {
      const sourceLabel = sourceType === 'friends' ? 'amis' : 'utilisateurs suivis';
      result.response = `Voici les ${sourceLabel} ayant choisi ce lieu :\n` +
        enrichedChoices.slice(0, 5).map((c, i) => `${i+1}. ID: ${(c.user && c.user.toString()) || 'Inconnu'}${c.comment ? ` ("${c.comment}")` : ''}`).join('\n');
    }
    result.executionTimeMs = Date.now() - startTime;
    return result;
  } catch (error) {
    console.error('❌ Erreur dans handleCheckFriendsChoiceQuery:', error);
    result.response = "Erreur lors de la récupération des choices pour ce lieu.";
    result.error = error.message;
    result.executionTimeMs = Date.now() - startTime;
    return result;
  }
}

/**
 * Logs user queries for analytics and debugging purposes
 * @param {string} userId - User ID making the query
 * @param {string} query - The query text
 * @param {object} result - The result object with response and profiles
 */
function logUserQuery(userId, query, result) {
  // Simple console log for debugging
  console.log(`📝 [Query Log] User ${userId || 'anonymous'} asked: "${query}". Found ${result.profiles?.length || 0} results.`);
  // In the future, this could log to database or analytics service
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
  getMockQueryResponse,
  formatSocialResponse,
  getQueryContext,
  formatDate,
  // Export new handlers for social intents
  handleFriendChoicesQuery,
  handleCheckFriendsChoiceQuery,
  // No need to export logUserQuery as it's used internally
};