const aiService = require('../services/aiService');
const db = require('../config/db');

// GET /api/ai/:producerType/:producerId/recommendations
exports.getRecommendations = async (req, res) => {
    try {
        const { producerType, producerId } = req.params;

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
        const { producerId, message, producerType } = req.body; // Get necessary info from body

        // Validate inputs
        if (!producerId || !message || !producerType) {
            return res.status(400).json({ message: 'Missing producerId, message, or producerType in request body' });
        }
        
        const validTypes = ['restaurant', 'leisureProducer', 'wellnessProducer', 'beautyPlace'];
        if (!validTypes.includes(producerType)) {
            return res.status(400).json({ message: 'Invalid producer type for query' });
        }

         // Authenticated user check should have been done in the route middleware
         // Ensure req.user.id matches producerId from the body
         if (req.user?.id !== producerId) {
            console.warn(`Mismatch AI query attempt for producer ${producerId} by user ${req.user?.id}`);
            return res.status(403).json({ message: 'Forbidden: User ID does not match producer ID for query.' });
         }

        const connections = {
             choiceAppDb: db.getChoiceAppDb(),
             restaurationDb: db.getRestaurationDb(),
             loisirsDb: db.getLoisirsDb(),
             beautyWellnessDb: db.getBeautyWellnessDb()
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
        // Ensure req.user.id matches producerId
        if (req.user?.id !== producerId) {
           console.warn(`Mismatch AI insights attempt for producer ${producerId} by user ${req.user?.id}`);
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