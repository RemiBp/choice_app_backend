// Placeholder service for fetching producer analytics data

// Helper function to get the correct database model based on type
const getModelForProducerType = (producerType, connections) => {
    try {
        if (!connections) {
            console.error("Database connections object is undefined");
            return null;
        }

        let model = null;
        
        if (producerType === 'restaurant') {
            if (!connections.restaurationDb) {
                console.error("Restaurant database connection is undefined");
                return null;
            }
            model = connections.restaurationDb.model('Producer');
            console.log("Loaded Restaurant Producer model from restaurationDb");
        } else if (producerType === 'leisureProducer') {
            if (!connections.loisirsDb) {
                console.error("Leisure database connection is undefined");
                return null;
            }
            model = connections.loisirsDb.model('LeisureProducer');
            console.log("Loaded Leisure Producer model from loisirsDb");
        } else if (producerType === 'wellnessProducer') {
            if (!connections.beautyWellnessDb) {
                console.error("Wellness database connection is undefined");
                return null;
            }
            model = connections.beautyWellnessDb.model('WellnessPlace');
            console.log("Loaded Wellness Producer model from beautyWellnessDb");
        } else if (producerType === 'beautyPlace') {
            if (!connections.beautyWellnessDb) {
                console.error("Beauty database connection is undefined");
                return null;
            }
            model = connections.beautyWellnessDb.model('BeautyPlace');
            console.log("Loaded Beauty Producer model from beautyWellnessDb");
        } else {
            console.error(`Unknown producer type: ${producerType}`);
            return null;
        }
        
        return model;
    } catch (error) {
        console.error(`Error getting model for producer type ${producerType}:`, error);
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

/**
 * Checks the status of database connections
 * @param {Object} connections - Database connection object containing different DB connections
 * @returns {Object} Status report with connection status and diagnostics
 */
const checkDatabaseStatus = async (connections) => {
    try {
        if (!connections) {
            return {
                success: false,
                error: 'Database connections object is undefined',
                connectionStatus: {
                    choiceAppDb: false,
                    restaurationDb: false,
                    loisirsDb: false,
                    beautyWellnessDb: false
                }
            };
        }

        const statusReport = {
            success: true,
            error: null,
            connectionStatus: {
                choiceAppDb: !!connections.choiceAppDb,
                restaurationDb: !!connections.restaurationDb,
                loisirsDb: !!connections.loisirsDb,
                beautyWellnessDb: !!connections.beautyWellnessDb
            },
            diagnostics: {}
        };

        // Add detailed diagnostics for specific connections
        if (connections.restaurationDb) {
            try {
                const Producer = connections.restaurationDb.model('Producer');
                const count = await Producer.countDocuments({}).exec();
                statusReport.diagnostics.restaurationDb = {
                    producers: {
                        count
                    }
                };
            } catch (error) {
                statusReport.diagnostics.restaurationDb = {
                    error: error.message
                };
            }
        }

        // Check if any required connection is missing
        if (!connections.choiceAppDb || 
            !connections.restaurationDb || 
            !connections.loisirsDb || 
            !connections.beautyWellnessDb) {
            statusReport.success = false;
            statusReport.error = 'One or more required database connections are missing';
        }

        return statusReport;
    } catch (error) {
        return {
            success: false,
            error: `Error checking database status: ${error.message}`,
            connectionStatus: {
                choiceAppDb: !!connections?.choiceAppDb,
                restaurationDb: !!connections?.restaurationDb,
                loisirsDb: !!connections?.loisirsDb,
                beautyWellnessDb: !!connections?.beautyWellnessDb
            }
        };
    }
};

/**
 * Logs an interaction between a user and producer.
 * @param {Object} params - Parameters for logging interaction
 * @param {string} params.userId - User ID
 * @param {string} params.producerId - Producer ID
 * @param {string} params.producerType - Type of producer (restaurant, leisureProducer, etc.)
 * @param {string} params.interactionType - Type of interaction (view, like, etc.)
 * @param {Object} connections - MongoDB connections
 * @returns {Promise<Object>} Result of the operation
 */
const logInteraction = async ({ userId, producerId, producerType, interactionType }, connections) => {
    try {
        const InteractionModel = connections.choiceAppDb?.model('Interaction');
        if (InteractionModel && userId) { // Only log if model exists and userId is known
            await InteractionModel.create({
                userId,
                producerId,
                producerType,
                type: interactionType,
                metadata: {}
            });
        } else if (!userId) {
            console.warn(`Cannot log interaction: userId is missing for ${interactionType} @ ${producerType}/${producerId}`);
        }
    } catch (error) {
        console.error(`Error logging interaction (${interactionType}):`, error);
    }
};

/**
 * Fetches Key Performance Indicators (KPIs) for a given producer.
 * @param {string} producerId - The ID of the producer.
 * @param {string} producerType - The type of producer ('restaurant', 'leisureProducer', etc.).
 * @param {object} connections - Object containing DB connections (choiceAppDb, etc.)
 * @returns {Promise<Array<object>>} - A promise resolving to an array of KPI objects.
 */
async function fetchKpisForProducer(producerId, producerType, connections) {
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
}

/**
 * Fetches trend data for a given producer over a specified period.
 * @param {string} producerId - The ID of the producer.
 * @param {string} producerType - The type of producer.
 * @param {string} period - The time period ('Jour', 'Semaine', 'Mois').
 * @param {object} connections - Object containing DB connections.
 * @returns {Promise<Array<object>>} - A promise resolving to an array of trend data points (e.g., { day: 'Mon', sales: 50, lastWeek: 45 }).
 */
async function fetchTrendsForProducer(producerId, producerType, period, connections) {
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
}

/**
 * Fetches competitor data for a given producer.
 * @param {string} producerId - The ID of the producer.
 * @param {string} producerType - The type of producer.
 * @param {object} connections - Object containing DB connections.
 * @returns {Promise<Array<object>>} - A promise resolving to an array of competitor profile objects.
 */
async function fetchCompetitorsForProducer(producerId, producerType, connections) {
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

        // Get up to 10 nearby competitors (increased from previous limit)
        const nearByCompetitors = await ProducerModel.find(competitorQuery)
            // Select fields based on Producer.js and LeisureProducer.js
            .select('name photo photos address rating priceLevel category types gps_coordinates.address choice_count interest_count favorite_count structured_data')
            .limit(10) // Keep the limit at 10 for raw data
            .lean();

        // Log raw competitor data
        console.log(`[analyticsService] Found ${nearByCompetitors.length} raw competitors nearby.`);
        if (nearByCompetitors.length > 0) {
            console.log(`[analyticsService] Raw data for first competitor: ${JSON.stringify(nearByCompetitors[0])}`);
        }

        // 3. Format the data and calculate relevance score
        const formattedCompetitors = nearByCompetitors.map(comp => {
            const imageUrl = comp.photos?.[0] || comp.photo; // Get the potential image URL
            
            // Calculate a relevance score based on multiple factors
            let relevanceScore = 0;
            
            // Factor 1: Category/type match (0-3 points)
            const categoryOverlap = relevantTags.filter(tag => 
                (comp.category || []).includes(tag) || (comp.types || []).includes(tag)
            ).length;
            relevanceScore += Math.min(categoryOverlap, 3);
            
            // Factor 2: Rating similarity or better (0-2 points)
            const ratingScore = comp.rating && producer.rating ? 
                (comp.rating >= producer.rating ? 2 : 1) : 0;
            relevanceScore += ratingScore;
            
            // Factor 3: User engagement metrics (0-3 points)
            const choiceCount = comp.choice_count || 0;
            const interestCount = comp.interest_count || 0;
            const favoriteCount = comp.favorite_count || 0;
            
            if (choiceCount > 50) relevanceScore += 1;
            if (interestCount > 20) relevanceScore += 1;
            if (favoriteCount > 10) relevanceScore += 1;
            
            // Factor 4: Menu complexity (0-2 points for restaurants)
            if (producerType === 'restaurant' && comp.structured_data) {
                const menuItems = comp.structured_data['Items Indépendants'] || [];
                if (menuItems.length > 0) relevanceScore += menuItems.length > 10 ? 2 : 1;
            }
            
            return {
                id: comp._id.toString(),
                type: producerType,
                name: comp.name || 'Nom Inconnu',
                image: imageUrl,
                address: comp.address || comp.gps_coordinates?.address || 'Adresse inconnue',
                rating: comp.rating,
                priceLevel: comp.priceLevel,
                category: [...new Set([...(comp.category || []), ...(comp.types || [])])],
                relevanceScore: relevanceScore, // Add the calculated relevance score
                // Keep choice metrics if available
                choiceCount: comp.choice_count,
                interestCount: comp.interest_count,
                favoriteCount: comp.favorite_count
            };
        });

        // Sort competitors by relevance score (highest first)
        formattedCompetitors.sort((a, b) => b.relevanceScore - a.relevanceScore);

        // Log count of formatted competitors
        console.log(`[analyticsService] Returning ${formattedCompetitors.length} formatted competitors sorted by relevance.`);
        return formattedCompetitors; // Return all competitors sorted by relevance (no arbitrary limit)

    } catch (error) {
        console.error(`Error fetching competitors for producer ${producerId}:`, error);
        return [];
    }
}

// Assign functions directly to module.exports
module.exports = {
    getModelForProducerType,
    calculatePercentageChange,
    checkDatabaseStatus,
    logInteraction,
    fetchKpisForProducer,
    fetchTrendsForProducer,
    fetchCompetitorsForProducer
}; 