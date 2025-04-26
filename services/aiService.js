// Service for AI-related features for producers
const analyticsService = require('./analyticsService'); // Use analytics data for context
const OpenAI = require('openai');
const db = require('../config/db'); // Assuming db is correctly configured elsewhere

// --- OpenAI Client Setup ---
let openai;
if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });
    console.log("✅ OpenAI client configured.");
} else {
    console.warn("⚠️ OpenAI API Key (OPENAI_API_KEY) is missing. AI query processing will be disabled or heavily limited.");
    // Optionally, implement a fallback mechanism or throw an error
}

// Helper function to get the correct database model based on type
const getModelForProducerType = (producerType, connections) => {
    // Ensure connections are valid
    if (!connections || !connections.restaurationDb || !connections.loisirsDb || !connections.beautyWellnessDb) {
         console.error("❌ Missing DB connections in getModelForProducerType");
         return null;
     }
    switch (producerType) {
        // Use the correct model names as defined in models/index.js or individual model files
        case 'restaurant': return connections.restaurationDb?.model('Producer'); // Assuming 'Producer' maps to restaurants
        case 'leisureProducer': return connections.loisirsDb?.model('LeisureProducer');
        case 'wellnessProducer': // Both wellness and beauty might use WellnessPlace mapping to BeautyPlaces collection
        case 'beautyPlace': return connections.beautyWellnessDb?.model('WellnessPlace'); // Check model definition
        // case 'beautyPlace': return connections.beautyWellnessDb?.model('BeautyPlace'); // Or if BeautyPlace model is distinct
        default:
            console.error(`Unsupported producer type for model fetching: ${producerType}`);
            return null;
    }
};

// --- NEW: Detect Producer Type ---
/**
 * Detects the type of a producer based on its ID by checking different collections.
 * @param {string} producerId - The ID of the producer.
 * @param {object} connections - Object containing DB connections.
 * @returns {Promise<string|null>} - The detected producer type ('restaurant', 'leisureProducer', 'beautyPlace'/'wellnessProducer') or null if not found.
 */
const detectProducerType = async (producerId, connections) => {
    const modelsToCheck = [
        { type: 'restaurant', model: getModelForProducerType('restaurant', connections) },
        { type: 'leisureProducer', model: getModelForProducerType('leisureProducer', connections) },
        { type: 'beautyPlace', model: getModelForProducerType('beautyPlace', connections) } // Using 'beautyPlace' as primary type for WellnessPlace model
    ];

    for (const { type, model } of modelsToCheck) {
        if (!model) {
            console.warn(`Model not available for type ${type} during detection.`);
            continue;
        }
        try {
            // Use findById which is generally efficient for ID lookups
            const exists = await model.findById(producerId).select('_id').lean(); // Only fetch _id for existence check
            if (exists) {
                console.log(`[detectProducerType] Producer ${producerId} detected as type: ${type}`);
                return type;
            }
        } catch (error) {
            // Ignore errors like CastError if ID format doesn't match, continue checking other models
            if (error.name !== 'CastError') {
                console.error(`Error checking producer type ${type} for ID ${producerId}:`, error);
            }
        }
    }
    console.log(`[detectProducerType] Producer ${producerId} not found in any known collection.`);
    return null; // Not found in any relevant collection
};
exports.detectProducerType = detectProducerType; // Export if needed elsewhere

// --- NEW: Fetch Producer Data Helper ---
/**
 * Fetches detailed data for a specific producer.
 * @param {string} producerId - The ID of the producer.
 * @param {string} producerType - The type of the producer.
 * @param {object} connections - Object containing DB connections.
 * @returns {Promise<object|null>} - Producer data object or null if not found/error.
 */
const _fetchProducerData = async (producerId, producerType, connections) => {
    const ProducerModel = getModelForProducerType(producerType, connections);
    if (!ProducerModel) {
        console.error(`Model not available for fetching data (${producerType}).`);
        return null;
    }
    try {
        // Fetch relevant fields, adjust as needed for context
        // Exclude large fields unless necessary for the query context
        const producer = await ProducerModel.findById(producerId)
            .select('name description category sous_categorie location contact rating choice_count interest_count favorite_count services reviews photos menu menu_items events') // Add/remove fields as needed
            .lean(); // Use lean for performance
        return producer;
    } catch (error) {
        console.error(`Error fetching producer data for ${producerType} ID ${producerId}:`, error);
        return null;
    }
};

// --- NEW: Format Profile Data Helper ---
/**
 * Formats raw producer/competitor data into the ProfileData structure expected by the frontend.
 * @param {object} doc - The raw document from Mongoose.
 * @param {string} type - The producer type ('restaurant', 'leisureProducer', etc.).
 * @returns {object} - Formatted ProfileData object.
 */
const _formatProfileData = (doc, type) => {
    if (!doc) return null;
    // Basic mapping, adjust based on actual model fields vs ProfileData needs
    return {
        id: doc._id?.toString(),
        name: doc.name || doc.lieu, // Use 'lieu' for leisure producers if 'name' is missing
        type: type,
        image: doc.profile_photo || doc.photo || doc.image || (doc.photos && doc.photos.length > 0 ? doc.photos[0] : null),
        rating: doc.rating?.average || doc.rating || doc.note_google, // Handle different rating structures
        ratingCount: doc.rating?.count || doc.user_ratings_total,
        address: doc.location?.address || doc.address || doc.formatted_address || doc.vicinity,
        coordinates: doc.location?.coordinates || doc.gps_coordinates?.coordinates, // Ensure correct coordinates format [lng, lat]
        priceLevel: doc.price_level,
        category: doc.category || doc.types,
        // Add other fields required by ProfileData if available in the doc
    };
};


/**
 * Fetches AI-generated recommendations for a producer, potentially based on performance.
 * @param {string} producerId - The ID of the producer.
 * @param {string} producerType - The type of producer.
 * @param {object} connections - Object containing DB connections.
 * @returns {Promise<Array<object>>} - A promise resolving to an array of recommendation objects.
 */
exports.fetchRecommendationsForProducer = async (producerId, producerType, connections) => {
    console.log(`Fetching recommendations for ${producerType} ID: ${producerId}`);
    // --- Existing recommendation logic ---
    // ... (keep the existing rule-based recommendation logic for now) ...
    // ... (code from original file lines 33-109) ...
    const ProducerModel = getModelForProducerType(producerType, connections);

    if (!ProducerModel) {
        console.error(`Database model not available for recommendations (${producerType}).`);
        return []; // Return empty on error
    }

    try {
        // Fetch basic producer data and KPIs
        const fieldsToSelect = 'name photos followers choice_count interest_count' +
                             (producerType === 'restaurant' ? ' menu menu_items' : '') +
                             (producerType === 'leisureProducer' ? ' events' : '') +
                             (producerType === 'beautyPlace' || producerType === 'wellnessProducer' ? ' services' : ''); // Add fields for wellness/beauty if needed

        const [producerData, kpis] = await Promise.all([
            ProducerModel.findById(producerId).select(fieldsToSelect).lean(), // Select relevant fields based on type
            analyticsService.fetchKpisForProducer(producerId, producerType, connections)
        ]);

        let recommendations = [];

        // --- Rule-Based Recommendation Engine --- 

        // 1. Photo Recommendation (if few photos)
        if (!producerData?.photos || producerData.photos.length < 5) {
            recommendations.push({
                title: "Ajouter des photos de qualité",
                description: "Les établissements avec 5+ photos HD obtiennent +30% d'interactions.",
                iconName: "photoCamera",
                impact: "Élevé",
                effort: "Faible"
            });
        }

        // 2. Promotion Recommendation (general)
        recommendations.push({
            title: "Créer une promotion",
            description: "Les promotions créent un pic d'engagement de +45% en moyenne.",
            iconName: "localOffer",
            impact: "Élevé",
            effort: "Moyen"
        });

        // 3. Type-Specific Recommendations
        if (producerType === 'restaurant' && (!producerData?.menu || producerData.menu.length === 0) && (!producerData?.menu_items || producerData.menu_items.length === 0)) {
            recommendations.push({
                title: "Ajouter/Mettre à jour votre menu",
                description: "Un menu complet et à jour améliore la visibilité et les commandes.",
                iconName: "restaurantMenu",
                impact: "Moyen",
                effort: "Moyen"
            });
        } else if (producerType === 'leisureProducer' && (!producerData?.events || producerData.events.length === 0)) { 
            recommendations.push({
                title: "Promouvoir un événement",
                description: "Les événements attirent de nouveaux clients et boostent les réservations.",
                iconName: "event",
                impact: "Élevé",
                effort: "Moyen"
            });
        }
        // Add similar checks for wellness/beauty (e.g., service list)
        else if ((producerType === 'beautyPlace' || producerType === 'wellnessProducer') && (!producerData?.services || producerData.services.length === 0)) {
             recommendations.push({
                 title: "Détailler vos prestations",
                 description: "Une liste claire des services aide les clients à choisir votre établissement.",
                 iconName: "listAlt", // Example icon
                 impact: "Moyen",
                 effort: "Moyen"
             });
         }


        // 4. Performance-Based Recommendation (Low visibility)
        const visibilityKpi = kpis.find(k => k.label.toLowerCase().includes('visibilit'));
        // Ensure kpi exists and value can be parsed before comparison
        if (visibilityKpi && visibilityKpi.value && (parseInt(visibilityKpi.value) < 500 || visibilityKpi.change?.startsWith('-'))) {
             recommendations.push({
                title: "Améliorer votre visibilité",
                description: "Interagissez avec les avis clients ou lancez une petite campagne publicitaire.",
                iconName: "trendingUp",
                impact: "Moyen",
                effort: "Moyen"
            });
        }
        
        // 5. Follower Engagement Recommendation
        // Ensure producerData and followers exist before checking length
        if (producerData?.followers && producerData.followers.length > 10) { // Example threshold
            recommendations.push({
                 title: "Engager vos abonnés",
                 description: "Publiez une actualité ou une offre spéciale pour votre communauté.",
                 iconName: "campaign", // Or appropriate icon
                 impact: "Moyen",
                 effort: "Faible"
             });
        }

        // Prioritize and limit recommendations
        // Basic slice for now, could add impact/effort scoring later
        return recommendations.slice(0, 3);

    } catch (error) {
        console.error(`Error fetching recommendations for producer ${producerId}:`, error);
        return []; 
    }
};


/**
 * Processes a natural language query from a producer using an LLM and database context.
 * @param {string} producerId - The ID of the producer making the query.
 * @param {string} producerTypeInput - The type of the producer (can be null, will be detected).
 * @param {string} message - The natural language query from the producer.
 * @param {object} connections - Object containing DB connections.
 * @returns {Promise<object>} - A promise resolving to an object { response: string, profiles: Array<object>, analysisResults: object|null }.
 */
exports.processProducerQuery = async (producerId, producerTypeInput, message, connections) => {
    console.log(`[aiService] Processing LLM query for producer ${producerId}: "${message}" (Type provided: ${producerTypeInput || 'None'})`);

    // Default response in case of errors
    let response = {
        response: "Désolé, une erreur est survenue lors du traitement de votre demande via l'IA.",
        profiles: [],
        analysisResults: null
    };

    // Check if OpenAI client is configured
    if (!openai) {
        console.error("OpenAI client not configured. Cannot process LLM query.");
        response.response = "Le service IA n'est pas correctement configuré. Impossible de traiter la demande.";
        return response;
    }

    try {
        // 1. Detect Producer Type if not provided
        const producerType = producerTypeInput || await detectProducerType(producerId, connections);
        if (!producerType) {
            response.response = "Impossible de déterminer le type de votre établissement. Vérification nécessaire.";
            return response;
        }
        console.log(`[aiService] Using producer type: ${producerType}`);

        // 2. Fetch Context Data (Producer's own data + Competitors)
        const [producerData, competitorsRaw] = await Promise.all([
            _fetchProducerData(producerId, producerType, connections),
            analyticsService.fetchCompetitorsForProducer(producerId, producerType, connections) // Use existing service
        ]);

        if (!producerData) {
            response.response = "Impossible de récupérer les données de votre établissement pour analyse.";
            return response;
        }

        // 3. Build the LLM Prompt
        // Simplify context for the prompt to avoid excessive length/cost
        const simplifiedProducerData = {
            name: producerData.name,
            type: producerType,
            description: producerData.description?.substring(0, 200), // Limit description length
            rating: producerData.rating?.average || producerData.rating,
            ratingCount: producerData.rating?.count || producerData.user_ratings_total,
            address: producerData.location?.address || producerData.address,
            city: producerData.location?.city,
            stats: {
                choices: producerData.choice_count,
                interests: producerData.interest_count,
                favorites: producerData.favorite_count
            },
            // Add key services/menu items summary if needed
        };

        const simplifiedCompetitors = competitorsRaw.slice(0, 5).map(c => ({ // Limit competitors in prompt
            name: c.name,
            rating: c.rating?.toFixed(1),
            ratingCount: c.ratingCount,
            // Maybe add relative distance if available from analyticsService
        }));

        const systemPrompt = `Vous êtes Choice Copilot, un assistant IA expert pour les propriétaires d'établissements locaux (restaurants, loisirs, beauté/bien-être). Votre but est d'analyser les données fournies et de répondre précisément à la question du propriétaire en langage naturel. Soyez concis, pertinent et professionnel. Si vous mentionnez des concurrents, indiquez leurs IDs pour référence. Répondez TOUJOURS en JSON avec les clés suivantes : "response" (votre réponse textuelle), "analysisResults" (un objet JSON contenant des données structurées pertinentes pour la question, ou null si non applicable), "profilesToHighlight" (un tableau d'IDs de concurrents mentionnés dans la réponse, ou un tableau vide).`;

        const userPrompt = `
        Contexte de mon établissement (${simplifiedProducerData.type}):
        Nom: ${simplifiedProducerData.name}
        Adresse: ${simplifiedProducerData.address || 'N/A'}, ${simplifiedProducerData.city || 'N/A'}
        Note moyenne: ${simplifiedProducerData.rating || 'N/A'} (${simplifiedProducerData.ratingCount || 0} avis)
        Description: ${simplifiedProducerData.description || 'N/A'}
        Statistiques utilisateurs (Choix/Intérêts/Favoris): ${simplifiedProducerData.stats.choices || 0}/${simplifiedProducerData.stats.interests || 0}/${simplifiedProducerData.stats.favorites || 0}

        Concurrents pertinents à proximité (Top 5):
        ${simplifiedCompetitors.length > 0 ? simplifiedCompetitors.map(c => `- ${c.name} (Note: ${c.rating || 'N/A'})`).join('\n') : 'Aucun concurrent direct identifié.'}

        Ma question: "${message}"

        Répondez en JSON comme demandé dans les instructions système. Basez votre analyse UNIQUEMENT sur le contexte fourni et la question.
        `;

        console.log(`[aiService] Sending prompt to OpenAI for producer ${producerId}...`);
        // console.log("--- PROMPT START ---"); // Uncomment for debugging prompt
        // console.log(userPrompt);
        // console.log("--- PROMPT END ---");

        // 4. Call OpenAI API
        const aiCompletion = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Or "gpt-4-turbo", choose based on cost/capability needs
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            response_format: { type: "json_object" }, // Use JSON mode
            temperature: 0.5, // Adjust for creativity vs factuality
            max_tokens: 500, // Adjust based on expected response length
        });

        // 5. Parse LLM Response
        const rawResponse = aiCompletion.choices[0]?.message?.content;
        console.log(`[aiService] Raw response from OpenAI for producer ${producerId}:`, rawResponse);

        if (!rawResponse) {
            throw new Error("OpenAI returned an empty response.");
        }

        let parsedResponse;
        try {
            parsedResponse = JSON.parse(rawResponse);
        } catch (parseError) {
            console.error("[aiService] Failed to parse OpenAI JSON response:", parseError);
            console.error("[aiService] Raw response was:", rawResponse);
            // Attempt to return the text part if parsing fails but text exists
            response.response = rawResponse.includes("response") ? rawResponse.substring(rawResponse.indexOf("response")) : "L'IA a retourné une réponse mal formée.";
            return response;
        }


        // Validate parsed response structure
        if (!parsedResponse || typeof parsedResponse.response !== 'string') {
            console.error("[aiService] OpenAI response missing 'response' key or is not a string.");
            response.response = "L'IA a retourné une réponse invalide (manque 'response').";
            return response;
        }

        response.response = parsedResponse.response;
        response.analysisResults = parsedResponse.analysisResults || null; // Store structured data if provided
        const profilesToHighlightIds = parsedResponse.profilesToHighlight || [];

        // 6. Fetch Highlighted Profiles (if any)
        if (Array.isArray(profilesToHighlightIds) && profilesToHighlightIds.length > 0) {
             console.log(`[aiService] Fetching details for highlighted profiles: ${profilesToHighlightIds.join(', ')}`);
             // Find the original competitor docs corresponding to the IDs
             const highlightedCompetitorDocs = competitorsRaw.filter(c => profilesToHighlightIds.includes(c._id?.toString()));

             // Determine the type of the competitors (assuming they are the same type as the producer for now)
             // A more robust approach might involve detecting each competitor's type if they can differ.
             const competitorType = producerType;

             // Format the highlighted profiles
             response.profiles = highlightedCompetitorDocs
                                     .map(doc => _formatProfileData(doc, competitorType))
                                     .filter(p => p !== null); // Filter out any nulls from formatting errors
        } else {
             response.profiles = []; // Ensure it's an empty array if no IDs
        }


        // 7. Return Structured Response
        console.log(`[aiService] Successfully processed LLM query for producer ${producerId}. Profiles count: ${response.profiles.length}`);
        return response;

    } catch (error) {
        console.error(`[aiService] Error processing LLM query for producer ${producerId}:`, error);
        // Handle specific OpenAI errors if needed (e.g., rate limits, API key issues)
        if (error.response) { // Axios-like error structure from OpenAI client
             console.error("[aiService] OpenAI API Error Details:", error.response.data);
             response.response = `Erreur de l'API IA: ${error.response.data?.error?.message || error.message}`;
        } else {
             response.response = `Une erreur technique est survenue lors de la communication avec l'IA: ${error.message}`;
        }
        response.profiles = [];
        response.analysisResults = null;
        return response;
    }
};

// --- Implementation for getProducerInsights ---
/**
 * Generates general business insights for a producer using LLM.
 * Reuses the processProducerQuery logic with a predefined query.
 * @param {string} producerId - The ID of the producer.
 * @param {object} connections - Object containing DB connections.
 * @returns {Promise<object>} - A promise resolving to an object { response: string, profiles: Array<object>, analysisResults: object|null }.
 */
exports.getProducerInsights = async (producerId, connections) => {
     console.log(`[aiService] Generating insights for producer ${producerId}...`);

     // Define the standard query for general insights
     const insightQuery = "Donne-moi un aperçu de ma situation actuelle. Analyse ma performance, mes points forts et faibles par rapport à mes concurrents directs (si possible), et suggère quelques pistes d'amélioration clés.";

     // Reuse the existing query processing function. It handles type detection, context fetching, LLM call, and response formatting.
     // Pass null for producerType to let processProducerQuery handle detection.
     try {
          const result = await exports.processProducerQuery(producerId, null, insightQuery, connections);
          console.log(`[aiService] Insights generation completed for producer ${producerId}.`);
          return result; // Return the structured result from processProducerQuery
     } catch (error) { // Catch errors specific to the insights generation flow if needed
          console.error(`[aiService] Error generating insights specifically for producer ${producerId}:`, error);
          // Return a standard error structure consistent with processProducerQuery's error handling
    return {
               response: "Désolé, une erreur est survenue lors de la génération de vos insights.",
               profiles: [],
               analysisResults: null,
               // Optionally include error details for internal logging/debugging
               // error: error.message
          };
     }
};
