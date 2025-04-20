const aiService = require('../services/aiService');
const getDbConnections = require('../index'); // Assuming connections are exported from index.js

// GET /api/ai/:producerType/:producerId/recommendations
exports.getRecommendations = async (req, res) => {
    try {
        const { producerType, producerId } = req.params;

        const validTypes = ['restaurant', 'leisureProducer', 'wellnessProducer', 'beautyPlace'];
        if (!validTypes.includes(producerType)) {
            return res.status(400).json({ message: 'Invalid producer type for recommendations' });
        }

        const connections = {
             choiceAppDb: getDbConnections.choiceAppDb,
             restaurationDb: getDbConnections.restaurationDb,
             loisirsDb: getDbConnections.loisirsDb,
             beautyWellnessDb: getDbConnections.beautyWellnessDb
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
             choiceAppDb: getDbConnections.choiceAppDb,
             restaurationDb: getDbConnections.restaurationDb,
             loisirsDb: getDbConnections.loisirsDb,
             beautyWellnessDb: getDbConnections.beautyWellnessDb
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
             error: error.message // Include error message in dev?             
         });
    }
};

// --- Add other AI controller methods if needed --- 