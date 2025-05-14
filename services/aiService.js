// Service for AI-related features for producers
const analyticsService = require('./analyticsService'); // Use analytics data for context
const OpenAI = require('openai');
const mongoose = require('mongoose');
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
         console.error("❌ Missing DB connections in getModelForProducerType:", connections ? Object.keys(connections) : 'null');
         return null;
     }
    
    console.log(`[getModelForProducerType] Retrieving model for type: ${producerType}`);
    
    // Fix: Use the connection objects directly rather than calling model() on them
    switch (producerType) {
        case 'restaurant':
            // Get Restaurant/Producer model from the restaurationDb connection
            try {
                console.log(`[getModelForProducerType] Loading Producer model from Restauration_Officielle database, producers collection`);
                
                // First try to get the model if it's already registered
                if (connections.restaurationDb.models.Producer) {
                    console.log(`[getModelForProducerType] ✅ Using existing Producer model from models cache`);
                    return connections.restaurationDb.models.Producer;
                }
                
                // Use the Producer model from Producer.js
                const ProducerSchema = require('../models/Producer');
                const ProducerModel = ProducerSchema(connections.restaurationDb);
                
                console.log(`[getModelForProducerType] ✅ Producer model loaded successfully for 'producers' collection`);
                return ProducerModel;
            } catch (error) {
                console.error("❌ Error getting Producer model:", error);
                
                // Fallback approach
                try {
                    console.log(`[getModelForProducerType] 🔄 Trying fallback approach for Producer model`);
                    // Directly create minimal model pointing to producers collection
                    const mongoose = require('mongoose');
                    const Schema = mongoose.Schema;
                    const minimalSchema = new Schema({}, { 
                        collection: 'producers',
                        strict: false 
                    });
                    
                    try {
                        return connections.restaurationDb.model('Producer');
                    } catch (modelError) {
                        if (modelError.name === 'OverwriteModelError') {
                            return connections.restaurationDb.model('Producer');
                        }
                        return connections.restaurationDb.model('Producer', minimalSchema);
                    }
                } catch (fallbackError) {
                    console.error("❌ Even fallback Producer model creation failed:", fallbackError);
                    return null;
                }
            }
        case 'leisureProducer':
            try {
                // First check if model already exists in connection
                if (connections.loisirsDb.models.LeisureProducer) {
                    console.log(`[getModelForProducerType] ✅ Using existing LeisureProducer model`);
                    return connections.loisirsDb.models.LeisureProducer;
                }
                
                console.log(`[getModelForProducerType] 🔄 Registering LeisureProducer model with loisirsDb connection`);
                const LeisureSchema = require('../models/leisureProducer');
                const LeisureModel = LeisureSchema(connections.loisirsDb);
                
                console.log(`[getModelForProducerType] ✅ LeisureProducer model registered: ${LeisureModel.modelName}`);
                return LeisureModel;
            } catch (error) {
                console.error("❌ Error getting LeisureProducer model:", error);
                // Fallback to a minimal model if needed
                try {
                    console.log(`[getModelForProducerType] 🔄 Creating minimal LeisureProducer model from schema`);
                    const mongoose = require('mongoose');
                    const Schema = mongoose.Schema;
                    const minimalLeisureSchema = new Schema({}, { 
                        collection: 'Loisir_Paris_Producers', 
                        strict: false 
                    });
                    
                    try {
                        return connections.loisirsDb.model('LeisureProducer');
                    } catch (modelError) {
                        if (modelError.name === 'OverwriteModelError') {
                            return connections.loisirsDb.model('LeisureProducer');
                        }
                        return connections.loisirsDb.model('LeisureProducer', minimalLeisureSchema);
                    }
                } catch (fallbackError) {
                    console.error("❌ Even fallback LeisureProducer model creation failed:", fallbackError);
                    return null;
                }
            }
        case 'wellnessProducer': 
        case 'beautyPlace':
            try {
                // First check if model already exists in connection
                if (connections.beautyWellnessDb.models.WellnessPlace) {
                    console.log(`[getModelForProducerType] ✅ Using existing WellnessPlace model`);
                    return connections.beautyWellnessDb.models.WellnessPlace;
                }
                
                console.log(`[getModelForProducerType] 🔄 Registering WellnessPlace model with beautyWellnessDb connection`);
                const WellnessSchema = require('../models/WellnessPlace');
                const WellnessModel = WellnessSchema(connections.beautyWellnessDb);
                
                console.log(`[getModelForProducerType] ✅ WellnessPlace model registered: ${WellnessModel.modelName}`);
                return WellnessModel;
            } catch (error) {
                console.error("❌ Error getting WellnessPlace model:", error);
                // Fallback to a minimal model if needed
                try {
                    console.log(`[getModelForProducerType] 🔄 Creating minimal WellnessPlace model from schema`);
                    const mongoose = require('mongoose');
                    const Schema = mongoose.Schema;
                    const minimalWellnessSchema = new Schema({}, { 
                        collection: 'BeautyPlaces', 
                        strict: false 
                    });
                    
                    try {
                        return connections.beautyWellnessDb.model('WellnessPlace');
                    } catch (modelError) {
                        if (modelError.name === 'OverwriteModelError') {
                            return connections.beautyWellnessDb.model('WellnessPlace');
                        }
                        return connections.beautyWellnessDb.model('WellnessPlace', minimalWellnessSchema);
                    }
                } catch (fallbackError) {
                    console.error("❌ Even fallback WellnessPlace model creation failed:", fallbackError);
                    return null;
                }
            }
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
    // Vérification des connexions essentielles
    if (!connections) {
        console.error(`[detectProducerType] Connections object is missing for producerId ${producerId}`);
        throw new Error("Database connections required for producer type detection.");
    }

    if (!connections.restaurationDb || !connections.loisirsDb || !connections.beautyWellnessDb) {
        console.error(`[detectProducerType] Missing one or more required DB connections for producerId ${producerId}`);
        throw new Error("One or more database connections are missing.");
    }

    // Vérification de la validité de l'ID
    if (!producerId || typeof producerId !== 'string') {
        console.error(`[detectProducerType] Invalid producerId: ${producerId}`);
        throw new Error("Invalid producer ID format.");
    }

    console.log(`[detectProducerType] Starting type detection for producer ${producerId}`);
    
    // First try direct model checks
    try {
        // Fix: Use models from import or get from connections.models if available
    const modelsToCheck = [
            { 
                type: 'restaurant', 
                model: connections.restaurationDb.models.Producer || require('../models/Producer')(connections.restaurationDb),
                dbName: 'restaurationDb',
                collection: 'producers'
            },
            { 
                type: 'leisureProducer', 
                model: connections.loisirsDb.models.LeisureProducer || require('../models/leisureProducer')(connections.loisirsDb),
                dbName: 'loisirsDb',
                collection: 'Loisir_Paris_Producers'
            },
            { 
                type: 'wellnessProducer', 
                model: connections.beautyWellnessDb.models.WellnessPlace || require('../models/WellnessPlace')(connections.beautyWellnessDb),
                dbName: 'beautyWellnessDb',
                collection: 'BeautyPlaces'
            }
        ];

        console.log(`[detectProducerType] Checking across ${modelsToCheck.length} collections`);

        for (const { type, model, dbName, collection } of modelsToCheck) {
        if (!model) {
                console.warn(`[detectProducerType] Model not available for type ${type} (${dbName}) during detection.`);
            continue;
        }

        try {
                // Créer un ObjectId valide pour MongoDB
                const objectId = new mongoose.Types.ObjectId(producerId);
                
            // Use findById which is generally efficient for ID lookups
                console.log(`[detectProducerType] Checking ${type} (${collection}) for ID ${producerId}`);
                const exists = await model.findById(objectId).select('_id').lean(); // Only fetch _id for existence check
            if (exists) {
                    console.log(`[detectProducerType] ✅ Producer ${producerId} detected as type: ${type} in ${dbName}`);
                return type;
            }
        } catch (error) {
            // Ignore errors like CastError if ID format doesn't match, continue checking other models
                if (error.name === 'CastError') {
                    console.warn(`[detectProducerType] Invalid ID format for ${type} collection: ${producerId}`);
                } else {
                    console.error(`[detectProducerType] Error checking producer type ${type} for ID ${producerId}:`, error);
                }
            }
        }
        
        // If we couldn't find using the models, try direct collection access as fallback
        console.log(`[detectProducerType] ⚠️ No match found using models, trying direct collection access`);
        const objectId = new mongoose.Types.ObjectId(producerId);
        
        // Check restaurant collection directly
        try {
            const restaurantCollection = connections.restaurationDb.db.collection('producers');
            const restaurant = await restaurantCollection.findOne({ _id: objectId });
            if (restaurant) {
                console.log(`[detectProducerType] ✅ Found in producers collection via direct access`);
                return 'restaurant';
            }
        } catch (error) {
            console.warn(`[detectProducerType] Error checking producers collection directly:`, error.message);
        }
        
        // Check leisure collection directly
        try {
            const leisureCollection = connections.loisirsDb.db.collection('Loisir_Paris_Producers');
            const leisure = await leisureCollection.findOne({ _id: objectId });
            if (leisure) {
                console.log(`[detectProducerType] ✅ Found in Loisir_Paris_Producers collection via direct access`);
                return 'leisureProducer';
            }
        } catch (error) {
            console.warn(`[detectProducerType] Error checking Loisir_Paris_Producers collection directly:`, error.message);
        }
        
        // Check beauty collection directly
        try {
            const beautyCollection = connections.beautyWellnessDb.db.collection('BeautyPlaces');
            const beauty = await beautyCollection.findOne({ _id: objectId });
            if (beauty) {
                console.log(`[detectProducerType] ✅ Found in BeautyPlaces collection via direct access`);
                return 'wellnessProducer';
            }
        } catch (error) {
            console.warn(`[detectProducerType] Error checking BeautyPlaces collection directly:`, error.message);
        }
    
    } catch (error) {
        console.error(`[detectProducerType] Error during model-based detection:`, error);
    }
    
    // Run a diagnostic check as last attempt and for logging purposes
    try {
        const diagnosticResult = await diagnosticCheckProducer(producerId, connections);
        console.log(`[detectProducerType] Diagnostic results:`, 
            diagnosticResult.foundIn ? 
            `Found in ${diagnosticResult.foundIn.length} collections` : 
            'Not found in any collection'
        );
        
        if (diagnosticResult.foundIn && diagnosticResult.foundIn.length > 0) {
            // Return the type from the first found entry
            return diagnosticResult.foundIn[0].type;
        }
    } catch (diagError) {
        console.error(`[detectProducerType] Diagnostic check failed:`, diagError);
    }

    console.log(`[detectProducerType] ⚠️ Producer ${producerId} not found in any known collection.`);
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
    console.log(`[_fetchProducerData] Attempting to fetch data for ${producerType} with ID ${producerId}`);
    
    const ProducerModel = getModelForProducerType(producerType, connections);
    if (!ProducerModel) {
        console.error(`[_fetchProducerData] Model not available for fetching data (${producerType}).`);
        return null;
    }
    
    try {
        // Ensure producerId is a valid ObjectId
        let objectId;
        try {
            objectId = new mongoose.Types.ObjectId(producerId);
            console.log(`[_fetchProducerData] Created valid ObjectId: ${objectId}`);
        } catch (idError) {
            console.error(`[_fetchProducerData] Invalid ObjectId format for producer ID ${producerId}:`, idError);
            return null;
        }
        
        // Fetch ALL relevant fields to provide complete data access to the AI
        console.log(`[_fetchProducerData] Executing findById query with model: ${ProducerModel.modelName}`);
        const producer = await ProducerModel.findById(objectId)
            .select({
                // Basic info
                _id: 1,
                name: 1,
                description: 1,
                address: 1,
                gps_coordinates: 1,
                location: 1,
                geometry: 1,
                category: 1,
                sous_categorie: 1,
                
                // Contact info
                contact: 1,
                phone_number: 1,
                email: 1,
                website: 1,
                
                // Ratings and stats
                rating: 1,
                notes_globales: 1,
                ratingTotals: 1,
                ratingCount: 1,
                user_ratings_total: 1,
                
                // User interactions
                choice_count: 1,
                choiceCount: 1,
                interest_count: 1,
                favorite_count: 1,
                abonnés: 1,
                followers: 1,
                
                // Photos and media
                photos: 1,
                
                // Menu and food data - COMPLETE STRUCTURES
                menu: 1,                 // Base menu
                menu_items: 1,           // Individual items
                menus_structures: 1,     // Complete menu structures (one format)
                structured_data: 1,      // Complete menu structures (alternate format)
                
                // Specific data for restaurant type
                cuisine_type: 1,
                specialties: 1,
                opening_hours: 1,
                business_status: 1,
                price_level: 1,
                
                // Events & services
                events: 1,
                services: 1,
                service_options: 1,
                
                // Misc
                promotion: 1,
                promotion_active: 1
            })
            .lean(); // Use lean for performance
            
        if (!producer) {
            console.error(`[_fetchProducerData] No producer found with ID ${producerId} in ${producerType} collection`);
            return null;
        }
        
        console.log(`[_fetchProducerData] Successfully retrieved producer: ${producer.name || producerId}`);
        
        // Log information about menu structures for debugging
        if (producer.structured_data) {
            const menuCount = producer.structured_data['Menus Globaux']?.length || 0;
            const itemCatCount = producer.structured_data['Items Indépendants']?.length || 0;
            console.log(`[_fetchProducerData] Included structured_data with ${menuCount} menus and ${itemCatCount} item categories`);
        }
        
        if (producer.menus_structures) {
            const menuCount = producer.menus_structures['Menus_Globaux']?.length || 0;
            const itemCount = producer.menus_structures['Plats_Indépendants']?.length || 0;
            console.log(`[_fetchProducerData] Included menus_structures with ${menuCount} menus and ${itemCount} dishes`);
        }
        
        return producer;
    } catch (error) {
        console.error(`[_fetchProducerData] Error fetching producer data for ${producerType} ID ${producerId}:`, error);
        // Log more details about the error for better debugging
        if (error.name === 'CastError') {
            console.error(`[_fetchProducerData] CastError details: ${error.message}, kind: ${error.kind}, path: ${error.path}, value: ${error.value}`);
        }
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

// NEW: Direct collection check function for diagnostics
/**
 * Checks if a producer exists by directly querying the collection
 * This is a diagnostic function to help identify issues with model initialization
 * @param {string} producerId - The producer ID to check
 * @param {object} connections - Database connections
 * @returns {Promise<object>} - Result of the check including collection stats
 */
const diagnosticCheckProducer = async (producerId, connections) => {
    if (!connections) {
        return { success: false, error: 'Missing connections object', collections: [] };
    }
    
    const missingConnections = [];
    if (!connections.restaurationDb) missingConnections.push('restaurationDb');
    if (!connections.loisirsDb) missingConnections.push('loisirsDb');
    if (!connections.beautyWellnessDb) missingConnections.push('beautyWellnessDb');
    
    if (missingConnections.length > 0) {
        return { 
            success: false, 
            error: `Missing database connections: ${missingConnections.join(', ')}`, 
            collections: [] 
        };
    }
    
    try {
        console.log(`[diagnosticCheckProducer] 🔍 Checking for producer ${producerId} across all collections`);
        const objectId = new mongoose.Types.ObjectId(producerId);
        let results = { success: true, collections: {}, foundIn: [] };
        
        // Check Restaurant collections
        try {
            const restaurationDb = connections.restaurationDb.db;
            console.log(`[diagnosticCheckProducer] 📊 Connected to restaurant database: ${connections.restaurationDb.name} (actual collection: ${connections.restaurationDb.db.databaseName})`);
            
            const collections = await restaurationDb.listCollections().toArray();
            const collectionNames = collections.map(c => c.name);
            results.collections.restaurant = collectionNames;
            
            // Check producers collection (primary)
            if (collectionNames.includes('producers')) {
                const producersCollection = restaurationDb.collection('producers');
                const count = await producersCollection.countDocuments();
                console.log(`[diagnosticCheckProducer] 📈 Total documents in 'producers' collection: ${count}`);
                
                const producer = await producersCollection.findOne({ _id: objectId });
                if (producer) {
                    console.log(`[diagnosticCheckProducer] ✅ Found producer in 'producers' collection: ${producer.name || producer._id}`);
                    results.foundIn.push({
                        database: 'restaurationDb',
                        databaseName: connections.restaurationDb.name,
                        collection: 'producers',
                        name: producer.name || 'unnamed',
                        type: 'restaurant'
                    });
                }
            }
            
            // Check Restaurants_Paris collection (old collection)
            if (collectionNames.includes('Restaurants_Paris')) {
                const restaurantsCollection = restaurationDb.collection('Restaurants_Paris');
                const count = await restaurantsCollection.countDocuments();
                console.log(`[diagnosticCheckProducer] 📈 Total documents in 'Restaurants_Paris' collection: ${count}`);
                
                const producer = await restaurantsCollection.findOne({ _id: objectId });
                if (producer) {
                    console.log(`[diagnosticCheckProducer] ✅ Found producer in 'Restaurants_Paris' collection: ${producer.name || producer._id}`);
                    results.foundIn.push({
                        database: 'restaurationDb',
                        databaseName: connections.restaurationDb.name,
                        collection: 'Restaurants_Paris',
                        name: producer.name || 'unnamed',
                        type: 'restaurant'
                    });
                }
            }
        } catch (restaurantError) {
            console.error(`[diagnosticCheckProducer] Error checking restaurant collections:`, restaurantError);
            results.restaurantError = restaurantError.message;
        }
        
        // Check Leisure collections
        try {
            const loisirsDb = connections.loisirsDb.db;
            console.log(`[diagnosticCheckProducer] 📊 Connected to leisure database: ${connections.loisirsDb.name}`);
            
            const collections = await loisirsDb.listCollections().toArray();
            const collectionNames = collections.map(c => c.name);
            results.collections.leisure = collectionNames;
            
            // Check Loisir_Paris_Producers collection
            if (collectionNames.includes('Loisir_Paris_Producers')) {
                const leisureCollection = loisirsDb.collection('Loisir_Paris_Producers');
                const count = await leisureCollection.countDocuments();
                console.log(`[diagnosticCheckProducer] 📈 Total documents in 'Loisir_Paris_Producers' collection: ${count}`);
                
                const producer = await leisureCollection.findOne({ _id: objectId });
                if (producer) {
                    console.log(`[diagnosticCheckProducer] ✅ Found producer in 'Loisir_Paris_Producers' collection: ${producer.name || producer.lieu || producer._id}`);
                    results.foundIn.push({
                        database: 'loisirsDb',
                        collection: 'Loisir_Paris_Producers',
                        name: producer.name || producer.lieu || 'unnamed',
                        type: 'leisureProducer'
                    });
                }
            }
        } catch (leisureError) {
            console.error(`[diagnosticCheckProducer] Error checking leisure collections:`, leisureError);
            results.leisureError = leisureError.message;
        }
        
        // Check Beauty/Wellness collections
        try {
            const beautyWellnessDb = connections.beautyWellnessDb.db;
            console.log(`[diagnosticCheckProducer] 📊 Connected to beauty/wellness database: ${connections.beautyWellnessDb.name}`);
            
            const collections = await beautyWellnessDb.listCollections().toArray();
            const collectionNames = collections.map(c => c.name);
            results.collections.wellness = collectionNames;
            
            // Check BeautyPlaces collection
            if (collectionNames.includes('BeautyPlaces')) {
                const beautyCollection = beautyWellnessDb.collection('BeautyPlaces');
                const count = await beautyCollection.countDocuments();
                console.log(`[diagnosticCheckProducer] 📈 Total documents in 'BeautyPlaces' collection: ${count}`);
                
                const producer = await beautyCollection.findOne({ _id: objectId });
                if (producer) {
                    console.log(`[diagnosticCheckProducer] ✅ Found producer in 'BeautyPlaces' collection: ${producer.name || producer._id}`);
                    results.foundIn.push({
                        database: 'beautyWellnessDb',
                        collection: 'BeautyPlaces',
                        name: producer.name || 'unnamed',
                        type: 'wellnessProducer'
                    });
                }
            }
        } catch (wellnessError) {
            console.error(`[diagnosticCheckProducer] Error checking wellness collections:`, wellnessError);
            results.wellnessError = wellnessError.message;
        }
        
        // Add summary information
        if (results.foundIn.length === 0) {
            console.log(`[diagnosticCheckProducer] ⚠️ Producer ${producerId} not found in any collection`);
            results.message = `Producer ${producerId} not found in any collection`;
        } else {
            console.log(`[diagnosticCheckProducer] ✅ Producer ${producerId} found in ${results.foundIn.length} collections`);
            results.message = `Producer found in ${results.foundIn.length} ${results.foundIn.length === 1 ? 'collection' : 'collections'}`;
        }
        
        return results;
    } catch (error) {
        console.error(`[diagnosticCheckProducer] Error during diagnostic check:`, error);
        return { 
            success: false, 
            error: error.message,
            message: `Failed to check for producer: ${error.message}`
        };
    }
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

// Helper function to check if query suggests competitor analysis
const queryRequiresCompetitors = (query) => {
  if (!query) return false;
  const lowerQuery = query.toLowerCase();
  const keywords = ['concurrent', 'competitor', 'similaire', 'comparer', 'compare', 'vs', 'versus'];
  return keywords.some(keyword => lowerQuery.includes(keyword));
};

/**
 * Process a query for a specific producer using AI.
 * This function now orchestrates data fetching based on query intent.
 */
exports.processProducerQuery = async (producerId, query, producerType, connections) => {
    console.log(`[processProducerQuery] Processing query for ${producerType} ${producerId}: "${query}"`);
    const startTime = Date.now();

    if (!openai) {
        return {
            response: "Désolé, le service AI n'est pas configuré correctement (clé API manquante).",
            profiles: [],
            analysisResults: null,
            hasError: true,
        };
    }
     if (!connections) {
        console.error("❌ [processProducerQuery] DB Connections object is missing!");
        return { response: "Erreur interne: Connexions DB manquantes.", profiles: [], analysisResults: null, hasError: true };
    }


    try {
        // 1. Fetch Base Producer Data
        const producerDataResult = await _fetchProducerData(producerId, producerType, connections); 
        if (!producerDataResult || producerDataResult.hasError) {
            console.error(`❌ [processProducerQuery] Failed to fetch base data for producer ${producerId}`);
            return { response: producerDataResult?.error || "Impossible de récupérer les données de base du producteur.", profiles: [], analysisResults: null, hasError: true };
        }
        const producerData = producerDataResult; // Use the result object which might contain the profile

        // 2. Fetch Competitor Data (Conditional)
        let competitors = [];
        let competitorAnalysisPrompt = "";
        if (queryRequiresCompetitors(query)) {
            console.log(`[processProducerQuery] Query suggests competitor analysis. Fetching competitors...`);
            // Utilise la fonction fetchCompetitorsForProducer de analyticsService
             if (analyticsService.fetchCompetitorsForProducer) {
                 competitors = await analyticsService.fetchCompetitorsForProducer(producerId, producerType, connections);
                 console.log(`[processProducerQuery] Fetched ${competitors.length} competitors for analysis`);
                 if (competitors.length > 0) {
                    // Format competitor data concisely for the prompt
                    // Corrected multi-line string for prompt
                    competitorAnalysisPrompt = `

Concurrents pertinents à proximité :
${competitors.map((c, i) =>
                            `${i + 1}. ${c.name} (${c.category?.join(', ') || 'N/A'}) - Note: ${c.rating || 'N/A'}, Prix: ${c.priceLevel || 'N/A'}`
                        ).join('\n')}`;
                 }
             } else {
                 console.warn("[processProducerQuery] analyticsService.fetchCompetitorsForProducer is not available.");
             }
        } else {
            console.log("[processProducerQuery] Query does not seem to require competitor analysis.");
        }

        // 3. Fetch other relevant data based on query (Placeholder for future 'smart' logic)
        // Example: If query mentions "nearby" or "quartier", fetch local insights
        let localInsightsPrompt = "";
        if (query.toLowerCase().includes("près de") || query.toLowerCase().includes("quartier")) {
             // TODO: Implement fetching local insights from analyticsService
             // localInsights = await analyticsService.fetchLocalInsights(producerData.profile.location);
             // Corrected multi-line string assignment
             localInsightsPrompt = `

Tendances locales observées:
...`;
             console.log("[processProducerQuery] Query mentions locality, fetching local insights (TODO)");
        }


        // 4. Build Enhanced Prompt - Ensure producerData.profile exists
        if (!producerData.profile) {
             console.error(`❌ [processProducerQuery] Producer profile data is missing after fetch for ${producerId}`);
             return { response: "Erreur interne: Données de profil producteur manquantes.", profiles: [], analysisResults: null, hasError: true };
        }
        const enhancedPrompt = _buildEnhancedPrompt(
            producerData.profile, 
            query,
            competitorAnalysisPrompt, // Only add if competitors were fetched
            localInsightsPrompt       // Only add if local insights were fetched
        );
         console.log(`[processProducerQuery] Sending enhanced prompt to OpenAI for producer ${producerId}...`);
         // console.log("--- PROMPT START ---"); // Optional: Log prompt for debugging
         // console.log(enhancedPrompt);
         // console.log("--- PROMPT END ---");

        // 5. Query OpenAI
        const completion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
            messages: [
                { role: "system", content: "You are a helpful assistant for business owners (restaurants, leisure places, wellness centers) using the Choice app. Provide concise, actionable insights based on the provided data. Respond in French. Format your response clearly. If you extract competitor or user profiles, list them under a 'profiles' key in a JSON object containing your main textual response under a 'response' key, and any structured analysis under 'analysisResults'." },
                { role: "user", content: enhancedPrompt }
            ],
            // Add timeout configuration if supported by the OpenAI library version
            // timeout: 40000 // Example: 40 seconds timeout for OpenAI call
        });

        const llmResponseContent = completion.choices[0]?.message?.content;
        if (!llmResponseContent) {
            throw new Error("Réponse vide reçue de l'API OpenAI.");
        }

        // 6. Process Response (with robust JSON parsing)
        let finalResponse = "Désolé, je n'ai pas pu générer de réponse claire.";
        let extractedProfiles = [];
        let analysisResults = null;
        let parsedJson = null;

        try {
             // Try to parse the entire response as JSON first
             parsedJson = JSON.parse(llmResponseContent);
             if (typeof parsedJson === 'object' && parsedJson !== null) {
                 finalResponse = parsedJson.response || llmResponseContent; // Fallback to full content if 'response' key is missing
                 extractedProfiles = Array.isArray(parsedJson.profiles) ? parsedJson.profiles : [];
                 analysisResults = parsedJson.analysisResults || null;
             } else {
                  // If it parses but isn't an object, treat the whole thing as the text response
                  finalResponse = llmResponseContent;
             }
        } catch (e) {
             console.warn(`[processProducerQuery] Failed to parse OpenAI response as JSON: ${e.message}. Treating as plain text.`);
             // console.log("[processProducerQuery] Raw OpenAI response content:", llmResponseContent); // Log raw response on parse error
             finalResponse = llmResponseContent; // Use the raw response if JSON parsing fails
             // Attempt to extract profiles using regex as a fallback (less reliable)
             // extractedProfiles = _extractProfilesFromText(llmResponseContent);
        }

        // Ensure profiles are mapped correctly for the frontend
        const frontendProfiles = extractedProfiles.map(p => ({
             id: p.id || p._id || new mongoose.Types.ObjectId().toString(), // Generate ID if missing
             name: p.name || 'Profil Inconnu',
             type: p.type || 'unknown', // Try to determine type or set default
             avatar: p.avatar || p.image || p.photo || null,
             bio: p.bio || p.description || '',
             interests: p.interests || p.tags || [],
        }));


        const endTime = Date.now();
        const executionTime = endTime - startTime;
         console.log(`📊 [Route] Résultats requête producteur - ${frontendProfiles.length} profils extraits (Intent: ${queryRequiresCompetitors(query) ? 'competitor_analysis' : 'producer_query'})`);
         console.log(`⏱️ [Route] Temps d'exécution: ${executionTime}ms`);

        return {
            response: finalResponse,
            profiles: frontendProfiles,
            analysisResults: analysisResults,
            hasError: false,
        };

    } catch (error) {
        const endTime = Date.now();
        const executionTime = endTime - startTime;
        console.error(`❌ Error in processProducerQuery for ${producerId} (took ${executionTime}ms):`, error);
        return {
            response: `Désolé, une erreur est survenue lors du traitement de votre demande${error.message ? ': ' + error.message : '.'}.`,
            profiles: [],
            analysisResults: null,
            hasError: true,
        };
    }
};

// --- Build Enhanced Prompt Function ---
/**
 * Builds the detailed prompt for the LLM, including producer data, query, and context.
 */
const _buildEnhancedPrompt = (producerProfile, userQuery, competitorContext = "", localContext = "") => {
    let prompt = `Analyse la situation pour le producteur suivant et réponds à sa question.\n`; // Added \n
    prompt += `Producteur: ${producerProfile.name} (Type: ${producerProfile.type || 'Non spécifié'})\n`; // Added \n
    prompt += `Localisation: ${producerProfile.address || 'Non spécifiée'}\n`; // Added \n
    if (producerProfile.category && producerProfile.category.length > 0) {
        prompt += `Catégories/Types: ${producerProfile.category.join(', ')}\n`; // Added \n
    }
    if (producerProfile.rating) {
         prompt += `Note Moyenne: ${producerProfile.rating}\n`; // Added \n
    }
    if (producerProfile.priceLevel) {
         prompt += `Niveau de Prix: ${producerProfile.priceLevel}\n`; // Added \n
    }

    // Include Menu/Services if available (keep it concise)
    if (producerProfile.structured_data) {
        prompt += "\nOffre Principale (résumé):\n"; // Added \n
        // Summarize structured data - example for restaurant menu
        if (producerProfile.structured_data.Menus) {
             prompt += `- Menus: ${producerProfile.structured_data.Menus.map(m => m.nom).slice(0, 3).join(', ')}...\n`; // Added \n
        }
        if (producerProfile.structured_data['Items Indépendants']) {
             const categories = Object.keys(producerProfile.structured_data['Items Indépendants']).slice(0, 4);
             prompt += `- Catégories d'items: ${categories.join(', ')}...\n`; // Added \n
        }
         // Add similar summaries for Leisure/Wellness structured data if applicable
    } else if (producerProfile.description) {
         prompt += `Description: ${producerProfile.description.substring(0, 150)}...\n`; // Added \n
    }

    prompt += `\nQuestion du producteur: "${userQuery}"\n`; // Added \n

    // Add contextual information if available
    if (competitorContext) {
        prompt += competitorContext; // Add the pre-formatted competitor string
    }
    if (localContext) {
        prompt += localContext; // Add the pre-formatted local insights string
    }

    prompt += "\nInstructions pour ta réponse:\n" // Added \n

    prompt += "1. Réponds directement et clairement à la question.\n"; // Added \n
    prompt += "2. Base ta réponse sur les données fournies sur le producteur et le contexte (concurrents, tendances locales si fournis).\n"; // Added \n
    prompt += "3. Sois concis et donne des conseils actionnables si pertinent.\n"; // Added \n
    prompt += "4. Si tu identifies des profils spécifiques (concurrents, utilisateurs mentionnés), extrais-les dans une clé 'profiles' au format JSON [{id, name, type, avatar,...}].\n"; // Added \n
    prompt += "5. Structure ta réponse principale sous la clé 'response'. Si tu fais une analyse structurée (ex: menu), mets-la sous 'analysisResults'.\n"; // Added \n
    prompt += "6. Adopte un ton professionnel et encourageant. Réponds en français.";

    return prompt;
};

// --- Fetch Producer Data Helper ---
/**
 * Fetches and formats data for a specific producer.
 */
// const _fetchProducerData = async (producerId, producerType, connections) => { ... }; // Keep the first declaration

// --- Format Profile Data Helper ---
/**
 * Formats raw producer document into a standardized profile object.
 */
// const _formatProfileData = (doc, type) => { ... }; // Keep the first declaration

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
     // --- Log received connections ---
     console.log('[getProducerInsights] Received connections:', connections); // Added log

     // Define the standard query for general insights
     const insightQuery = "Donne-moi un aperçu de ma situation actuelle. Analyse ma performance, mes points forts et faibles par rapport à mes concurrents directs (si possible), et suggère quelques pistes d'amélioration clés.";

     // Reuse the existing query processing function. It handles type detection, context fetching, LLM call, and response formatting.
     // Pass null for producerType to let processProducerQuery handle detection.
     try {
          // --- Log connections before passing down ---
          console.log('[getProducerInsights] Passing connections to processProducerQuery:', connections); // Added log
          
          // Need to detect producerType first before calling processProducerQuery
          const detectedType = await detectProducerType(producerId, connections);
          if (!detectedType) {
             console.error(`[getProducerInsights] Could not detect producer type for ${producerId}`);
             return {
                 response: "Impossible de déterminer le type de votre établissement pour générer les insights.",
                 profiles: [],
                 analysisResults: null,
                 hasError: true,
             };
          }
          
          const result = await exports.processProducerQuery(producerId, insightQuery, detectedType, connections);
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

/**
 * Checks the status of database connections and logs detailed information
 * @param {object} connections - The database connections object
 * @returns {Promise<object>} - Connection status details
 */
const checkDatabaseStatus = async (connections) => {
    if (!connections) {
        console.error(`[checkDatabaseStatus] ❌ No connections object provided`);
        return { success: false, error: 'No connections object provided' };
    }
    
    const status = {
        success: true,
        connections: {}
    };
    
    console.log(`[checkDatabaseStatus] 🔍 Checking database connections status...`);
    
    // Check choiceAppDb
    if (connections.choiceAppDb) {
        try {
            const dbName = connections.choiceAppDb.name;
            const actualDbName = connections.choiceAppDb.db.databaseName;
            const readyState = connections.choiceAppDb._readyState;
            const isConnected = readyState === 1;
            
            status.connections.choiceAppDb = {
                name: dbName,
                actualName: actualDbName,
                isConnected: isConnected,
                readyState: readyState
            };
            
            console.log(`[checkDatabaseStatus] choiceAppDb: ${isConnected ? '✅ Connected' : '❌ Disconnected'} to ${dbName} (${actualDbName})`);
        } catch (error) {
            console.error(`[checkDatabaseStatus] ❌ Error checking choiceAppDb:`, error);
            status.connections.choiceAppDb = { error: error.message };
            status.success = false;
        }
    } else {
        console.error(`[checkDatabaseStatus] ❌ choiceAppDb connection missing`);
        status.connections.choiceAppDb = { error: 'Connection missing' };
        status.success = false;
    }
    
    // Check restaurationDb
    if (connections.restaurationDb) {
        try {
            const dbName = connections.restaurationDb.name;
            const actualDbName = connections.restaurationDb.db.databaseName;
            const readyState = connections.restaurationDb._readyState;
            const isConnected = readyState === 1;
            
            // Check if models are registered
            const registeredModels = Object.keys(connections.restaurationDb.models || {});
            
            status.connections.restaurationDb = {
                name: dbName,
                actualName: actualDbName,
                isConnected: isConnected,
                readyState: readyState,
                models: registeredModels
            };
            
            console.log(`[checkDatabaseStatus] restaurationDb: ${isConnected ? '✅ Connected' : '❌ Disconnected'} to ${dbName} (${actualDbName})`);
            console.log(`[checkDatabaseStatus] restaurationDb registered models: ${registeredModels.join(', ') || 'None'}`);
            
            // Check if the 'producers' collection exists and count documents
            if (isConnected) {
                try {
                    const collections = await connections.restaurationDb.db.listCollections().toArray();
                    const collectionNames = collections.map(c => c.name);
                    status.connections.restaurationDb.collections = collectionNames;
                    
                    if (collectionNames.includes('producers')) {
                        const count = await connections.restaurationDb.db.collection('producers').countDocuments();
                        status.connections.restaurationDb.producersCount = count;
                        console.log(`[checkDatabaseStatus] restaurationDb 'producers' collection: ${count} documents`);
                    } else {
                        console.log(`[checkDatabaseStatus] ⚠️ restaurationDb: 'producers' collection not found`);
                    }
                } catch (collError) {
                    console.error(`[checkDatabaseStatus] ❌ Error listing collections in restaurationDb:`, collError);
                }
            }
        } catch (error) {
            console.error(`[checkDatabaseStatus] ❌ Error checking restaurationDb:`, error);
            status.connections.restaurationDb = { error: error.message };
            status.success = false;
        }
    } else {
        console.error(`[checkDatabaseStatus] ❌ restaurationDb connection missing`);
        status.connections.restaurationDb = { error: 'Connection missing' };
        status.success = false;
    }
    
    // Check loisirsDb
    if (connections.loisirsDb) {
        try {
            const dbName = connections.loisirsDb.name;
            const actualDbName = connections.loisirsDb.db.databaseName;
            const readyState = connections.loisirsDb._readyState;
            const isConnected = readyState === 1;
            
            status.connections.loisirsDb = {
                name: dbName,
                actualName: actualDbName,
                isConnected: isConnected,
                readyState: readyState
            };
            
            console.log(`[checkDatabaseStatus] loisirsDb: ${isConnected ? '✅ Connected' : '❌ Disconnected'} to ${dbName} (${actualDbName})`);
        } catch (error) {
            console.error(`[checkDatabaseStatus] ❌ Error checking loisirsDb:`, error);
            status.connections.loisirsDb = { error: error.message };
            status.success = false;
        }
    } else {
        console.error(`[checkDatabaseStatus] ❌ loisirsDb connection missing`);
        status.connections.loisirsDb = { error: 'Connection missing' };
        status.success = false;
    }
    
    // Check beautyWellnessDb
    if (connections.beautyWellnessDb) {
        try {
            const dbName = connections.beautyWellnessDb.name;
            const actualDbName = connections.beautyWellnessDb.db.databaseName;
            const readyState = connections.beautyWellnessDb._readyState;
            const isConnected = readyState === 1;
            
            status.connections.beautyWellnessDb = {
                name: dbName,
                actualName: actualDbName,
                isConnected: isConnected,
                readyState: readyState
            };
            
            console.log(`[checkDatabaseStatus] beautyWellnessDb: ${isConnected ? '✅ Connected' : '❌ Disconnected'} to ${dbName} (${actualDbName})`);
        } catch (error) {
            console.error(`[checkDatabaseStatus] ❌ Error checking beautyWellnessDb:`, error);
            status.connections.beautyWellnessDb = { error: error.message };
            status.success = false;
        }
    } else {
        console.error(`[checkDatabaseStatus] ❌ beautyWellnessDb connection missing`);
        status.connections.beautyWellnessDb = { error: 'Connection missing' };
        status.success = false;
    }
    
    return status;
};

// Export for potential use elsewhere
exports.checkDatabaseStatus = checkDatabaseStatus;
