const mongoose = require('mongoose');

// This model logs user interactions with producers for analytics purposes

// Define the schema for the Interaction model
const InteractionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId, // Link to the User model if applicable
        ref: 'User', // Reference the User model in choiceAppDb
        required: true, // Typically, we want to know which user interacted
        index: true
    },
    producerId: {
        type: String, // Keep as String if producer IDs are not ObjectIds across dbs
        required: true,
        index: true
    },
    producerType: {
        type: String,
        required: true,
        enum: ['restaurant', 'leisureProducer', 'wellnessProducer', 'beautyPlace'], // Ensure type validity
        index: true
    },
    type: {
        type: String,
        required: true,
        enum: ['view', 'click', 'booking', 'order', 'call', 'follow', 'unfollow', 'share', 'save'], // Define possible interaction types
        index: true
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true // Indexing timestamp is crucial for time-based queries (KPIs, Trends)
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed // Optional: Store extra context (e.g., button clicked, search query used)
    }
});

// Note: This model should ideally live in the choiceAppDb where User data resides.
// The connection passed to this model factory should be connections.choiceAppDb

module.exports = (connection) => {
    if (!connection) {
        console.error("❌ Interaction model requires the choiceAppDb connection.");
        // Handle the error appropriately - perhaps throw or return a non-functional model
        // For now, let's try to register anyway, but it will likely fail if connection is wrong
        // return mongoose.model('Interaction', InteractionSchema);
        throw new Error("Interaction model requires the choiceAppDb connection.")
    }
    // Check if the model already exists on the connection to prevent OverwriteModelError
    if (connection.models.Interaction) {
        return connection.models.Interaction;
    }
    return connection.model('Interaction', InteractionSchema);
}; 