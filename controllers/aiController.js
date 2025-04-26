const aiService = require('../services/aiService');
const db = require('../config/db');
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

        const connections = {
             choiceAppDb: db.getChoiceAppDb(),
             restaurationDb: db.getRestaurationDb(),
             loisirsDb: db.getLoisirsDb(),
             beautyWellnessDb: db.getBeautyWellnessDb()
        }

        const recommendations = await aiService.fetchRecommendationsForProducer(producerId, producerType, connections);
        res.json(recommendations);
    } catch (error) {
        console.error('Error fetching AI recommendations:', error);
        res.status(500).json({ message: 'Error fetching AI recommendations', error: error.message });
    }
};

// POST /api/ai/producer-query
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
        // Si l'utilisateur est un producteur, vérifier que son ID correspond
        // Si c'est un compte utilisateur normal, il peut interroger n'importe quel producteur
        if (req.user.accountType !== 'user' && req.user.id !== producerId) {
            console.warn(`Mismatch AI query attempt for producer ${producerId} by ${req.user.accountType} ${req.user.id}`);
            return res.status(403).json({ message: 'Forbidden: User ID does not match producer ID for query.' });
        }

        // DEBUG: Vérification des connexions DB
        const choiceAppDbConn = db.getChoiceAppDb();
        const restaurationDbConn = db.getRestaurationDb();
        const loisirsDbConn = db.getLoisirsDb();
        const beautyWellnessDbConn = db.getBeautyWellnessDb();

        console.log(`[DEBUG] MongoDB connections state:
        - choiceAppDb: ${choiceAppDbConn ? 'OK' : 'NULL/UNDEFINED'}
        - restaurationDb: ${restaurationDbConn ? 'OK' : 'NULL/UNDEFINED'}
        - loisirsDb: ${loisirsDbConn ? 'OK' : 'NULL/UNDEFINED'}
        - beautyWellnessDb: ${beautyWellnessDbConn ? 'OK' : 'NULL/UNDEFINED'}
        `);

        // Si l'une des connexions est manquante, tenter une réinitialisation
        if (!choiceAppDbConn || !restaurationDbConn || !loisirsDbConn || !beautyWellnessDbConn) {
            console.log("[DEBUG] Attempt to reconnect to databases...");
            // Tenter de se reconnecter ou réinitialiser les connections
            // Vérifier aussi l'état de la connexion principale mongoose
            console.log(`[DEBUG] Mongoose connection state: ${mongoose.connection.readyState}`);
            // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
            
            // Si mongoose est connecté, tenter de recréer les connexions aux bases
            if (mongoose.connection.readyState === 1) {
                console.log("[DEBUG] Mongoose is connected, recreating database connections...");
                try {
                    const conn = mongoose.connection;
                    const newConnections = {
                        choiceAppDb: conn.useDb('choice_app'),
                        restaurationDb: conn.useDb('Restauration'),
                        loisirsDb: conn.useDb('Loisir&Culture'),
                        beautyWellnessDb: conn.useDb('Beauty_Wellness')
                    };
                    
                    console.log("[DEBUG] New connections created:", 
                        Object.keys(newConnections).map(k => `${k}: ${newConnections[k] ? 'OK' : 'FAILED'}`).join(', ')
                    );
                    
                    // Utiliser ces nouvelles connexions pour ce traitement
                    const connections = newConnections;
                    
                    // Call the AI service to process the query
                    const aiResponse = await aiService.processProducerQuery(producerId, producerType, message, connections);
                    return res.json(aiResponse);
                } catch (connError) {
                    console.error("[DEBUG] Failed to recreate connections:", connError);
                    return res.status(500).json({
                        response: "Erreur de connexion à la base de données. Veuillez réessayer plus tard.",
                        profiles: [],
                        analysisResults: null,
                        error: "Database connection error"
                    });
                }
            } else {
                return res.status(503).json({
                    response: "Le service est temporairement indisponible. Veuillez réessayer plus tard.",
                    profiles: [],
                    analysisResults: null,
                    error: "Database not connected"
                });
            }
        }

        const connections = {
             choiceAppDb: choiceAppDbConn,
             restaurationDb: restaurationDbConn,
             loisirsDb: loisirsDbConn,
             beautyWellnessDb: beautyWellnessDbConn
        }

        // Call the AI service to process the query
        const aiResponse = await aiService.processProducerQuery(producerId, producerType, message, connections);
        
        // Send the structured response back to the frontend
        res.json(aiResponse); // { response: "...", profiles: [...] }

    } catch (error) {
        console.error('Error handling producer AI query:', error);
        // Send a structured error response that the frontend can display
        res.status(500).json({
             response: "Désolé, une erreur interne est survenue lors du traitement de votre demande.",
             profiles: [],
             analysisResults: null,
             error: error.message // Include error message in dev?             
         });
    }
};

// --- NEW: Controller for Producer Insights ---
exports.handleGetInsights = async (req, res) => {
    try {
        const { producerId } = req.params;

        // Authenticated user check should have been done in the route middleware
        // Si l'utilisateur est un producteur, vérifier que son ID correspond
        // Si c'est un compte utilisateur normal, il peut interroger n'importe quel producteur
        if (req.user.accountType !== 'user' && req.user.id !== producerId) {
           console.warn(`Mismatch AI insights attempt for producer ${producerId} by ${req.user.accountType} ${req.user.id}`);
           return res.status(403).json({ message: 'Forbidden: User ID does not match producer ID for insights.' });
        }

        const connections = {
            choiceAppDb: db.getChoiceAppDb(),
            restaurationDb: db.getRestaurationDb(),
            loisirsDb: db.getLoisirsDb(),
            beautyWellnessDb: db.getBeautyWellnessDb()
       };

       // Call the AI service to generate insights
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