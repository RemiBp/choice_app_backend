const aiService = require('../services/aiService');
const db = require('../db/config');
const mongoose = require('mongoose');

// GET /api/ai/:producerType/:producerId/recommendations
exports.getRecommendations = async (req, res) => {
    try {
        const { producerType, producerId } = req.params;

        // Si l'utilisateur est un producteur, vérifier que son ID correspond
        // Si c'est un compte utilisateur normal, il peut accéder à n'importe quel producteur
        if (req.user.accountType !== 'user' && req.user.id !== producerId) {
           console.warn(`Mismatch AI recommendations attempt for producer ${producerId} by ${req.user.accountType} ${req.user.id}`);
           return res.status(403).json({ message: 'Forbidden: User ID does not match producer ID for recommendations.' });
        }

        const validTypes = ['restaurant', 'leisureProducer', 'wellnessProducer', 'beautyPlace'];
        if (!validTypes.includes(producerType)) {
            return res.status(400).json({ message: 'Invalid producer type for recommendations' });
        }

        // Get DB connections - using the correct function names from db config
        const connections = {
            choiceAppDb: db.getChoiceAppConnection(),
            restaurationDb: db.getRestoConnection(),
            loisirsDb: db.getLoisirsConnection(),
            beautyWellnessDb: db.getBeautyConnection()
        };
        
        // Log connections for debugging
        console.log('[getRecommendations] Connections object:', connections);
        
        // Verify connections are valid before proceeding
        if (!connections.choiceAppDb || !connections.restaurationDb || 
            !connections.loisirsDb || !connections.beautyWellnessDb) {
            console.error('❌ One or more DB connections are undefined in getRecommendations');
            return res.status(500).json({
                message: 'Database connection error. Please try again later.'
            });
        }

        const recommendations = await aiService.fetchRecommendationsForProducer(producerId, producerType, connections);
        res.json(recommendations);
    } catch (error) {
        console.error('Error fetching AI recommendations:', error);
        res.status(500).json({ message: 'Error fetching AI recommendations', error: error.message });
    }
};

// POST /api/ai/producer-query
// NOTE: Cette fonction n'est plus utilisée directement par la route /api/ai/producer-query
// La route dans routes/ai.js appelle désormais directement aiService.processProducerQuery.
// Gardée ici pour référence ou usage potentiel ailleurs.
/*
exports.handleProducerQuery = async (req, res) => {
    try {
        const { producerId, message, producerType } = req.body;

        // DEBUG LOGGING:
        console.log('[handleProducerQuery] Received body:', JSON.stringify(req.body));
        console.log(`[handleProducerQuery] Extracted - producerId: ${producerId}, message: ${message ? message.substring(0, 50) + '...' : 'undefined'}, producerType: ${producerType}`);

        // Validate inputs
        if (!producerId || !message || !producerType) {
            console.error('[handleProducerQuery] Validation failed! Missing data.', { producerId, message: !!message, producerType });
            return res.status(400).json({ message: 'Missing producerId, message, or producerType in request body' });
        }
        
        const validTypes = ['restaurant', 'leisureProducer', 'wellnessProducer', 'beautyPlace'];
        if (!validTypes.includes(producerType)) {
            return res.status(400).json({ message: 'Invalid producer type for query' });
        }

        // Authenticated user check should have been done in the route middleware
        if (req.user.accountType !== 'user' && req.user.id !== producerId) {
            console.warn(`Mismatch AI query attempt for producer ${producerId} by ${req.user.accountType} ${req.user.id}`);
            return res.status(403).json({ message: 'Forbidden: User ID does not match producer ID for query.' });
        }

        // Get DB connections - using the correct function names
        const connections = {
            choiceAppDb: db.getChoiceAppConnection(),
            restaurationDb: db.getRestoConnection(),
            loisirsDb: db.getLoisirsConnection(),
            beautyWellnessDb: db.getBeautyConnection()
        };
        
        // Log and verify connections
        console.log('[handleProducerQuery] Connections object:', connections);
        
        if (!connections.choiceAppDb || !connections.restaurationDb || 
            !connections.loisirsDb || !connections.beautyWellnessDb) {
            console.error('❌ One or more DB connections are undefined in handleProducerQuery');
            return res.status(500).json({
                response: "Erreur de connexion à la base de données. Veuillez réessayer plus tard.",
                profiles: [],
                analysisResults: null
            });
        }

        // If kept, ensure connections are passed:
        const aiResponse = await aiService.processProducerQuery(producerId, producerType, message, connections);
        
        res.json(aiResponse);

    } catch (error) {
        console.error('Error handling producer AI query:', error);
        res.status(500).json({
             response: "Désolé, une erreur interne est survenue lors du traitement de votre demande.",
             profiles: [],
             analysisResults: null,
             error: error.message            
         });
    }
};
*/

// --- NEW: Controller for Producer Insights ---
exports.handleGetInsights = async (req, res) => {
    try {
        const { producerId } = req.params;

        // Authenticated user check
        if (req.user.accountType !== 'user' && req.user.id !== producerId) {
           console.warn(`Mismatch AI insights attempt for producer ${producerId} by ${req.user.accountType} ${req.user.id}`);
           return res.status(403).json({ message: 'Forbidden: User ID does not match producer ID for insights.' });
        }

        // Get DB connections - using the correct function names from db config
        const connections = {
            choiceAppDb: db.getChoiceAppConnection(),
            restaurationDb: db.getRestoConnection(),
            loisirsDb: db.getLoisirsConnection(),
            beautyWellnessDb: db.getBeautyConnection()
        };
       
        // --- Log connections before passing ---
        console.log('[handleGetInsights] Connections object:', connections);

        // --- Verify connections are valid before proceeding ---
        if (!connections.choiceAppDb || !connections.restaurationDb || 
            !connections.loisirsDb || !connections.beautyWellnessDb) {
            console.error('❌ One or more DB connections are undefined in handleGetInsights');
            return res.status(500).json({
                response: "Erreur de connexion à la base de données. Veuillez réessayer plus tard.",
                profiles: [],
                analysisResults: null
            });
        }

        // --- FIX: Pass connections object to the service function --- 
        const insightsResponse = await aiService.getProducerInsights(producerId, connections);

        // Send the structured response back to the frontend
        res.json(insightsResponse); // { response: "...", profiles: [...], analysisResults: {...} }

    } catch (error) {
        console.error('Error handling producer AI insights:', error);
        // Send a structured error response
        res.status(500).json({
             response: "Désolé, une erreur interne est survenue lors de la génération des insights.",
             profiles: [],
             analysisResults: null,
             error: error.message // Include error message in dev?
        });
    }
};

// --- Add other AI controller methods if needed --- 