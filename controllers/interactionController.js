const mongoose = require('mongoose');
const dbConnections = require('../routes/index'); // Add direct import of db connections

// Helper function to log interaction (could be imported from a shared utils file)
async function logInteractionHelper(connections, userId, producerId, producerType, interactionType, metadata = {}) {
    try {
        const InteractionModel = connections.choiceAppDb?.model('Interaction');
        if (InteractionModel && userId) { 
            await InteractionModel.create({
                userId,
                producerId,
                producerType,
                type: interactionType,
                metadata
            });
            // console.log(`Interaction logged via helper: ${userId} -> ${interactionType} @ ${producerType}/${producerId}`);
            return true;
        } else if (!userId) {
            console.warn(`Cannot log interaction: userId is missing for ${interactionType} @ ${producerType}/${producerId}`);
            return false;
        } else {
             console.warn(`Cannot log interaction: InteractionModel not available`);
             return false;
        }
    } catch (error) {
        console.error(`Error logging interaction (${interactionType}):`, error);
        return false;
    }
}

exports.logInteraction = async (req, res) => {
    const { producerId, producerType, type, metadata } = req.body;
    const userId = req.user?.id; // Assuming userId is attached by authenticateToken middleware

    if (!userId) {
        return res.status(401).json({ message: 'User not authenticated.' });
    }

    if (!producerId || !producerType || !type) {
        return res.status(400).json({ message: 'Missing required fields: producerId, producerType, type.' });
    }

    // Ensure producerType is valid (optional, depends on schema validation)
    const validTypes = ['restaurant', 'leisureProducer', 'wellnessProducer', 'beautyPlace'];
    if (!validTypes.includes(producerType)) {
        return res.status(400).json({ message: `Invalid producerType: ${producerType}` });
    }
    
    // Use the helper to log with direct db connections instead of req.dbConnections
    const success = await logInteractionHelper(dbConnections, userId, producerId, producerType, type, metadata);

    if (success) {
        res.status(200).json({ message: 'Interaction logged successfully.' });
    } else {
        // logInteractionHelper already logs errors
        res.status(500).json({ message: 'Failed to log interaction.' });
    }
}; 