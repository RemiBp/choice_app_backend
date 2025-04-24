// Placeholder service for fetching producer analytics data

// Helper function to get the correct database model based on type
const getModelForProducerType = (producerType, connections) => {
    // IMPORTANT: This requires models to be registered on the connection objects
    // e.g., connections.restaurationDb.model('Producer')
    switch (producerType) {
        case 'restaurant':
            // Assumes model name 'Producer' is registered on restaurationDb
            return connections.restaurationDb?.model('Producer');
        case 'leisureProducer':
            // Assumes model name 'LeisureProducer' is registered on loisirsDb
            return connections.loisirsDb?.model('LeisureProducer');
        case 'wellnessProducer':
             // Assumes model name 'WellnessProducer' is registered on beautyWellnessDb
            return connections.beautyWellnessDb?.model('WellnessProducer');
        case 'beautyPlace':
             // Assumes model name 'BeautyPlace' is registered on beautyWellnessDb
            return connections.beautyWellnessDb?.model('BeautyPlace'); 
        default:
            console.error(`Unsupported producer type for model fetching: ${producerType}`);
            return null;
    }
};

/**
 * Calculates percentage change between two values.
 * @param {number} currentValue
 * @param {number} previousValue
 * @returns {string} Formatted percentage change or 'N/A'
 */
const calculatePercentageChange = (currentValue, previousValue) => {
    if (previousValue === 0 || previousValue == null || currentValue == null) {
        // Cannot calculate change if previous value is 0 or data is missing
        return currentValue > 0 ? '+100%' : 'N/A'; // Or handle as infinite increase if current > 0
    }
    const change = ((currentValue - previousValue) / previousValue) * 100;
    return `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
};

/** Log an interaction */
async function logInteraction(connections, userId, producerId, producerType, interactionType, metadata = {}) {
  try {
    const InteractionModel = connections.choiceAppDb?.model('Interaction');
    if (InteractionModel && userId) { // Only log if model exists and userId is known
      await InteractionModel.create({
        userId,
        producerId,
        producerType,
        type: interactionType,
        metadata
      });
       // console.log(`Interaction logged: ${userId} -> ${interactionType} @ ${producerType}/${producerId}`);
    } else if (!userId) {
       // console.warn(`Cannot log interaction: userId is missing for ${interactionType} @ ${producerType}/${producerId}`);
    }
  } catch (error) {
    console.error(`Error logging interaction (${interactionType}):`, error);
  }
}

/**
 * Fetches Key Performance Indicators (KPIs) for a given producer.
 * @param {string} producerId - The ID of the producer.
 * @param {string} producerType - The type of producer ('restaurant', 'leisureProducer', etc.).
 * @param {object} connections - Object containing DB connections (choiceAppDb, etc.)
 * @returns {Promise<Array<object>>} - A promise resolving to an array of KPI objects.
 */
exports.fetchKpisForProducer = async (producerId, producerType, connections) => {
    console.log(`Fetching KPIs for ${producerType} ID: ${producerId}`);
    const ProducerModel = getModelForProducerType(producerType, connections);
    const InteractionModel = connections.choiceAppDb?.model('Interaction'); // Assuming an Interaction model

    if (!ProducerModel || !InteractionModel || !connections.choiceAppDb) {
        console.error('Database models or connections not available for KPI fetching.');
        throw new Error('Database models or connections not available for KPI fetching.');
    }

    try {
        const producerData = await ProducerModel.findById(producerId).select('followers').lean();
        if (!producerData) {
            console.warn(`Producer not found for KPI fetching: ${producerId}`);
            return [];
        }

        // --- Calculate KPIs ---
        const now = new Date();
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

        // 1. Visibility KPI (Profile Views - assuming 'view' interaction type)
        const currentWeekViews = await InteractionModel.countDocuments({
            producerId: producerId,
            producerType: producerType,
            type: 'view', // Assuming 'view' type tracks profile views
            timestamp: { $gte: oneWeekAgo }
        });
        const previousWeekViews = await InteractionModel.countDocuments({
            producerId: producerId,
            producerType: producerType,
            type: 'view',
            timestamp: { $gte: twoWeeksAgo, $lt: oneWeekAgo }
        });
        const visibilityChange = calculatePercentageChange(currentWeekViews, previousWeekViews);
        const visibility = {
            label: "Visibilité (Semaine)",
            value: `${currentWeekViews} vues`,
            change: visibilityChange,
            isPositive: currentWeekViews >= previousWeekViews,
        };

        // 2. Performance KPI (e.g., Bookings/Clicks/Orders - assuming 'booking', 'click', 'order' types)
        const relevantInteractionTypes = ['booking', 'click', 'order', 'call']; // Adapt based on actual interaction types
        const currentWeekInteractions = await InteractionModel.countDocuments({
            producerId: producerId,
            producerType: producerType,
            type: { $in: relevantInteractionTypes },
            timestamp: { $gte: oneWeekAgo }
        });
         const previousWeekInteractions = await InteractionModel.countDocuments({
            producerId: producerId,
            producerType: producerType,
            type: { $in: relevantInteractionTypes },
            timestamp: { $gte: twoWeeksAgo, $lt: oneWeekAgo }
        });
        const performanceChange = calculatePercentageChange(currentWeekInteractions, previousWeekInteractions);
        const performance = {
            label: "Interactions (Semaine)", // Could be more specific like "Réservations" if only tracking bookings
            value: `${currentWeekInteractions}`,
            change: performanceChange,
            isPositive: currentWeekInteractions >= previousWeekInteractions,
        };

        // 3. Follower Count KPI
        // Use the length of the followers array
        const followerCount = producerData.followers?.length || 0;
        const followerKpi = {
            label: "Abonnés",
            value: `${followerCount}`,
            change: "N/A", // Needs proper tracking of follow/unfollow events
            isPositive: true, // Assume static or increasing for now
        };

        return [visibility, performance, followerKpi];

    } catch (error) {
        console.error(`Error fetching KPIs for producer ${producerId}:`, error);
        // Optionally, return default/empty KPIs or re-throw specific errors
        return []; // Return empty array on error to avoid breaking frontend
    }
};

/**
 * Fetches trend data for a given producer over a specified period.
 * @param {string} producerId - The ID of the producer.
 * @param {string} producerType - The type of producer.
 * @param {string} period - The time period ('Jour', 'Semaine', 'Mois').
 * @param {object} connections - Object containing DB connections.
 * @returns {Promise<Array<object>>} - A promise resolving to an array of trend data points (e.g., { day: 'Mon', sales: 50, lastWeek: 45 }).
 */
exports.fetchTrendsForProducer = async (producerId, producerType, period, connections) => {
    console.log(`Fetching ${period} trends for ${producerType} ID: ${producerId}`);
    const InteractionModel = connections.choiceAppDb?.model('Interaction'); // Assuming interactions hold relevant data

    if (!InteractionModel) {
        console.error('Interaction model not available for trend fetching.');
        throw new Error('Interaction model not available for trend fetching.');
    }

    try {
        let groupByFormat, startDate, previousStartDate, interval;
        const now = new Date();
        const dataPoints = [];

        // Define aggregation pipeline parameters based on period
        if (period === 'Mois') { // Last 30 days, grouped by day
            startDate = new Date(now.setDate(now.getDate() - 30));
            previousStartDate = new Date(new Date(startDate).setDate(startDate.getDate() - 30)); // Compare with prev 30 days
            groupByFormat = '%Y-%m-%d'; // Group by full date
            interval = 'day';
        } else if (period === 'Semaine') { // Last 7 days, grouped by day
            startDate = new Date(now.setDate(now.getDate() - 7));
             previousStartDate = new Date(new Date(startDate).setDate(startDate.getDate() - 7)); // Compare with prev 7 days
            groupByFormat = '%w'; // Group by day of the week (0=Sun, 1=Mon...)
            interval = 'day';
        } else { // Assume 'Jour' - Last 24 hours, grouped by hour
            startDate = new Date(now.setHours(now.getHours() - 24));
            previousStartDate = new Date(new Date(startDate).setHours(startDate.getHours() - 24)); // Compare with prev 24 hours
            groupByFormat = '%H'; // Group by hour
            interval = 'hour';
        }

        // Fetch current period data (e.g., interactions, views, or specific type)
        const currentPeriodData = await InteractionModel.aggregate([
            {
                $match: {
                    producerId: producerId,
                    producerType: producerType,
                    // type: 'booking', // Or 'view', 'click', etc. - Specify the metric to track
                    timestamp: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: groupByFormat, date: "$timestamp", timezone: "Europe/Paris" } }, // Adjust timezone as needed
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Fetch previous period data for comparison
        const previousPeriodData = await InteractionModel.aggregate([
             {
                $match: {
                    producerId: producerId,
                    producerType: producerType,
                    // type: 'booking', // Match the same type as current period
                    timestamp: { $gte: previousStartDate, $lt: startDate } // Ensure non-overlapping periods
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: groupByFormat, date: "$timestamp", timezone: "Europe/Paris" } }, // Group by the same format
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Map previous data for easy lookup
        const previousDataMap = previousPeriodData.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
        }, {});

        // --- Format data for the chart --- 
        // Define labels for days of the week (adjust order if needed, Sunday=0)
        const dayLabels = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
        
        const formattedData = currentPeriodData.map(item => {
            let label = item._id;
            if (period === 'Semaine') {
                // Map week number ('0'-'6') to label
                const dayIndex = parseInt(item._id, 10);
                label = dayLabels[dayIndex] || item._id; // Fallback to number if parse fails
            } else if (period === 'Jour') {
                // Format hour ('00'-'23') as 'HH:00'
                label = `${item._id}:00`;
            } // For 'Mois', label remains 'YYYY-MM-DD' which is usually fine for charts

            return {
                day: label, // Use the formatted label
                sales: item.count, // Renamed 'sales' to match frontend model, but it's 'count' here
                lastWeek: previousDataMap[item._id] || 0 // Compare with the same grouping key from the previous period
            };
        });

        // Removed the previous TODO comment as labeling is now handled.
        
        return formattedData;

    } catch (error) {
        console.error(`Error fetching trends for producer ${producerId}:`, error);
        return []; // Return empty array on error
    }
};

/**
 * Fetches competitor data for a given producer.
 * @param {string} producerId - The ID of the producer.
 * @param {string} producerType - The type of producer.
 * @param {object} connections - Object containing DB connections.
 * @returns {Promise<Array<object>>} - A promise resolving to an array of competitor profile objects.
 */
exports.fetchCompetitorsForProducer = async (producerId, producerType, connections) => {
    console.log(`[analyticsService] Fetching competitors for ${producerType} ID: ${producerId}`);
    const ProducerModel = getModelForProducerType(producerType, connections);

    if (!ProducerModel) {
         console.error(`Database model not available for competitor fetching (${producerType}).`);
        throw new Error(`Database model not available for competitor fetching (${producerType}).`);
    }

    try {
        // 1. Fetch the current producer's data (need location and category/types)
        const producer = await ProducerModel.findById(producerId).select('gps_coordinates category types').lean();
        // Log producer data used for search
        console.log(`[analyticsService] Producer data for search: ${JSON.stringify(producer)}`);

        // Use gps_coordinates as the primary location field based on models
        if (!producer || !producer.gps_coordinates?.coordinates) {
            console.warn(`Producer or gps_coordinates not found for competitor analysis: ${producerId}`);
            return [];
        }

        // 2. Perform a geospatial query using gps_coordinates
        const maxDistanceMeters = 5000; // 5km radius
        const competitorQuery = {
            _id: { $ne: producerId },
            gps_coordinates: { // Query based on gps_coordinates
                $nearSphere: {
                    $geometry: producer.gps_coordinates, // Use producer's gps_coordinates
                    $maxDistance: maxDistanceMeters
                }
            }
        };

        // Optional: Filter by category/types
        const relevantTags = [...(producer.category || []), ...(producer.types || [])]; // Combine category and types
        if (relevantTags.length > 0) {
             console.log(`[analyticsService] Filtering competitors by tags: ${relevantTags.join(', ')}`);
             competitorQuery.$or = [
                { category: { $in: relevantTags } },
                { types: { $in: relevantTags } } // Also check against 'types' field
             ];
        }

        // Log the final query
        console.log(`[analyticsService] Competitor query: ${JSON.stringify(competitorQuery)}`);

        const nearByCompetitors = await ProducerModel.find(competitorQuery)
            // Select fields based on Producer.js and LeisureProducer.js
            .select('name photo photos address rating priceLevel category types gps_coordinates.address')
            .limit(10)
            .lean();

        // Log raw competitor data
        console.log(`[analyticsService] Found ${nearByCompetitors.length} raw competitors nearby.`);
        if (nearByCompetitors.length > 0) {
            console.log(`[analyticsService] Raw data for first competitor: ${JSON.stringify(nearByCompetitors[0])}`);
        }

        // 3. Format the data
        const formattedCompetitors = nearByCompetitors.map(comp => {
            const imageUrl = comp.photos?.[0] || comp.photo; // Get the potential image URL
            // Log the image URL selected for each competitor
            console.log(`[analyticsService] Competitor ${comp.name || comp._id}: selected image URL = ${imageUrl}`);
            return {
                id: comp._id.toString(),
                type: producerType,
                name: comp.name || 'Nom Inconnu', // Use 'name' field
                image: imageUrl, // Assign the determined image URL
                // Use address field directly, fallback to potential address within gps_coordinates
                address: comp.address || comp.gps_coordinates?.address || 'Adresse inconnue',
                rating: comp.rating,
                priceLevel: comp.priceLevel,
                category: [...new Set([...(comp.category || []), ...(comp.types || [])])], // Combine category and types
            };
        });

        // Log count of formatted competitors
        console.log(`[analyticsService] Returning ${formattedCompetitors.length} formatted competitors (limited to 5).`);
        return formattedCompetitors.slice(0, 5);

    } catch (error) {
        console.error(`Error fetching competitors for producer ${producerId}:`, error);
        return [];
    }
}; 