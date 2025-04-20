// Service for AI-related features for producers
const analyticsService = require('./analyticsService'); // Use analytics data for context

// Helper function to get the correct database model based on type
const getModelForProducerType = (producerType, connections) => {
    switch (producerType) {
        case 'restaurant': return connections.restaurationDb?.model('Producer');
        case 'leisureProducer': return connections.loisirsDb?.model('LeisureProducer');
        case 'wellnessProducer': return connections.beautyWellnessDb?.model('WellnessProducer');
        case 'beautyPlace': return connections.beautyWellnessDb?.model('BeautyPlace');
        default:
            console.error(`Unsupported producer type for model fetching: ${producerType}`);
            return null;
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
    const ProducerModel = getModelForProducerType(producerType, connections);

    if (!ProducerModel) {
        console.error(`Database model not available for recommendations (${producerType}).`);
        return []; // Return empty on error
    }

    try {
        // Fetch basic producer data and KPIs
        const fieldsToSelect = 'photos followers' + 
                             (producerType === 'restaurant' ? ' menu menu_items' : '') +
                             (producerType === 'leisureProducer' ? ' events' : '');
                             // Add fields for wellness/beauty if needed

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
        // Consider making this conditional based on performance or lack of recent promotions
        recommendations.push({
            title: "Créer une promotion",
            description: "Les promotions créent un pic d'engagement de +45% en moyenne.",
            iconName: "localOffer",
            impact: "Élevé",
            effort: "Moyen"
        });

        // 3. Type-Specific Recommendations
        if (producerType === 'restaurant' && (!producerData?.menu || producerData.menu.length === 0) && (!producerData?.menu_items || producerData.menu_items.length === 0)) {
            // Recommend adding menu if both menu and menu_items are empty
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
        // Add similar checks for wellness/beauty (e.g., service list, opening hours)

        // 4. Performance-Based Recommendation (Low visibility)
        const visibilityKpi = kpis.find(k => k.label.toLowerCase().includes('visibilit'));
        if (visibilityKpi && (parseInt(visibilityKpi.value) < 500 || visibilityKpi.change.startsWith('-'))) { 
             recommendations.push({
                title: "Améliorer votre visibilité",
                description: "Interagissez avec les avis clients ou lancez une petite campagne publicitaire.",
                iconName: "trendingUp",
                impact: "Moyen",
                effort: "Moyen"
            });
        }
        
        // 5. Follower Engagement Recommendation (Example: if follower count > 0)
        if (producerData?.followers?.length > 10) { // Example threshold
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
 * Processes a natural language query from a producer using analytics data.
 * @param {string} producerId - The ID of the producer making the query.
 * @param {string} producerType - The type of the producer.
 * @param {string} message - The natural language query from the producer.
 * @param {object} connections - Object containing DB connections.
 * @returns {Promise<object>} - A promise resolving to an object { response: string, profiles: Array<object> }.
 */
exports.processProducerQuery = async (producerId, producerType, message, connections) => {
    console.log(`Processing AI query for ${producerType} ID ${producerId}: "${message}"`);

    let responseText = "Désolé, je n'ai pas bien compris votre demande. Pouvez-vous essayer de reformuler ?";
    let profiles = []; // To hold competitor profiles if requested
    const lowerMessage = message.toLowerCase();

    try {
        // --- Intent Recognition (Basic Keyword Matching) ---

        // Intent: Ask about Competitors
        if (lowerMessage.includes('concurrent') || lowerMessage.includes('competitor') || lowerMessage.includes('comparaison')) {
            responseText = "Analyse des concurrents en cours...\n";
            const competitors = await analyticsService.fetchCompetitorsForProducer(producerId, producerType, connections);
            if (competitors.length > 0) {
                profiles = competitors; // Attach competitor profiles to the response
                responseText += `J'ai trouvé ${competitors.length} concurrents proches :\n`;
                responseText += profiles.map(p =>
                    `- ${p.name} (Note: ${p.rating?.toFixed(1) || 'N/A'}${p.priceLevel ? ', Niveau prix: ' + p.priceLevel : ''})`
                ).join('\n');
                responseText += "\n\nSouhaitez-vous une analyse plus détaillée sur un concurrent spécifique ?";
            } else {
                responseText = "Je n'ai pas trouvé de concurrents directs partageant des caractéristiques similaires à proximité.";
            }
        }
        // Intent: Ask about KPIs (Visibility, Performance, Followers)
        else if (lowerMessage.includes('kpi') || lowerMessage.includes('statistique') || lowerMessage.includes('chiffre') || lowerMessage.includes('metric')) {
            const kpis = await analyticsService.fetchKpisForProducer(producerId, producerType, connections);
            if (kpis.length > 0) {
                responseText = "Voici vos indicateurs clés de performance pour la semaine dernière :\n";
                responseText += kpis.map(k => `- ${k.label}: ${k.value} (${k.change})`).join('\n');
            } else {
                responseText = "Je n'ai pas pu récupérer vos indicateurs clés pour le moment.";
            }
        }
        // Intent: Ask about specific KPI - Visibility
        else if (lowerMessage.includes('visibilité') || lowerMessage.includes('vues') || lowerMessage.includes('profil')) {
            const kpis = await analyticsService.fetchKpisForProducer(producerId, producerType, connections);
            const kpi = kpis.find(k => k.label.toLowerCase().includes('visibilit'));
            if (kpi) {
                responseText = `Votre visibilité (vues de profil) cette semaine est de ${kpi.value}, avec une évolution de ${kpi.change} par rapport à la semaine précédente.`;
            } else {
                responseText = "Impossible de récupérer les données de visibilité spécifiques pour le moment.";
            }
        }
        // Intent: Ask about specific KPI - Performance/Interactions
        else if (lowerMessage.includes('performance') || lowerMessage.includes('interaction') || lowerMessage.includes('réservation') || lowerMessage.includes('clic') || lowerMessage.includes('appel')) {
             const kpis = await analyticsService.fetchKpisForProducer(producerId, producerType, connections);
            const kpi = kpis.find(k => k.label.toLowerCase().includes('interaction'));
            if (kpi) {
                responseText = `Vos interactions (clics, appels, réservations, etc.) cette semaine sont au nombre de ${kpi.value}, avec une évolution de ${kpi.change} par rapport à la semaine précédente.`;
            } else {
                responseText = "Impossible de récupérer les données de performance spécifiques pour le moment.";
            }
        }
        // Intent: Ask about specific KPI - Followers
        else if (lowerMessage.includes('abonné') || lowerMessage.includes('follower')) {
            const kpis = await analyticsService.fetchKpisForProducer(producerId, producerType, connections);
            const kpi = kpis.find(k => k.label.toLowerCase().includes('abonné'));
            if (kpi) {
                responseText = `Vous avez actuellement ${kpi.value} abonnés. ${kpi.change !== 'N/A' ? `L\'évolution récente est de ${kpi.change}.` : 'Le suivi de l\'évolution n\'est pas encore disponible.'}`;
            } else {
                responseText = "Impossible de récupérer le nombre d'abonnés pour le moment.";
            }
        }
        // Intent: Ask for Help / Capabilities
        else if (lowerMessage.includes('aide') || lowerMessage.includes('help') || lowerMessage.includes('que peux-tu faire')) {
            // Use template literal for multi-line string
            responseText = `Je peux vous aider à :
- Analyser vos performances (visibilité, interactions, abonnés)
- Comparer avec vos concurrents proches
- Fournir des statistiques clés sur la semaine ou le mois

Posez-moi une question comme "Quelle est ma visibilité cette semaine ?" ou "Montre-moi mes concurrents".`;
        }
        // Fallback is handled by the initial value of responseText

    } catch (error) {
        console.error(`Error processing AI query for producer ${producerId}:`, error);
        responseText = "Une erreur interne est survenue lors du traitement de votre demande. Veuillez réessayer.";
        profiles = []; // Clear profiles on error
    }

    // Return the structured response
    return {
        response: responseText,
        profiles: profiles // Ensure profiles match the ProfileData structure expected by frontend
    };
}; 