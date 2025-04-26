const mongoose = require('mongoose');
const { createModel, databases, getProducerModel } = require('../utils/modelCreator');
const analyticsService = require('../services/analyticsService');
const { getModel } = require('../models'); // Import getModel

// Require Schemas for our custom models - these export schemas
// const ProfileViewSchema = require('../models/ProfileView');
// const RatingSchema = require('../models/Rating');

// --- MODIFIED: Get db connections directly from dbConfig --- 
// const dbConfig = require('../db/config'); // Import dbConfig

// --- REMOVED Model Initialization Block --- 
// The global initialization was causing timing issues.
// Models will be fetched within each controller function as needed.

// --- Helpers globaux ---
function getPeriodDates(period) {
  const now = new Date();
  let daysToSubtract = 30; // Default
  if (period && period.endsWith('d')) {
    const days = parseInt(period.slice(0, -1), 10);
    if (!isNaN(days)) {
      daysToSubtract = days;
    }
  }
  // Handle 'm' or 'y' if needed

  const endDate = new Date(now);
  // Ensure end date is set to the end of the day for accurate range queries
  endDate.setHours(23, 59, 59, 999);

  const startDate = new Date(now);
  startDate.setDate(now.getDate() - daysToSubtract);
  // Ensure start date is set to the beginning of the day
  startDate.setHours(0, 0, 0, 0);

  // Previous period
  const prevEndDate = new Date(startDate);
  prevEndDate.setDate(startDate.getDate() - 1); // Day before current period starts
  prevEndDate.setHours(23, 59, 59, 999);

  const prevStartDate = new Date(prevEndDate);
  prevStartDate.setDate(prevEndDate.getDate() - daysToSubtract + 1); // Ensure same duration
  prevStartDate.setHours(0, 0, 0, 0);

  return { startDate, endDate, prevStartDate, prevEndDate };
}

function calculateChange(current, previous) {
  const change = current - previous;
  const changePercent = (previous !== 0) ? ((change / previous) * 100) : (current !== 0 ? 100 : 0); // Handle division by zero
  return { change, changePercent: parseFloat(changePercent.toFixed(1)) };
}

/**
 * Contrôleur pour les événements d'analytique
 */
const analyticsController = {

  // --- REMOVED _getRequiredModels function ---
  // Models will be fetched directly using getModel() where needed.

  /**
   * Enregistrer un lot d'événements
   */
  logEvents: async (req, res) => {
    try {
      // --- MODIFIED: Use getModel ---
      const AnalyticsEvent = getModel('AnalyticsEvent');
      if (!AnalyticsEvent) {
        return res.status(500).json({ message: 'Modèle AnalyticsEvent non initialisé.' });
      }
      // --- END MODIFICATION ---
      const { events } = req.body;
      
      if (!events || !Array.isArray(events) || events.length === 0) {
        return res.status(400).json({ message: 'Format d\'événements invalide' });
      }
      
      // Préparer les événements pour l'insertion
      const eventsToInsert = events.map(event => ({
        name: event.name,
        parameters: event.parameters,
        timestamp: new Date(event.timestamp || Date.now()),
        userId: event.parameters?.userId,
        sessionId: event.parameters?.sessionId,
        deviceInfo: event.parameters?.deviceInfo
      }));
      
      // Insérer tous les événements
      await AnalyticsEvent.insertMany(eventsToInsert);
      
      res.status(200).json({ message: `${events.length} événements enregistrés avec succès` });
    } catch (error) {
      console.error('❌ Erreur dans logEvents:', error);
      res.status(500).json({ message: error.message || 'Erreur lors de l\'enregistrement des événements' });
    }
  },
  
  /**
   * Enregistrer un seul événement
   */
  logEvent: async (req, res) => {
    try {
      // --- MODIFIED: Use getModel ---
      const AnalyticsEvent = getModel('AnalyticsEvent');
       if (!AnalyticsEvent) {
        return res.status(500).json({ message: 'Modèle AnalyticsEvent non initialisé.' });
      }
      // --- END MODIFICATION ---
      const { type, data } = req.body;
      
      if (!type || !data) {
        return res.status(400).json({ message: 'Type et données de l\'événement requis' });
      }
      
      // Créer l'événement
      const event = new AnalyticsEvent({
        name: type,
        parameters: data,
        timestamp: new Date(data.timestamp || Date.now()),
        userId: data.userId,
        sessionId: data.sessionId,
        deviceInfo: data.deviceInfo
      });
      
      // Enregistrer l'événement
      await event.save();
      
      res.status(200).json({ message: 'Événement enregistré avec succès' });
    } catch (error) {
      console.error('❌ Erreur dans logEvent:', error);
      res.status(500).json({ message: error.message || 'Erreur lors de l\'enregistrement de l\'événement' });
    }
  },

  /**
   * Obtenir l'aperçu
   */
  getOverview: async (req, res) => {
    try {
      // --- MODIFIED: Use getModel ---
      const Post = getModel('Post');
      const Follow = getModel('Follow');
      const Subscription = getModel('Subscription');
      const AnalyticsEvent = getModel('AnalyticsEvent');
      const ProfileView = getModel('ProfileView');
      // Check if all models were loaded
      if (!Post || !Follow || !Subscription || !AnalyticsEvent || !ProfileView) {
         console.error("❌ Erreur dans getOverview: Un ou plusieurs modèles requis n'ont pas pu être chargés.", { Post: !!Post, Follow: !!Follow, Subscription: !!Subscription, AnalyticsEvent: !!AnalyticsEvent, ProfileView: !!ProfileView });
         return res.status(500).json({ message: 'Erreur interne: Impossible de charger les modèles requis.' });
      }
      // --- END MODIFICATION ---

      const { producerId } = req.params;
      const { period = '30d', producerType } = req.query;

      if (!producerType || !['restaurant', 'leisure', 'wellness'].includes(producerType)) {
          return res.status(400).json({ message: 'Paramètre producerType valide requis (restaurant, leisure, wellness)' });
      }
      // --- MODIFIED: Use getModel based on producerType ---
      let ProducerModel;
      if (producerType === 'restaurant') {
        ProducerModel = getModel('Producer');
      } else if (producerType === 'leisure') {
        ProducerModel = getModel('LeisureProducer');
      } else if (producerType === 'wellness') {
        ProducerModel = getModel('WellnessPlace') || getModel('BeautyPlace'); // Or just WellnessPlace if alias
      }
      // --- REMOVED: const ProducerModel = getProducerModel(producerType); ---
      if (!ProducerModel) {
          // Use a more specific error message
          console.error(`❌ Erreur dans getOverview: Modèle pour producerType '${producerType}' non trouvé ou non initialisé.`);
          return res.status(500).json({ message: `Modèle pour producerType '${producerType}' non trouvé ou non initialisé.` });
      }
      // --- END MODIFICATION ---

      const { startDate, endDate, prevStartDate, prevEndDate } = getPeriodDates(period);

      // --- MODIFIED: Reverted - Logic back in controller --- 
      // --- Calculate Overview Data directly --- 
      const [currentFollowers, previousFollowers] = await Promise.all([
          Follow.countDocuments({ followingId: producerId, createdAt: { $gte: startDate, $lte: endDate } }),
          Follow.countDocuments({ followingId: producerId, createdAt: { $gte: prevStartDate, $lte: prevEndDate } })
      ]);
      const [currentProfileViews, previousProfileViews] = await Promise.all([
          ProfileView.countDocuments({ profileId: producerId, timestamp: { $gte: startDate, $lte: endDate } }),
          ProfileView.countDocuments({ profileId: producerId, timestamp: { $gte: prevStartDate, $lte: prevEndDate } })
      ]);
      // Add more metrics as needed (e.g., posts, engagement, conversions from AnalyticsEvent)
      // Example: Engagement (assuming likes/comments are stored in AnalyticsEvent or Interaction)
      // const currentEngagement = await AnalyticsEvent.countDocuments({ 'parameters.producerId': producerId, name: {$in: ['like', 'comment']}, timestamp: { $gte: startDate, $lte: endDate } });
      // const previousEngagement = await AnalyticsEvent.countDocuments({ 'parameters.producerId': producerId, name: {$in: ['like', 'comment']}, timestamp: { $gte: prevStartDate, $lte: prevEndDate } });
      
      const totalFollowers = await Follow.countDocuments({ followingId: producerId });
      const producerData = await ProducerModel.findById(producerId).select('name subscription').lean(); // Get producer name and subscription level
      
      // --- MODIFIED: Structure matches frontend GrowthOverview model ---
      const kpis = {
        followers: {
          current: currentFollowers,
          ...calculateChange(currentFollowers, previousFollowers)
        },
        profileViews: {
          current: currentProfileViews,
          ...calculateChange(currentProfileViews, previousProfileViews)
        }
        // Add other calculated KPIs here following the pattern:
        // metricName: { current: Number, change: Number, changePercent: Number }
      };
      
      // Add placeholder for engagement summary expected by frontend
      const engagementSummary = {
        posts: 0, // TODO: Calculate actual posts in period
        likes: 0, // TODO: Calculate actual likes in period
        comments: 0 // TODO: Calculate actual comments in period
      };

      const overviewData = {
        period: period, // Pass the requested period
        kpis: kpis,     // Use the map structure
        engagementSummary: engagementSummary // Add the engagement summary object
        // Remove unused fields like producerName, subscriptionLevel, totalFollowers if not in frontend model
      };
      // --- END MODIFIED STRUCTURE ---
      
      // --- REMOVED Service call ---
      // const overviewData = await analyticsService.getOverviewData({ ... });
      // --- END REMOVED Service call ---

      res.status(200).json(overviewData);

    } catch (error) {
      console.error(`❌ Erreur dans getOverview pour ${req.params.producerId}:`, error);
      res.status(500).json({ message: error.message || 'Erreur lors de la récupération de l\'aperçu' });
    }
  },

  /**
   * Obtenir les tendances
   */
  getTrends: async (req, res) => {
    try {
      // --- MODIFIED: Use getModel ---
      const Follow = getModel('Follow');
      const ProfileView = getModel('ProfileView');
       if (!Follow || !ProfileView) {
         console.error("❌ Erreur dans getTrends: Impossible de charger Follow ou ProfileView.", { Follow: !!Follow, ProfileView: !!ProfileView });
         return res.status(500).json({ message: 'Erreur interne: Impossible de charger les modèles requis.' });
      }
      // --- END MODIFICATION ---
      const { producerId } = req.params;
      const { period = '30d', producerType, metrics } = req.query;
      
      if (!producerType || !['restaurant', 'leisure', 'wellness'].includes(producerType)) {
          return res.status(400).json({ message: 'Paramètre producerType valide requis (restaurant, leisure, wellness)' });
      }
      // --- MODIFIED: Use getModel based on producerType ---
      let ProducerModel;
      if (producerType === 'restaurant') {
        ProducerModel = getModel('Producer');
      } else if (producerType === 'leisure') {
        ProducerModel = getModel('LeisureProducer');
      } else if (producerType === 'wellness') {
        ProducerModel = getModel('WellnessPlace') || getModel('BeautyPlace');
      }
      // --- REMOVED: const ProducerModel = getProducerModel(producerType); ---
      if (!ProducerModel) {
          console.error(`❌ Erreur dans getTrends: Modèle pour producerType '${producerType}' non trouvé ou non initialisé.`);
          return res.status(500).json({ message: `Modèle pour producerType '${producerType}' non trouvé ou non initialisé.` });
      }
      // --- END MODIFICATION ---
      if (!metrics) {
          return res.status(400).json({ message: 'Paramètre metrics requis (ex: followers,profileViews)' });
      }
      const metricsList = metrics.split(',');
      const { startDate, endDate } = getPeriodDates(period);

      // --- MODIFIED: Call correct service function --- 
      // Assuming fetchTrendsForProducer exists and expects these parameters
      // Note: fetchTrendsForProducer in service currently uses Interaction model. 
      // Need to decide if trends should use Interaction or specific models like Follow/ProfileView passed here.
      // For now, let's assume we pass models, and service needs adjustment OR controller does the work.
      
      // Option 1: Call service (assuming it can handle these models/metrics)
      // const trendsData = await analyticsService.fetchTrendsForProducer({
      //     producerId,
      //     producerType, // Pass producerType
      //     // Pass models required by the specific metrics requested
      //     FollowModel: metricsList.includes('followers') ? Follow : undefined,
      //     ProfileViewModel: metricsList.includes('profileViews') ? ProfileView : undefined,
      //     // Add other models like InteractionModel if needed for 'engagementRate' or 'conversions'
      //     startDate,
      //     endDate,
      //     metrics: metricsList
      // });

      // Option 2: Revert - Calculate Trends in Controller (Simpler for now if service is basic)
      console.warn("⚠️ Calculating trends directly in controller, service function fetchTrendsForProducer might need implementation for these metrics.");
      const trendsMap = {}; // Rename to trendsMap to avoid conflict with final object
      // Example: Calculate follower trend
      if (metricsList.includes('followers')) {
          const followerTrend = await Follow.aggregate([
              { $match: { followingId: producerId, createdAt: { $gte: startDate, $lte: endDate } } },
              {
                  $group: {
                      _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Europe/Paris" } },
                      count: { $sum: 1 }
                  }
              },
              { $sort: { _id: 1 } }
          ]);
          trendsMap.followers = followerTrend.map(item => ({ date: item._id, value: item.count }));
      }
       if (metricsList.includes('profileViews')) {
          const viewTrend = await ProfileView.aggregate([
              { $match: { profileId: producerId, timestamp: { $gte: startDate, $lte: endDate } } },
              {
                  $group: {
                      _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp", timezone: "Europe/Paris" } },
                      count: { $sum: 1 }
                  }
              },
              { $sort: { _id: 1 } }
          ]);
          trendsMap.profileViews = viewTrend.map(item => ({ date: item._id, value: item.count }));
      }
      // Add calculations for other metrics (engagementRate, conversions) similarly, likely querying AnalyticsEvent or Interaction models
      
      // --- MODIFIED: Structure matches frontend GrowthTrends model ---
      const trendsData = {
          period: period, // Add the period
          interval: 'day', // Assuming daily interval for now, adjust if needed
          trends: trendsMap // Embed the map under the 'trends' key
      };
      // --- END MODIFIED STRUCTURE ---

      // --- REMOVED INCORRECT Service call ---
      // const trendsData = await analyticsService.getTrendsData({ ... });
      // --- END REMOVED Service call ---

      res.status(200).json(trendsData);

    } catch (error) {
      console.error(`❌ Erreur dans getTrends pour ${req.params.producerId}:`, error);
      res.status(500).json({ message: error.message || 'Erreur lors de la récupération des tendances' });
    }
  },

  /**
   * Obtenir les recommandations
   */
  getRecommendations: async (req, res) => {
     try {
       // --- MODIFIED: Use getModel for any needed models (if any) ---
       // const NeededModel = getModel('NeededModel');
       // if (!NeededModel) return res.status(500).json({ message: 'Modèle requis non chargé.' });
       // --- END MODIFICATION ---

       const { producerId } = req.params;

       // Recommendations logic is likely complex and should be in the service
       // --- MODIFIED: Commented out the non-existent function call ---
       // const recommendations = await analyticsService.getRecommendationsForProducer(producerId); // TODO: Implement this in analyticsService
       console.log(`⚠️ Recommendations endpoint called for ${producerId}, but service function 'getRecommendationsForProducer' is not implemented or available in analyticsService. Returning empty data.`);
       const recommendations = []; // Return empty array or default structure
       // --- END MODIFICATION ---

       res.status(200).json({ recommendations }); // Ensure response structure matches frontend expectations

     } catch (error) {
       console.error(`❌ Erreur dans getRecommendations pour ${req.params.producerId}:`, error);
       // Return a more specific error if possible, otherwise generic
       res.status(500).json({ message: error.message || 'Erreur lors de la récupération des recommandations' });
     }
  },

  /**
   * Obtenir les données démographiques
   */
  getDemographics: async (req, res) => {
     try {
       const { User } = getModel('User');
       const { producerId } = req.params;
       const { period = '30d', producerType } = req.query;

        if (!producerType) {
          return res.status(400).json({ message: 'Paramètre producerType requis' });
        }
       const { startDate, endDate } = getPeriodDates(period);

       const demographicsData = await analyticsService.getDemographicsData({
           producerId,
           producerType,
           startDate,
           endDate,
           UserModel: User
           // Pass FollowModel if needed to link followers to users
       });

       res.status(200).json(demographicsData);

     } catch (error) {
       console.error(`❌ Erreur dans getDemographics pour ${req.params.producerId}:`, error);
       res.status(500).json({ message: error.message || 'Erreur lors de la récupération des données démographiques' });
     }
  },

  /**
   * Obtenir les prédictions de croissance
   */
  getPredictions: async (req, res) => {
     try {
       // May need Follow, ProfileView models etc.
       const { Follow, ProfileView } = getModel('Follow', 'ProfileView'); 
       const { producerId } = req.params;
       const { producerType } = req.query;

       if (!producerType) {
         return res.status(400).json({ message: 'Paramètre producerType requis' });
       }

       const predictionsData = await analyticsService.getGrowthPredictions({
           producerId,
           producerType,
           FollowModel: Follow,
           ProfileViewModel: ProfileView
           // Pass other models needed for prediction
       });

       res.status(200).json(predictionsData);

     } catch (error) {
       console.error(`❌ Erreur dans getPredictions pour ${req.params.producerId}:`, error);
       res.status(500).json({ message: error.message || 'Erreur lors de la récupération des prédictions' });
     }
  },

  /**
   * Obtenir l'analyse concurrentielle
   */
  getCompetitorAnalysis: async (req, res) => {
     try {
       // Needs Producer model for the specific type, and maybe Follow model
       const { Follow } = getModel('Follow'); 
       const { producerId } = req.params;
       const { period = '30d', producerType } = req.query;

       if (!producerType) {
         return res.status(400).json({ message: 'Paramètre producerType requis' });
       }
       // --- MODIFIED: Use getModel based on producerType ---
       let ProducerModel;
       if (producerType === 'restaurant') {
         ProducerModel = getModel('Producer');
       } else if (producerType === 'leisure') {
         ProducerModel = getModel('LeisureProducer');
       } else if (producerType === 'wellness') {
         ProducerModel = getModel('WellnessPlace') || getModel('BeautyPlace');
       }
       // --- REMOVED: const ProducerModel = getProducerModel(producerType); ---
       if (!ProducerModel) {
         console.error(`❌ Erreur dans getCompetitorAnalysis: Modèle pour producerType '${producerType}' non trouvé ou non initialisé.`);
         return res.status(500).json({ message: `Modèle pour producerType '${producerType}' non trouvé ou non initialisé.` });
       }
       // --- END MODIFICATION ---

       const { startDate, endDate } = getPeriodDates(period);

       const competitorData = await analyticsService.getCompetitorAnalysisData({
           producerId,
           ProducerModel, // Pass the correct producer model
           FollowModel: Follow,
           startDate, // Pass dates if needed for analysis
           endDate
       });

       res.status(200).json(competitorData);

     } catch (error) {
       console.error(`❌ Erreur dans getCompetitorAnalysis pour ${req.params.producerId}:`, error);
       res.status(500).json({ message: error.message || 'Erreur lors de la récupération de l\'analyse concurrentielle' });
     }
  },

   /**
    * Enregistrer un événement générique (utilisé par le middleware ou directement)
    * DEPRECATED? Prefer logEvents or logEvent
    */
   logGenericEvent: async (req, res) => {
     try {
       const { AnalyticsEvent } = getModel('AnalyticsEvent');
       const { eventName, userId, parameters } = req.body;
       if (!eventName) {
         return res.status(400).json({ message: 'Nom de l\'événement manquant (eventName)' });
       }
       
       const newEvent = new AnalyticsEvent({
         name: eventName,
         userId: userId || 'anonymous', 
         parameters: parameters || {},
         timestamp: new Date()
       });
       await newEvent.save();
       res.status(201).json({ message: 'Événement enregistré.' });
     } catch (error) {
       console.error("❌ Erreur logGenericEvent:", error);
       res.status(500).json({ message: error.message || 'Erreur serveur.' });
     }
   },

  /**
   * Obtenir les données démographiques des abonnés
   */
  getFollowerDemographics: async (req, res) => {
    try {
        // --- MODIFIED: Use getModel ---
        const Follow = getModel('Follow');
        const User = getModel('User');
        if (!Follow || !User) {
            console.error("❌ Erreur dans getFollowerDemographics: Impossible de charger Follow ou User.", { Follow: !!Follow, User: !!User });
            return res.status(500).json({ message: 'Erreur interne: Impossible de charger les modèles requis.' });
        }
        // --- END MODIFICATION ---
        const { producerId } = req.params;
        const { producerType } = req.query; // producerType might be needed if Follow model differs

        // --- Logic moved to analyticsService ---
        const demographicsData = await analyticsService.getFollowerDemographicsData({
            producerId,
            producerType, // Pass if needed by service
            FollowModel: Follow,
            UserModel: User
        });

        res.status(200).json(demographicsData);

    } catch (error) {
        console.error(`❌ Erreur dans getFollowerDemographics pour ${req.params.producerId}:`, error);
        res.status(500).json({ message: error.message || 'Erreur lors de la récupération des données démographiques' });
    }
  },

  /**
   * Obtenir les données d'engagement
   */
  getEngagementData: async (req, res) => {
      try {
          // --- MODIFIED: Use getModel ---
          const Post = getModel('Post');
          const Rating = getModel('Rating'); // Assuming Rating model stores likes/comments? Or Interaction?
          const Follow = getModel('Follow'); // For follower count context
          // Add Interaction model if it stores likes/comments/shares
          const Interaction = getModel('Interaction'); 
           if (!Post || !Rating || !Follow || !Interaction) {
               console.error("❌ Erreur dans getEngagementData: Un ou plusieurs modèles requis non chargés.", { Post: !!Post, Rating: !!Rating, Follow: !!Follow, Interaction: !!Interaction });
               return res.status(500).json({ message: 'Erreur interne: Impossible de charger les modèles requis.' });
           }
           // --- END MODIFICATION ---
          const { producerId } = req.params;
          const { period = '30d', producerType } = req.query;

          if (!producerType || !['restaurant', 'leisure', 'wellness'].includes(producerType)) {
               return res.status(400).json({ message: 'Paramètre producerType valide requis (restaurant, leisure, wellness)' });
           }
           // --- MODIFIED: Use getModel based on producerType ---
           let ProducerModel;
           if (producerType === 'restaurant') {
             ProducerModel = getModel('Producer');
           } else if (producerType === 'leisure') {
             ProducerModel = getModel('LeisureProducer');
           } else if (producerType === 'wellness') {
             ProducerModel = getModel('WellnessPlace') || getModel('BeautyPlace');
           }
           // --- REMOVED: const ProducerModel = getProducerModel(producerType); ---
            if (!ProducerModel) {
                console.error(`❌ Erreur dans getEngagementData: Modèle pour producerType '${producerType}' non trouvé ou non initialisé.`);
                return res.status(500).json({ message: `Modèle pour producerType '${producerType}' non trouvé ou non initialisé.` });
            }
           // --- END MODIFICATION ---

          const { startDate, endDate, prevStartDate, prevEndDate } = getPeriodDates(period);

          // --- Logic potentially moved to analyticsService ---
          // This might get complex, good candidate for the service layer
          const engagementData = await analyticsService.getEngagementMetrics({
              producerId,
              producerType,
              ProducerModel,
              PostModel: Post,
              RatingModel: Rating,
              FollowModel: Follow,
              InteractionModel: Interaction, // Pass Interaction model
              startDate,
              endDate,
              prevStartDate,
              prevEndDate
          });

          res.status(200).json(engagementData);

      } catch (error) {
          console.error(`❌ Erreur dans getEngagementData pour ${req.params.producerId}:`, error);
          res.status(500).json({ message: error.message || 'Erreur lors de la récupération des données d\'engagement' });
     }
   }

}; // End of analyticsController object

module.exports = analyticsController;